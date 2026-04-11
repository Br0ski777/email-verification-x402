import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  WALLET_ADDRESS,
  DEFAULT_NETWORK,
  DEFAULT_FACILITATOR,
  healthResponse,
  buildPaymentConfig,
} from "../../../packages/shared";
import { API_CONFIG } from "./config";
import { registerRoutes } from "./logic";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// Health (free)
app.get("/", (c) => c.json(healthResponse(API_CONFIG.name)));
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// x402 payment middleware — conditionally loaded
async function setupPayments() {
  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/hono");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");

    const facilitatorClient = new HTTPFacilitatorClient({
      url: DEFAULT_FACILITATOR,
    });
    const resourceServer = new x402ResourceServer(facilitatorClient).register(
      DEFAULT_NETWORK,
      new ExactEvmScheme()
    );
    const paymentConfig = buildPaymentConfig(API_CONFIG.routes);
    app.use("/api/*", paymentMiddleware(paymentConfig, resourceServer));
    console.log(`[x402] Payment middleware active — ${API_CONFIG.routes.length} paid routes`);
  } catch (e) {
    console.warn("[x402] Payment packages not installed, running in FREE mode");
  }
}

// Register routes
registerRoutes(app);

// Start
await setupPayments();

export default {
  port: parseInt(process.env.PORT || "3000", 10),
  fetch: app.fetch,
};
