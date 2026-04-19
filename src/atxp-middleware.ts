import type { Context, MiddlewareHandler } from "hono";
import {
  buildServerConfig,
  getResource,
  getProtectedResourceMetadata,
  sendProtectedResourceMetadataWebApi,
  getOAuthMetadata,
  sendOAuthMetadataWebApi,
  detectProtocol,
  checkTokenWebApi,
  parseCredentialBase64,
  sendOAuthChallengeWebApi,
  withATXPContext,
  ProtocolSettlement,
  verifyOpaqueIdentity,
  buildX402Requirements,
  omniChallengeHttpResponse,
  requirePayment,
  type ATXPArgs,
} from "@atxp/server";
import BigNumber from "bignumber.js";

export { requirePayment, ATXPAccount } from "@atxp/server";
export type { ATXPArgs } from "@atxp/server";

export interface AtxpHonoArgs extends ATXPArgs {
  /**
   * RegExp matching paths that require payment.
   * Only these paths trigger the full ATXP auth+payment flow.
   * Unmatched paths pass through to downstream middleware.
   * Default: /^\/api\//
   */
  protectedPathPattern?: RegExp;
  /**
   * Lookup price (USDC) for a request. If undefined or returns null,
   * the middleware falls through to downstream payment middleware
   * (e.g., @x402/hono) without emitting its own payment challenge.
   */
  priceForRequest?: (method: string, path: string) => number | null;
}

/**
 * Hono middleware for ATXP payment protocol.
 *
 * Flow:
 * 1. Serve OAuth metadata endpoints (/.well-known/*).
 * 2. For unprotected paths, call next() unchanged.
 * 3. For protected paths:
 *    - X-PAYMENT header present (pure x402) → let downstream x402/hono handle
 *    - No Authorization + no X-PAYMENT → emit 401 OAuth challenge (force OAuth flow)
 *    - Authorization present but invalid → 401 OAuth challenge
 *    - Authorization valid → settle credential if any, then call requirePayment()
 *      inside ATXP context; catch any McpError(-30402) thrown by requirePayment
 *      and convert to a 402 omni-challenge HTTP response.
 *
 * Requires env var ATXP_CONNECTION (https://accounts.atxp.ai).
 */
