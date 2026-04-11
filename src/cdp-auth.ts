/**
 * Coinbase CDP API JWT Authentication
 *
 * Manual implementation that works in Bun/Docker without @coinbase/cdp-sdk.
 * Reverse-engineered from github.com/coinbase/cdp-sdk typescript/src/auth/utils/jwt.ts
 *
 * JWT spec:
 *   Algorithm: ES256 (ECDSA with P-256 + SHA-256)
 *   Header:    { alg: "ES256", kid: apiKeyId, typ: "JWT", nonce: <random_hex> }
 *   Payload:   { sub: apiKeyId, iss: "cdp", uris: ["METHOD host/path"], iat, nbf, exp }
 *   Lifetime:  120 seconds
 *   Secret:    PEM-encoded EC private key (-----BEGIN EC PRIVATE KEY-----)
 */

import { SignJWT, importPKCS8, importJWK } from "jose";

const CDP_FACILITATOR_HOST = "api.cdp.coinbase.com";
const CDP_FACILITATOR_BASE_PATH = "/platform/v2/x402";
const JWT_LIFETIME_SECONDS = 120;

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Detect key type and import accordingly.
 * CDP keys can be:
 * - 64 bytes base64 = Ed25519 (seed + public) → EdDSA
 * - PEM string = EC P-256 → ES256
 */
async function importCdpKey(secret: string): Promise<{ key: CryptoKey; alg: string }> {
  // Check if it's already PEM format
  if (secret.includes("-----BEGIN")) {
    const key = await importPKCS8(secret, "ES256");
    return { key, alg: "ES256" };
  }

  // Raw base64 — decode and check length
  const rawBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));

  if (rawBytes.length === 64) {
    // Ed25519: first 32 bytes = seed (private key d), last 32 = public key x
    const d = btoa(String.fromCharCode(...rawBytes.slice(0, 32)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const x = btoa(String.fromCharCode(...rawBytes.slice(32)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const key = await importJWK({ kty: "OKP", crv: "Ed25519", d, x }, "EdDSA");
    return { key, alg: "EdDSA" };
  }

  // Try wrapping as PKCS8 PEM
  const b64 = btoa(String.fromCharCode(...rawBytes));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, "ES256");
  return { key, alg: "ES256" };
}

// Cache the imported key to avoid re-importing on every request
let cachedKey: { key: CryptoKey; alg: string } | null = null;

async function generateCdpJwt(
  apiKeyId: string,
  apiKeySecret: string,
  method: string,
  path: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (!cachedKey) {
    cachedKey = await importCdpKey(apiKeySecret);
  }

  const jwt = await new SignJWT({
    sub: apiKeyId,
    iss: "cdp",
    uris: [`${method} ${CDP_FACILITATOR_HOST}${path}`],
  })
    .setProtectedHeader({
      alg: cachedKey.alg,
      kid: apiKeyId,
      typ: "JWT",
      nonce: generateNonce(),
    } as any)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + JWT_LIFETIME_SECONDS)
    .sign(cachedKey.key);

  return jwt;
}

/**
 * Build Authorization headers for a CDP facilitator request.
 *
 * @param apiKeyId     - CDP API Key ID
 * @param apiKeySecret - CDP API Key Secret (PEM EC private key)
 * @param method       - HTTP method
 * @param path         - Full request path
 * @returns Headers object with Authorization and Content-Type
 */
export async function getCdpAuthHeaders(
  apiKeyId: string,
  apiKeySecret: string,
  method: string,
  path: string,
): Promise<Record<string, string>> {
  const jwt = await generateCdpJwt(apiKeyId, apiKeySecret, method, path);
  return {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create the `createAuthHeaders` function expected by x402 facilitator clients.
 * Returns pre-built auth headers for all three CDP facilitator endpoints.
 *
 * Usage with x402 HTTPFacilitatorClient or useFacilitator:
 * ```ts
 * const facilitator = {
 *   url: "https://api.cdp.coinbase.com/platform/v2/x402",
 *   createAuthHeaders: createCdpFacilitatorAuth(apiKeyId, apiKeySecret),
 * };
 * ```
 */
export function createCdpFacilitatorAuth(apiKeyId: string, apiKeySecret: string) {
  return async () => {
    const [verifyHeaders, settleHeaders, supportedHeaders] = await Promise.all([
      getCdpAuthHeaders(
        apiKeyId,
        apiKeySecret,
        "POST",
        `${CDP_FACILITATOR_BASE_PATH}/verify`,
      ),
      getCdpAuthHeaders(
        apiKeyId,
        apiKeySecret,
        "POST",
        `${CDP_FACILITATOR_BASE_PATH}/settle`,
      ),
      getCdpAuthHeaders(
        apiKeyId,
        apiKeySecret,
        "GET",
        `${CDP_FACILITATOR_BASE_PATH}/supported`,
      ),
    ]);

    return {
      verify: verifyHeaders,
      settle: settleHeaders,
      supported: supportedHeaders,
    };
  };
}

/**
 * Standalone helper: make an authenticated request to the CDP facilitator.
 *
 * @param apiKeyId     - CDP API Key ID
 * @param apiKeySecret - CDP API Key Secret (PEM EC private key)
 * @param endpoint     - "verify" | "settle" | "supported"
 * @param body         - Request body (for POST endpoints)
 * @returns The fetch Response
 */
export async function cdpFacilitatorFetch(
  apiKeyId: string,
  apiKeySecret: string,
  endpoint: "verify" | "settle" | "supported",
  body?: unknown,
): Promise<Response> {
  const method = endpoint === "supported" ? "GET" : "POST";
  const path = `${CDP_FACILITATOR_BASE_PATH}/${endpoint}`;
  const url = `https://${CDP_FACILITATOR_HOST}${path}`;

  const headers = await getCdpAuthHeaders(apiKeyId, apiKeySecret, method, path);

  return fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
