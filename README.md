# refund.decide.fyi

> Deterministic refund eligibility notary for US consumer subscriptions

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://refund.decide.fyi)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Vendors](https://img.shields.io/badge/vendors-65-orange.svg)](https://refund.decide.fyi)

## Quick Start

```bash
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual"}'
```

**Response:** `{"refundable":true,"verdict":"ALLOWED","code":"WITHIN_WINDOW",...}`

No auth required. 100 req/min rate limit. [See all examples ->](client/EXAMPLES.md)

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

## Data Freshness

Refund policies are sourced from official vendor documentation and terms of service. To keep data reliable:

- **Daily automated checks** - A GitHub Action runs every day at 08:00 UTC, fetching each vendor's refund policy page, hashing the content, and comparing against stored baselines. If a page changes, an issue is automatically opened for review.
- **Policy source URLs tracked** - Every vendor entry has a corresponding source URL in `rules/policy-sources.json` linking to the official policy page.
- **Versioned rules** - The `rules_version` field in `rules/v1_us_individual.json` is bumped on every policy update so consumers can detect stale data.

**Rules version:** `2026-02-01` | **Last updated:** 2026-02-01

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
  "rules_version": "2026-02-01",
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
  "rules_version": "2026-02-01",
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
  "rules_version": "2026-02-01",
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

## Supported Vendors (65)

| Vendor | Identifier | Refund Window |
|--------|-----------|---------------|
| 1Password | `1password` | No refunds |
| Adobe | `adobe` | 14 days |
| Amazon Prime | `amazon_prime` | 3 days |
| Apple App Store | `apple_app_store` | 14 days |
| Apple Music | `apple_music` | No refunds |
| Apple TV+ | `apple_tv_plus` | No refunds |
| Audible | `audible` | No refunds |
| Bitwarden | `bitwarden` | 30 days |
| Bumble | `bumble` | No refunds |
| Calm | `calm` | 30 days |
| Canva | `canva` | No refunds |
| ChatGPT Plus | `chatgpt_plus` | No refunds |
| Claude Pro | `claude_pro` | No refunds |
| Coursera Plus | `coursera_plus` | 14 days |
| Crunchyroll | `crunchyroll` | No refunds |
| Deezer | `deezer` | No refunds |
| Disney+ | `disney_plus` | No refunds |
| DoorDash DashPass | `doordash_dashpass` | No refunds |
| Dropbox (US) | `dropbox_us` | No refunds |
| Duolingo | `duolingo` | No refunds |
| Evernote | `evernote` | 20 days |
| ExpressVPN | `expressvpn` | 30 days |
| Figma | `figma` | No refunds |
| Fubo TV | `fubo_tv` | No refunds |
| GitHub Pro | `github_pro` | No refunds |
| Google Play | `google_play` | 2 days |
| Grammarly | `grammarly` | No refunds |
| Headspace | `headspace` | No refunds |
| HelloFresh | `hellofresh` | No refunds |
| Hinge | `hinge` | No refunds |
| Hulu | `hulu` | No refunds |
| iCloud+ | `icloud_plus` | 14 days |
| Instacart+ | `instacart_plus` | 5 days |
| LinkedIn Premium | `linkedin_premium` | 7 days |
| MasterClass | `masterclass` | 30 days |
| Max (HBO) | `max` | No refunds |
| Microsoft 365 | `microsoft_365` | 30 days |
| Midjourney | `midjourney` | No refunds |
| Netflix | `netflix` | No refunds |
| Nintendo Switch Online | `nintendo_switch_online` | No refunds |
| Noom | `noom` | 14 days |
| NordVPN | `nordvpn` | 30 days |
| Notion | `notion` | 3 days |
| Paramount+ | `paramount_plus` | No refunds |
| Peacock | `peacock` | No refunds |
| Peloton | `peloton` | No refunds |
| PlayStation Plus | `playstation_plus` | 14 days |
| Scribd | `scribd` | 30 days |
| Shutterstock | `shutterstock` | No refunds |
| Slack | `slack` | No refunds |
| Sling TV | `sling_tv` | No refunds |
| Spotify | `spotify` | No refunds |
| Squarespace | `squarespace` | 14 days |
| Strava | `strava` | 14 days |
| Surfshark | `surfshark` | 30 days |
| Tidal | `tidal` | No refunds |
| Tinder | `tinder` | No refunds |
| Todoist | `todoist` | 30 days |
| Twitch | `twitch` | No refunds |
| Walmart+ | `walmart_plus` | No refunds |
| Wix | `wix` | 14 days |
| Xbox Game Pass | `xbox_game_pass` | 30 days |
| YouTube Premium | `youtube_premium` | No refunds |
| Zoom | `zoom` | No refunds |

**Scope:** US region, individual plans only.

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
- **Daily Monitoring** - GitHub Action checks vendor policy pages daily for changes
- **Serverless** - Runs on Vercel Edge Functions for global low latency
- **Zero Dependencies** - Core compute logic has no external dependencies

## Limitations

- **US Only** - Currently only supports US region
- **Individual Plans Only** - Business/enterprise plans not yet supported
- **Calendar Days** - Refund windows are based on calendar days, not business days
- **No Pro-rating** - Does not calculate partial refunds or pro-rated amounts
- **Static Rules** - Does not account for promotional offers or special circumstances

## Changelog

### v1.1.0 (2026-02-01)

**Added:**
- Expanded from 9 to 65 supported vendors
- Daily policy-check GitHub Action (cron at 08:00 UTC) that detects vendor policy page changes and opens issues automatically
- Policy source URLs tracked in `rules/policy-sources.json` for every vendor
- New categories: streaming, dating, delivery, education, wellness, fitness, AI, VPN, security, design, food

**Fixed:**
- Fixed `ERR_IMPORT_ATTRIBUTE_MISSING` crash on Vercel caused by Node 22 requiring import attributes for JSON imports

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
- **Smithery:** [https://smithery.ai/server/refund-decide/notary](https://smithery.ai/server/refund-decide/notary)
- **X/Twitter:** [@decidefyi](https://x.com/decidefyi)
- **MCP Spec:** [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

---

Built with love by the [decide.fyi](https://decide.fyi) team
