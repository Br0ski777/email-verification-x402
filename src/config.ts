import type { ApiConfig } from "./shared";

export const API_CONFIG: ApiConfig = {
  name: "email-verification",
  slug: "email-verification",
  description:
    "Verify email addresses in real-time. Checks syntax, MX records, disposable domain detection, and deliverability scoring. 8x cheaper than ZeroBounce.",
  version: "1.0.0",
  routes: [
    {
      method: "POST",
      path: "/api/verify",
      price: "$0.002",
      description: "Verify a single email address",
      toolName: "verify_email",
      toolDescription:
        "Verify if an email address is valid and deliverable. Checks syntax format, MX DNS records, disposable/temporary domain detection (100+ domains), and returns a quality score. Use when you need to validate an email before sending, clean an email list, check if a contact email is real, or detect fake signups. Returns JSON with valid (boolean), syntax, mx_found, disposable, domain, mx_records, and quality_score fields.",
      inputSchema: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "The email address to verify (e.g. user@example.com)",
          },
        },
        required: ["email"],
      },
    },
    {
      method: "POST",
      path: "/api/verify/batch",
      price: "$0.015",
      description: "Verify up to 100 email addresses in batch",
      toolName: "verify_emails_batch",
      toolDescription:
        "Verify multiple email addresses in a single request (up to 100). Same checks as verify_email but for bulk validation. Use when you need to clean an email list, validate a CSV of contacts, or audit a mailing list for bounces. Returns an array of results, one per email.",
      inputSchema: {
        type: "object",
        properties: {
          emails: {
            type: "array",
            items: { type: "string" },
            description: "Array of email addresses to verify (max 100)",
          },
        },
        required: ["emails"],
      },
    },
  ],
};
