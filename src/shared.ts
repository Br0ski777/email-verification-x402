export const WALLET_ADDRESS = "0x6E8B64638b24C6D625b045dD353120d850064E2E";
export const BASE_MAINNET = "eip155:8453";
export const BASE_SEPOLIA = "eip155:84532";
export const DEFAULT_NETWORK = BASE_SEPOLIA;
export const DEFAULT_FACILITATOR = "https://x402.org/facilitator";

// Coinbase CDP credentials for production facilitator
export const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID || "9002bdcc-491e-4165-af31-325019b0f864";
export const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET || "wDKMu78W0wYZBQgT8ybdVQTkEW+wQ3GR2RIVNB1WY0lQPBAxucXblYZSei06s2u+z6f+dezh4EHCOwNbSdUSiQ==";

export interface RouteConfig {
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
  mimeType?: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}

export interface ApiConfig {
  name: string;
  slug: string;
  description: string;
  version: string;
  routes: RouteConfig[];
}

export function buildPaymentConfig(routes: RouteConfig[], payTo = WALLET_ADDRESS, network = DEFAULT_NETWORK) {
  const config: Record<string, unknown> = {};
  for (const route of routes) {
    config[`${route.method} ${route.path}`] = {
      accepts: [{ scheme: "exact", price: route.price, network, payTo }],
      description: route.description,
      mimeType: route.mimeType ?? "application/json",
    };
  }
  return config;
}

export function buildMcpTools(routes: RouteConfig[]) {
  return routes.map((r) => ({
    name: r.toolName,
    description: r.toolDescription,
    inputSchema: r.inputSchema,
    _route: { method: r.method, path: r.path },
  }));
}

export function healthResponse(apiName: string) {
  return { api: apiName, status: "online", protocol: "x402", network: "base-mainnet", timestamp: new Date().toISOString() };
}
