# refund.decide.fyi

> Deterministic refund eligibility notary for US consumer subscriptions

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://refund.decide.fyi)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)

## Quick Start

```bash
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual"}'
```

**Response:** `{"refundable":true,"verdict":"ALLOWED","code":"WITHIN_WINDOW",...}`

No auth required. 100 req/min rate limit. [See all examples →](client/EXAMPLES.md)

---

## Overview

**refund.decide.fyi** is a stateless, deterministic API that provides authoritative refund eligibility signals for US consumer subscriptions. It returns one of three verdicts:

- **ALLOWED** - Refund is within the vendor's refund window
- **DENIED** - Refund window has expired or vendor doesn't offer refunds
- **UNKNOWN** - Unable to determine eligibility (unsupported vendor, region, or plan)

Perfect for:
- AI agents that need reliable refund policy data
- Customer support tools
- Financial applications
- Subscription management platforms

## API Endpoints

### REST API

**Endpoint:** `https://refund.decide.fyi/api/v1/refund/eligibility`

**Method:** POST

**Request Body:**
```json
{
  "vendor": "adobe",
  "days_since_purchase": 12,
  "region": "US",
  "plan": "individual"
}
```

**Response (Success):**
```json
{
  "refundable": true,
  "verdict": "ALLOWED",
  "code": "WITHIN_WINDOW",
  "message": "Refund is allowed. Purchase is 12 day(s) old, within 14 day window.",
  "rules_version": "2026-01-15",
  "vendor": "adobe",
  "window_days": 14,
  "days_since_purchase": 12
}
```

**Response (Denied):**
```json
{
  "refundable": false,
  "verdict": "DENIED",
  "code": "OUTSIDE_WINDOW",
  "message": "Refund window expired. Purchase is 20 day(s) old, exceeds 14 day window.",
  "rules_version": "2026-01-15",
  "vendor": "adobe",
  "window_days": 14,
  "days_since_purchase": 20
}
```

**Response (No Refunds):**
```json
{
  "refundable": false,
  "verdict": "DENIED",
  "code": "NO_REFUNDS",
  "message": "spotify does not offer refunds for individual plans",
  "rules_version": "2026-01-15",
  "vendor": "spotify",
  "window_days": 0
}
```

### MCP Server

**Endpoint:** `https://refund.decide.fyi/api/mcp`

**Protocol:** Model Context Protocol (JSON-RPC 2.0)

**Tool Name:** `refund_eligibility`

The MCP server implements the full MCP specification with the following methods:
- `initialize` - Protocol negotiation
- `tools/list` - List available tools
- `tools/call` - Execute refund eligibility check

## Supported Vendors

| Vendor | Identifier | Refund Window |
|--------|-----------|---------------|
| Adobe | `adobe` | 14 days |
| Apple App Store | `apple_app_store` | 14 days |
| Canva | `canva` | No refunds |
| Dropbox (US) | `dropbox_us` | No refunds |
| Google Play | `google_play` | 2 days |
| Microsoft 365 | `microsoft_365` | 30 days |
| Netflix | `netflix` | No refunds |
| Notion | `notion` | 3 days |
| Spotify | `spotify` | No refunds |

**Note:** Currently supports US region and individual plans only.

## Response Codes

| Code | Description |
|------|-------------|
| `WITHIN_WINDOW` | Purchase is within refund window - refund allowed |
| `OUTSIDE_WINDOW` | Purchase exceeds refund window - refund denied |
| `NO_REFUNDS` | Vendor does not offer refunds for this plan type |
| `UNSUPPORTED_VENDOR` | Vendor not in our database |
| `NON_US_REGION` | Region other than US (not yet supported) |
| `NON_INDIVIDUAL_PLAN` | Plan type other than individual (not yet supported) |
| `INVALID_DAYS_SINCE_PURCHASE` | days_since_purchase must be non-negative number |
| `MISSING_VENDOR` | vendor field is required |
| `MISSING_REGION` | region field is required |
| `MISSING_PLAN` | plan field is required |

