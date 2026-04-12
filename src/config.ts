import type { ApiConfig } from "./shared";

export const API_CONFIG: ApiConfig = {
  name: "email-verification",
  slug: "email-verification",
  description: "Verify email addresses in real-time. Syntax, MX records, disposable detection, quality scoring.",
  version: "1.0.0",
  routes: [
    {
      method: "POST",
      path: "/api/verify",
      price: "$0.002",
      description: "Verify a single email address",
      toolName: "email_verify_address",
      toolDescription: "Use this when you need to check if an email address is valid and deliverable. Returns: validity status, syntax check, MX record lookup, disposable domain detection (100+ providers like Mailinator, Guerrilla Mail), role-based detection (admin@, info@), free provider flag (Gmail, Yahoo), and quality score 0-100. Do NOT use for sending emails. Ideal for cleaning email lists, verifying contacts before outreach, or detecting fake signups.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email address to verify (e.g. user@example.com)" },
        },
        required: ["email"],
      },
    },
    {
      method: "POST",
      path: "/api/verify/batch",
      price: "$0.015",
      description: "Verify up to 100 email addresses in batch",
      toolName: "email_verify_batch",
      toolDescription: "Use this when you need to validate multiple email addresses at once (up to 100). Same checks as email_verify_address but in bulk. Returns array of results plus valid/invalid counts. Do NOT use for single emails.",
      inputSchema: {
        type: "object",
        properties: {
          emails: { type: "array", items: { type: "string" }, description: "Array of email addresses (max 100)" },
        },
        required: ["emails"],
      },
    },
  ],
};
