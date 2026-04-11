import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { DEFAULT_NETWORK, BASE_SEPOLIA, healthResponse, buildPaymentConfig } from "./shared";
import { API_CONFIG } from "./config";
import { registerRoutes } from "./logic";

const app = new Hono();
app.use("*", cors());
app.use("*", logger());

// Register business routes FIRST (before payment middleware)
registerRoutes(app);

app.get("/", (c) => c.json(healthResponse(API_CONFIG.name)));
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

async function setupPayments() {
  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/hono");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");

    let facilitatorClient: InstanceType<typeof HTTPFacilitatorClient>;
    let network = DEFAULT_NETWORK;

    const cdpKeyId = process.env.CDP_API_KEY_ID;
    const cdpKeySecret = process.env.CDP_API_KEY_SECRET;

    if (cdpKeyId && cdpKeySecret) {
      try {
        const { createCdpFacilitatorAuth } = await import("./cdp-auth");
        facilitatorClient = new HTTPFacilitatorClient({
          url: "https://api.cdp.coinbase.com/platform/v2/x402",
          createAuthHeaders: createCdpFacilitatorAuth(cdpKeyId, cdpKeySecret),
        });
        console.log("[x402] CDP facilitator — Base mainnet");
      } catch (cdpErr: any) {
        console.warn("[x402] CDP auth failed, falling back to testnet:", cdpErr.message);
        facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
        network = BASE_SEPOLIA;
      }
    } else {
      facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
      network = BASE_SEPOLIA;
      console.log("[x402] No CDP credentials, using x402.org testnet");
    }

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(network, new ExactEvmScheme());

    app.use("/api/*", paymentMiddleware(buildPaymentConfig(API_CONFIG.routes), resourceServer));
    console.log(`[x402] ${API_CONFIG.routes.length} paid routes on ${network}`);
  } catch (e: any) {
    console.warn("[x402] Payment middleware failed, running FREE:", e.message);
  }
}

await setupPayments();

export default {
  port: parseInt(process.env.PORT || "3000", 10),
  fetch: app.fetch,
};
