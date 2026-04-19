import type { Hono } from "hono";
import { Resolver } from "dns/promises";

// Payment is enforced upstream by the atxpHono middleware (via priceForRequest)
// and by @x402/hono for pure x402 clients. Route handlers below run only after
// payment has settled — no per-route payment call is needed here.

// ---------------------------------------------------------------------------
// Disposable email domains (top 100+)
// ---------------------------------------------------------------------------
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "guerrillamail.info", "guerrillamail.de", "guerrillamail.net",
  "guerrillamail.org", "dispostable.com", "mailnesia.com", "maildrop.cc",
  "discard.email", "mailcatch.com", "trashmail.com", "trashmail.me",
  "trashmail.net", "trashmail.org", "tempr.email", "temp-mail.org",
  "tempail.com", "tempmailo.com", "mohmal.com", "burnermail.io",
  "getnada.com", "10minutemail.com", "10minutemail.net", "minutemail.com",
  "emailondeck.com", "fakeinbox.com", "mailexpire.com", "mailforspam.com",
  "safetymail.info", "filzmail.com", "spamgourmet.com", "spamfree24.org",
  "mytrashmail.com", "mailnull.com", "jetable.org", "trash-mail.com",
  "trash-mail.at", "getairmail.com", "mailsac.com", "harakirimail.com",
  "33mail.com", "maildu.de", "meltmail.com", "spamhereplease.com",
  "spaml.com", "uggsrock.com", "mailmetrash.com", "thankyou2010.com",
  "binkmail.com", "bobmail.info", "chammy.info", "devnullmail.com",
  "e4ward.com", "emailigo.de", "emailthe.net", "ephemail.net",
  "etranquil.com", "etranquil.net", "etranquil.org", "gishpuppy.com",
  "kasmail.com", "kurzepost.de", "objectmail.com", "proxymail.eu",
  "rcpt.at", "reallymymail.com", "receiveee.com", "regbypass.com",
  "tittbit.in", "tradermail.info", "veryrealemail.com", "wh4f.org",
  "yopmail.fr", "yopmail.net", "zehnminuten.de", "tempinbox.com",
  "spamcowboy.com", "spamcowboy.net", "spamcowboy.org", "nowmymail.com",
  "brefmail.com", "mailzilla.com", "crazymailing.com",
  "disposableaddress.com", "sogetthis.com", "mailinater.com", "trbvm.com",
  "mailnator.com", "sneakemail.com", "temporaryforwarding.com",
  "incognitomail.org", "mailtemp.info", "tempomail.fr", "eyepaste.com",
  "20minutemail.com", "guerrillamail.biz", "tempmailer.com",
  "throwam.com", "mailcatch.xyz", "tempinbox.xyz",
]);

// Common role-based prefixes (not personal emails)
const ROLE_PREFIXES = new Set([
  "admin", "info", "contact", "support", "sales", "help", "noreply",
  "no-reply", "webmaster", "postmaster", "abuse", "billing", "marketing",
  "hello", "office", "team", "hr", "jobs", "careers", "press", "media",
]);

// Free email providers
const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "gmx.com", "live.com", "msn.com", "me.com", "inbox.com",
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const resolver = new Resolver();

interface VerifyResult {
  email: string;
  valid: boolean;
  syntax: boolean;
  mx_found: boolean;
  disposable: boolean;
  role_based: boolean;
  free_provider: boolean;
  domain: string;
  mx_records: string[];
  quality_score: number;
  reason: string | null;
}

async function verifyEmail(email: string): Promise<VerifyResult> {
  const trimmed = email.trim().toLowerCase();
  const domain = trimmed.split("@")[1] ?? "";
  const local = trimmed.split("@")[0] ?? "";

  // Syntax check
  const syntax = EMAIL_REGEX.test(trimmed) && trimmed.length <= 254;
  if (!syntax) {
    return {
      email: trimmed, valid: false, syntax: false, mx_found: false,
      disposable: false, role_based: false, free_provider: false,
      domain, mx_records: [], quality_score: 0, reason: "Invalid syntax",
    };
  }

  // Disposable check
  const disposable = DISPOSABLE_DOMAINS.has(domain);

  // Role-based check
  const role_based = ROLE_PREFIXES.has(local.split(".")[0] ?? "");

  // Free provider check
  const free_provider = FREE_PROVIDERS.has(domain);

  // MX records check
  let mx_found = false;
  let mx_records: string[] = [];
  try {
    const records = await resolver.resolveMx(domain);
    mx_records = records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    mx_found = mx_records.length > 0;
  } catch {
    mx_found = false;
  }

  // Quality score (0-100)
  let quality_score = 0;
  if (syntax) quality_score += 20;
  if (mx_found) quality_score += 40;
  if (!disposable) quality_score += 20;
  if (!role_based) quality_score += 10;
  if (!free_provider) quality_score += 10;

  const valid = syntax && mx_found && !disposable;
  let reason: string | null = null;
  if (!syntax) reason = "Invalid syntax";
  else if (!mx_found) reason = "No MX records found for domain";
  else if (disposable) reason = "Disposable/temporary email domain";

  return {
    email: trimmed, valid, syntax, mx_found, disposable, role_based,
    free_provider, domain, mx_records, quality_score, reason,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export function registerRoutes(app: Hono) {
  app.post("/api/verify", async (c) => {
    const body = await c.req.json<{ email?: string }>();
    if (!body.email) {
      return c.json({ error: "Missing 'email' field in request body" }, 400);
    }
    const result = await verifyEmail(body.email);
    return c.json(result);
  });

  app.post("/api/verify/batch", async (c) => {
    const body = await c.req.json<{ emails?: string[] }>();
    if (!body.emails || !Array.isArray(body.emails)) {
      return c.json({ error: "Missing 'emails' array in request body" }, 400);
    }
    if (body.emails.length > 100) {
      return c.json({ error: "Maximum 100 emails per batch request" }, 400);
    }
    const results = await Promise.all(body.emails.map(verifyEmail));
    return c.json({
      results,
      count: results.length,
      valid_count: results.filter((r) => r.valid).length,
      invalid_count: results.filter((r) => !r.valid).length,
    });
  });
}