## Usage Examples

### cURL

```bash
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{
    "vendor": "adobe",
    "days_since_purchase": 12,
    "region": "US",
    "plan": "individual"
  }'
```

### JavaScript (fetch)

```javascript
const response = await fetch('https://refund.decide.fyi/api/v1/refund/eligibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    vendor: 'adobe',
    days_since_purchase: 12,
    region: 'US',
    plan: 'individual'
  })
});

const result = await response.json();
console.log(result.verdict); // "ALLOWED" or "DENIED" or "UNKNOWN"
```

### Node.js Client

Requires Node 18+.

```bash
node client/refund-auditor.js adobe 12
node client/refund-auditor.js spotify 1
node client/refund-auditor.js microsoft_365 25
```

### Python

```python
import requests

response = requests.post('https://refund.decide.fyi/api/v1/refund/eligibility', json={
    'vendor': 'adobe',
    'days_since_purchase': 12,
    'region': 'US',
    'plan': 'individual'
})

result = response.json()
print(f"Verdict: {result['verdict']}")
```

## Error Handling

### HTTP Status Codes

- `200` - Success (check `verdict` field for eligibility result)
- `400` - Bad Request (invalid JSON or malformed request)
- `405` - Method Not Allowed (only POST is supported)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "ok": false,
  "request_id": "abc123",
  "error": "INVALID_JSON",
  "message": "Request body must be valid JSON"
}
```

## Architecture

- **Stateless** - No database, no sessions, no side effects
- **Deterministic** - Same input always produces same output
- **Versioned Rules** - Rules file includes version for tracking changes
- **Serverless** - Runs on Vercel Edge Functions for global low latency
- **Zero Dependencies** - Core compute logic has no external dependencies

## Data Sources

Refund policy data is compiled from official vendor documentation and terms of service. Data is manually curated and verified. Rules version is updated whenever policy changes are detected.

**Last updated:** 2026-01-15

## Limitations

- **US Only** - Currently only supports US region
- **Individual Plans Only** - Business/enterprise plans not yet supported
- **Calendar Days** - Refund windows are based on calendar days, not business days
- **No Pro-rating** - Does not calculate partial refunds or pro-rated amounts
- **Static Rules** - Does not account for promotional offers or special circumstances

## Changelog

### v1.0.0 (2026-01-15)

**Added:**
- Initial release
- REST API endpoint
- MCP server implementation
- Support for 9 major vendors (Adobe, Spotify, Netflix, Microsoft 365, Apple App Store, Google Play, Notion, Canva, Dropbox)
- Comprehensive input validation
- Descriptive error messages
- Shared compute module

**Fixed:**
- Removed broken Amazon Prime vendor
- Removed unused `mode` field from rules
- Improved error handling and JSON parsing
- Deduplicated compute logic between REST and MCP endpoints

## Contributing

Found incorrect refund policy data? Want to add a new vendor?

1. Check the vendor's official refund policy documentation
2. Open an issue with the policy details and source links
3. We'll verify and update the rules file

## Free API (No Auth)

**This API is currently free to use. No authentication. No API keys.**

Rate limit: 100 requests/minute per IP.

Questions? [decidefyi@gmail.com](mailto:decidefyi@gmail.com) or [@decidefyi on X](https://x.com/decidefyi)

## License

Rules data is provided as-is for informational purposes only. Always verify refund eligibility with the vendor directly before making decisions.

## Links

- **Website:** [https://decide.fyi](https://decide.fyi)
- **Refund API:** [https://refund.decide.fyi](https://refund.decide.fyi)
- **X/Twitter:** [@decidefyi](https://x.com/decidefyi)
- **MCP Spec:** [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

---

Built with ❤️ by the [decide.fyi](https://decide.fyi) team