export function atxpHono(args: AtxpHonoArgs): MiddlewareHandler {
  const config = buildServerConfig(args);
  const logger = config.logger;
  const protectedPattern = args.protectedPathPattern ?? /^\/api\//;
  const priceLookup = args.priceForRequest;

  return async (c: Context, next) => {
    try {
      const request = c.req.raw;
      const requestUrl = new URL(c.req.url);
      const pathname = requestUrl.pathname;
      const headersObj = Object.fromEntries(request.headers);

      // 1. OAuth / PRM metadata endpoints.
      const resource = getResource(config, requestUrl, headersObj);
      const prmResponse = getProtectedResourceMetadata(config, requestUrl, headersObj);
      const prmOut = sendProtectedResourceMetadataWebApi(prmResponse);
      if (prmOut) return prmOut;

      const oAuthMetadata = await getOAuthMetadata(config, requestUrl);
      const oMetaOut = sendOAuthMetadataWebApi(oAuthMetadata);
      if (oMetaOut) return oMetaOut;

      // 1b. Fix Bug A: serve PRM for any resource-specific path the ATXP SDK
      // may point to (path-suffix and legacy formats per RFC 9728).
      if (
        pathname.startsWith("/.well-known/oauth-protected-resource/") ||
        pathname.endsWith("/.well-known/oauth-protected-resource") ||
        pathname.endsWith("/.well-known/oauth-authorization-server")
      ) {
        const origin = requestUrl.origin;
        if (pathname.includes("oauth-authorization-server")) {
          return new Response(
            JSON.stringify(
              oAuthMetadata ?? {
                issuer: config.server,
                authorization_endpoint: `${config.server}/authorize`,
                token_endpoint: `${config.server}/token`,
              },
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            resource: `${origin}/`,
            resource_name: config.payeeName,
            authorization_servers: [config.server],
            bearer_methods_supported: ["header"],
            scopes_supported: ["read", "write"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // 2. If this path isn't payment-gated, pass through.
      if (!protectedPattern.test(pathname)) {
        return next();
      }

      // 3. Pure x402 request (X-PAYMENT header, no bearer)?  Let the existing
      // @x402/hono middleware handle it for backward compatibility.
      const authHeader = request.headers.get("authorization") ?? undefined;
      const xPayment = request.headers.get("x-payment") ?? undefined;
      const xAtxpPayment = request.headers.get("x-atxp-payment") ?? undefined;
      const paymentSignature = request.headers.get("payment-signature") ?? undefined;

      if (xPayment && !authHeader && !xAtxpPayment && !paymentSignature) {
        return next();
      }

      // 4. Detect credential + verify bearer (if any).
      const detected = detectProtocol({
        "x-atxp-payment": xAtxpPayment,
        "payment-signature": paymentSignature,
        "x-payment": xPayment,
        authorization: authHeader,
      });

      let tokenCheck = await checkTokenWebApi(config, resource, request);
      let user = tokenCheck.data?.sub ?? null;

      // 4b. Recover MPP opaque identity if bearer failed but MPP credential present.
      if (detected && detected.protocol === "mpp" && !tokenCheck.passes) {
        const parsed = parseCredentialBase64(detected.credential);
        const challenge = parsed?.challenge;
        if (challenge?.opaque && challenge?.id) {
          const recoveredSub = verifyOpaqueIdentity(challenge.opaque, challenge.id);
          if (recoveredSub) {
            user = recoveredSub;
            tokenCheck = { passes: true, data: { sub: recoveredSub }, token: null } as any;
          }
        }
      }

      // 5. If we still have no user, emit OAuth challenge (401).
      if (!user) {
        const chal = sendOAuthChallengeWebApi(tokenCheck);
        if (chal) return chal;
        return c.json({ error: "unauthorized" }, 401);
      }

      // 6. Settle credential immediately (credits ATXP ledger before route runs).
      if (detected) {
        try {
          const destinationAccountId = await config.destination.getAccountId();
          const context: any = { destinationAccountId, sourceAccountId: user };
          if (detected.protocol === "x402") {
            const parsed = parseCredentialBase64(detected.credential);
            if (parsed?.accepted) context.paymentRequirements = parsed.accepted;
          }
          const settlement = new ProtocolSettlement(
            config.server,
            logger,
            fetch.bind(globalThis),
            destinationAccountId,
          );
          const result = await settlement.settle(
            detected.protocol,
            detected.credential,
            context,
          );
          logger.info(
            `[atxp-hono] Settled ${detected.protocol}: txHash=${result.txHash} amount=${result.settledAmount}`,
          );
        } catch (error) {
          logger.warn(
            `[atxp-hono] Settlement failed for ${detected.protocol}: ${
              error instanceof Error ? error.message : String(error)
            } — will re-challenge`,
          );
        }
      }

      // 7. Run handler inside ATXP context, catching payment challenges
      //    (McpError with code -30402) and converting to 402 omni-challenge HTTP response.
      return await withATXPContext(config, resource, tokenCheck, async () => {
        try {
          // 7a. If we know the price for this route, gate here BEFORE the route
          //     handler runs so the omni-challenge is always emitted consistently.
          const price = priceLookup?.(request.method, pathname);
          if (price !== undefined && price !== null && price > 0) {
            await requirePayment({ price: BigNumber(price) });
          }
          // 7b. Let the route handler run.
          await next();
          return c.res;
        } catch (error: any) {
          if (error?.code === -30402 && error?.data) {
            const d = error.data;
            if (d.paymentRequestId && d.x402) {
              const chargeAmount = d.chargeAmount ? BigNumber(d.chargeAmount) : undefined;
              const http = omniChallengeHttpResponse(
                config.server,
                d.paymentRequestId,
                chargeAmount,
                d.x402,
                d.mpp,
              );
              return new Response(http.body, {
                status: http.status,
                headers: http.headers,
              });
            }
          }
          throw error;
        }
      });
    } catch (error) {
      logger.error(
        `[atxp-hono] Critical error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return c.json(
        { error: "server_error", error_description: "Internal ATXP middleware error" },
        500,
      );
    }
  };
}
