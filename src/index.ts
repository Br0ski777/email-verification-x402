import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { DEFAULT_NETWORK, healthResponse, buildPaymentConfig } from "./shared";
import { API_CONFIG } from "./config";
import { registerRoutes } from "./logic";
import { createCdpFacilitatorAuth } from "./cdp-auth";

const app = new Hono();
app.use("*", cors());
app.use("*", logger());

app.get("/", (c) => c.json(healthResponse(API_CONFIG.name)));
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

async function setupPayments() {
  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/hono");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");

    const cdpKeyId = process.env.CDP_API_KEY_ID;
    const cdpKeySecret = process.env.CDP_API_KEY_SECRET;

    let facilitatorClient: InstanceType<typeof HTTPFacilitatorClient>;

    if (cdpKeyId && cdpKeySecret) {
      // Production: CDP facilitator with JWT auth (Base mainnet)
      facilitatorClient = new HTTPFacilitatorClient({
        url: "https://api.cdp.coinbase.com/platform/v2/x402",
        createAuthHeaders: createCdpFacilitatorAuth(cdpKeyId, cdpKeySecret),
      });
      console.log("[x402] CDP facilitator — Base mainnet");
    } else {
      // Fallback: x402.org (testnet only)
      facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
      console.log("[x402] x402.org facilitator — testnet fallback");
    }

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(DEFAULT_NETWORK, new ExactEvmScheme());

    app.use("/api/*", paymentMiddleware(buildPaymentConfig(API_CONFIG.routes), resourceServer));
    console.log(`[x402] ${API_CONFIG.routes.length} paid routes active on ${DEFAULT_NETWORK}`);
  } catch (e: any) {
    console.warn("[x402] Payment setup failed, FREE mode:", e.message);
  }
}

registerRoutes(app);
await setupPayments();

export default {
  port: parseInt(process.env.PORT || "3000", 10),
  fetch: app.fetch,
};
