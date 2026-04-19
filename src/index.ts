import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthResponse, buildPaymentConfig, setupMcp } from "./shared";
import { API_CONFIG } from "./config";
import { registerRoutes } from "./logic";

const app = new Hono();
app.use("*", cors());
app.use("*", logger());

app.get("/", (c) => c.json(healthResponse(API_CONFIG.name)));
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));
setupMcp(app, API_CONFIG);

// ATXP/RFC 9728 — serve PRM on all resource-specific path variants the SDK probes:
//  /.well-known/oauth-protected-resource/{path}  (RFC 9728 suffix)
//  /{path}/.well-known/oauth-protected-resource (legacy)
// The root /.well-known/oauth-protected-resource is handled by the middleware.
function prmPayload(c: any) {
  const origin = new URL(c.req.url).origin;
  return {
    resource: `${origin}/`,
    resource_name: API_CONFIG.name,
    authorization_servers: ["https://auth.atxp.ai"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  };
}
app.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (
    c.req.method === "GET" &&
    (p.startsWith("/.well-known/oauth-protected-resource/") ||
      p.endsWith("/.well-known/oauth-protected-resource"))
  ) {
    return c.json(prmPayload(c));
  }
  return next();
});


async function setupPayments() {
  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/hono");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");
    const { createFacilitatorConfig } = await import("@coinbase/x402");

    // Coinbase CDP facilitator (83% of x402 market) with PayAI fallback
    const cdpConfig = createFacilitatorConfig(
      process.env.CDP_API_KEY_ID || "21c4c238-79d7-48bd-a6a5-7f5899ee9864",
      process.env.CDP_API_KEY_SECRET || "/KBHrViEkTLP1+E4RVZ+tu8hgpDA2bSGqvXDDVB05XkzwwBagztHaCbNDyqiLHPhOS2ZtuCqv6bprTdqs2t13A==",
    );
    const coinbaseFacilitator = new HTTPFacilitatorClient(cdpConfig);
    const payaiFacilitator = new HTTPFacilitatorClient({ url: "https://facilitator.payai.network" });

    const resourceServer = new x402ResourceServer(coinbaseFacilitator, payaiFacilitator)
      .register("eip155:8453", new ExactEvmScheme());
    app.use("/api/*", paymentMiddleware(
      buildPaymentConfig(API_CONFIG.routes, undefined, "eip155:8453"),
      resourceServer
    ));
    console.log("[x402] BASE MAINNET (Coinbase CDP + PayAI) — self-hosted facilitator — " + API_CONFIG.routes.length + " routes");
  } catch (e: any) {
    console.warn("[x402] FREE mode:", e.message);
  }
}

async function setupAtxp() {
  const conn = process.env.ATXP_CONNECTION;
  if (!conn) {
    console.warn("[atxp] ATXP_CONNECTION not set — ATXP payments disabled. Set at accounts.atxp.ai");
    return;
  }
  try {
    const { atxpHono, ATXPAccount } = await import("./atxp-middleware");
    app.use("*", atxpHono({
      destination: new ATXPAccount(conn),
      payeeName: API_CONFIG.name,
    }));
    console.log("[atxp] Enabled — ATXP OAuth + MPP + x402 omni-challenge active");
  } catch (e: any) {
    console.warn("[atxp] Failed to init:", e.message);
  }
}

// ORDER MATTERS: ATXP middleware MUST be registered BEFORE x402 so it can
// intercept ATXP/MPP/OAuth requests first. For non-ATXP requests (no bearer,
// no x-atxp-payment, no payment-signature), it falls through to x402.
await setupAtxp();
await setupPayments();

registerRoutes(app);

Bun.serve({ fetch: app.fetch, port: parseInt(process.env.PORT || "3000", 10) });
console.log("[server] Listening on port " + (process.env.PORT || "3000"));
