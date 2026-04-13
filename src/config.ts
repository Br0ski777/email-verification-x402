import type { ApiConfig } from "./shared";

export const API_CONFIG: ApiConfig = {
  name: "email-verification",
  slug: "email-verification",
  description: "Real-time email verification API. Syntax, MX, disposable detection, role-based flags, quality score 0-100. Built for agent outreach pipelines.",
  version: "1.0.0",
  routes: [
    {
      method: "POST",
      path: "/api/verify",
      price: "$0.002",
      description: "Verify a single email address",
      toolName: "email_verify_address",
      toolDescription: `Use this when you need to check if an email address is valid and deliverable. Returns a structured JSON report with quality score 0-100.

1. valid (boolean) -- overall verdict
2. syntax (boolean) -- RFC 5322 format check
3. mx (boolean) -- domain has working mail servers
4. disposable (boolean) -- Mailinator, Guerrilla Mail, 100+ throwaway providers
5. role (boolean) -- role-based address (admin@, info@, support@)
6. free (boolean) -- free provider (Gmail, Yahoo, Outlook)
7. score (number 0-100) -- composite quality score

Example output: {"valid":true,"syntax":true,"mx":true,"disposable":false,"role":false,"free":true,"score":85,"email":"john@gmail.com"}

Use this BEFORE sending outreach emails, adding contacts to CRM, or processing signups. Essential for cleaning email lists, detecting fake registrations, and qualifying leads.

Do NOT use for finding emails -- use email_find_by_name instead. Do NOT use for person data -- use person_enrich_from_email instead. Do NOT use for domain deliverability audit (SPF/DKIM/DMARC) -- use email_audit_deliverability instead.`,
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
      toolDescription: `Use this when you need to validate multiple email addresses at once (up to 100). Returns a JSON array of verification results plus summary counts.

1. results (array) -- each entry has valid, syntax, mx, disposable, role, free, score
2. summary.total (number) -- total emails processed
3. summary.valid (number) -- count of valid emails
4. summary.invalid (number) -- count of invalid emails
5. summary.disposable (number) -- count of disposable addresses caught

Example output: {"results":[{"email":"a@test.com","valid":true,"score":90},{"email":"b@mailinator.com","valid":false,"score":10}],"summary":{"total":2,"valid":1,"invalid":1,"disposable":1}}

Use this FOR bulk list cleaning, CRM hygiene, or pre-campaign validation. Essential when you have 5+ emails to verify at once.

Do NOT use for single emails -- use email_verify_address instead. Do NOT use for finding emails -- use email_find_by_name instead.`,
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
