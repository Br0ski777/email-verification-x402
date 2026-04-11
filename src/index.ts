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
    const { facilitator } = await import("@coinbase/x402");

    // CDP facilitator — reads CDP_API_KEY_ID + CDP_API_KEY_SECRET from env
    const facilitatorClient = new HTTPFacilitatorClient(facilitator);
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(DEFAULT_NETWORK, new ExactEvmScheme());

    const paymentConfig = buildPaymentConfig(API_CONFIG.routes);
    app.use("/api/*", paymentMiddleware(paymentConfig, resourceServer));
    console.log(`[x402] BASE MAINNET — CDP facilitator — ${API_CONFIG.routes.length} paid routes`);
  } catch (e: any) {
    console.warn("[x402] Payment setup failed, running FREE:", e.message);
  }
}

registerRoutes(app);
await setupPayments();

export default {
  port: parseInt(process.env.PORT || "3000", 10),
  fetch: app.fetch,
};
