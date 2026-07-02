# Email Verification API

[![MCP Server](https://img.shields.io/badge/MCP-server-blue)](https://email-verification.api.klymax402.com/mcp)
[![x402](https://img.shields.io/badge/payments-x402-6E56CF)](https://x402.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Real-time email verification API. Syntax, MX, disposable detection, role-based flags, quality score 0-100. Built for agent outreach pipelines. Pay-per-call via [x402](https://x402.org) (USDC on Base L2) -- no API key, no signup, no rate-limit wall.

Part of the [klymax402](https://klymax402.com) marketplace -- 100 x402 micropayment APIs for AI agents, one wallet, USDC on Base.

## Quickstart -- MCP

Add to your MCP client config (Claude Desktop, Cursor, ElizaOS, etc.):

```json
{
  "mcpServers": {
    "email-verification": {
      "url": "https://email-verification.api.klymax402.com/mcp"
    }
  }
}
```

## Quickstart -- HTTP (x402)

```bash
curl -X POST "https://email-verification.api.klymax402.com/api/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# -> 402 Payment Required, with an x402 payment challenge in the response body
```

Any x402-aware client ([`@x402/fetch`](https://www.npmjs.com/package/@x402/fetch), [`x402-agent-tools`](https://www.npmjs.com/package/x402-agent-tools), ATXP) handles the 402 -> sign -> retry cycle automatically.

## Tools

| Tool | Method | Path | Price | Description |
|---|---|---|---|---|
| `email_verify_address` | POST | `/api/verify` | $0.002 | Verify a single email address |
| `email_verify_batch` | POST | `/api/verify/batch` | $0.015 | Verify up to 100 email addresses in batch |

### `email_verify_address`

Verify email deliverability in real-time. Alternative to Hunter email-verifier at 15x lower cost. Returns a structured JSON report with syntax, MX, disposable detection, role-based flags, and quality score 0-100.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `email` | string | yes | Email address to verify (e.g. user@example.com) |

Example response:

```json
{"valid":true,"syntax":true,"mx":true,"disposable":false,"role":false,"free":true,"score":85,"email":"john@gmail.com"}
```

**When to use**: sending outreach emails, adding contacts to CRM, or processing signups. Essential for verifying email deliverability, cleaning email lists, detecting fake registrations, and qualifying leads. Drop-in replacement for Hunter email verification.

**Not for**: finding emails (use `email_find_by_name`), person data (use `person_enrich_from_email`), domain deliverability audit (SPF/DKIM/DMARC) (use `email_audit_deliverability`).

### `email_verify_batch`

Use this when you need to validate multiple email addresses at once (up to 100). Returns a JSON array of verification results plus summary counts.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `emails` | array | yes | Array of email addresses (max 100) |

Example response:

```json
{"results":[{"email":"a@test.com","valid":true,"score":90},{"email":"b@mailinator.com","valid":false,"score":10}],"summary":{"total":2,"valid":1,"invalid":1,"disposable":1}}
```

**When to use**: bulk list cleaning, CRM hygiene, or pre-campaign validation. Essential when you have 5+ emails to verify at once.

**Not for**: single emails (use `email_verify_address`), finding emails (use `email_find_by_name`).

## Example agent prompts

- "Verify email deliverability in real-time"
- "Validate multiple email addresses at once (up to 100)"

## Payment

- Protocol: [x402](https://x402.org) -- HTTP-native pay-per-call, no signup, no API key
- Network: Base L2 (`eip155:8453`)
- Asset: USDC
- Facilitator: Coinbase CDP (primary), PayAI (fallback)
- Also reachable via [ATXP](https://atxp.ai) (OAuth-wrapped x402, RFC 9728 protected-resource metadata)

## Part of klymax402

100 x402 micropayment APIs for AI agents -- one wallet, USDC on Base, zero signup.

- Catalog: https://klymax402.com/llms.txt
- Full API reference: https://klymax402.com/llms-full.txt
- Live stats: https://klymax402.com/stats

## License

MIT
