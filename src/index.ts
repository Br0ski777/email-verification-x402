import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { DEFAULT_NETWORK, healthResponse, buildPaymentConfig } from "./shared";
import { API_CONFIG } from "./config";
import { registerRoutes } from "./logic";

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

    let facilitatorClient: InstanceType<typeof HTTPFacilitatorClient>;

    // Try CDP facilitator first (mainnet)
    try {
      const { facilitator } = await import("@coinbase/x402");
      facilitatorClient = new HTTPFacilitatorClient(facilitator);
      console.log("[x402] Using Coinbase CDP facilitator (mainnet)");
    } catch {
      // Fallback to x402.org (testnet)
      facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
      console.log("[x402] Fallback to x402.org facilitator (testnet)");
    }

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(DEFAULT_NETWORK, new ExactEvmScheme());

    const paymentConfig = buildPaymentConfig(API_CONFIG.routes);
    app.use("/api/*", paymentMiddleware(paymentConfig, resourceServer));
    console.log(`[x402] ${API_CONFIG.routes.length} paid routes active`);
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
