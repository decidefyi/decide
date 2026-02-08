# decide.fyi

> Deterministic subscription decision notaries for US consumers

[![Version](https://img.shields.io/badge/version-1.2.1-blue.svg)](https://decide.fyi)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Vendors](https://img.shields.io/badge/vendors-64-orange.svg)](https://decide.fyi)

## One-Click Install

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](cursor://anysphere.cursor-deeplink/mcp/install?name=refund-decide&config=eyJ1cmwiOiAiaHR0cHM6Ly9yZWZ1bmQuZGVjaWRlLmZ5aS9hcGkvbWNwIn0=) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=refund-decide&config=%7B%22type%22%3A%20%22http%22%2C%20%22url%22%3A%20%22https%3A//refund.decide.fyi/api/mcp%22%7D) [![Add to Claude](https://fastmcp.me/badges/claude_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to ChatGPT](https://fastmcp.me/badges/chatgpt_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to Codex](https://fastmcp.me/badges/codex_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to Gemini](https://fastmcp.me/badges/gemini_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients)

> Buttons install the **Refund Notary** server. To add all 4 servers, use the [JSON config below](#connect-via-mcp-claude-desktop--windsurf--other-clients).

## MCP Servers

| Server | Domain | Tool | Verdicts |
|--------|--------|------|----------|
| **Refund Notary** | [refund.decide.fyi](https://refund.decide.fyi) | `refund_eligibility` | ALLOWED / DENIED / UNKNOWN |
| **Cancel Notary** | [cancel.decide.fyi](https://cancel.decide.fyi) | `cancellation_penalty` | FREE_CANCEL / PENALTY / LOCKED / UNKNOWN |
| **Return Notary** | [return.decide.fyi](https://return.decide.fyi) | `return_eligibility` | RETURNABLE / EXPIRED / NON_RETURNABLE / UNKNOWN |
| **Trial Notary** | [trial.decide.fyi](https://trial.decide.fyi) | `trial_terms` | TRIAL_AVAILABLE / NO_TRIAL / UNKNOWN |

All servers: 64 vendors, US region, individual plans, stateless, no auth, 100 req/min.

## Quick Start

### Connect via MCP (Claude Desktop / Windsurf / other clients)

```json
{
  "mcpServers": {
    "refund-decide": { "url": "https://refund.decide.fyi/api/mcp" },
    "cancel-decide": { "url": "https://cancel.decide.fyi/api/mcp" },
    "return-decide": { "url": "https://return.decide.fyi/api/mcp" },
    "trial-decide":  { "url": "https://trial.decide.fyi/api/mcp" }
  }
}
```

### REST API

```bash
# Refund eligibility
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual"}'

# Cancellation penalty
curl -X POST https://cancel.decide.fyi/api/v1/cancel/penalty \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","region":"US","plan":"individual"}'

# Return eligibility
curl -X POST https://return.decide.fyi/api/v1/return/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual"}'

# Trial terms
curl -X POST https://trial.decide.fyi/api/v1/trial/terms \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","region":"US","plan":"individual"}'
```

### Local Dev Checks

Start local dev server:

```bash
npx vercel dev
```

In a separate terminal:

```bash
# Handler-level smoke checks (no running server required)
npm run smoke

# MCP endpoint checks (requires vercel dev running on localhost:3000)
npm run mcp:check
```

---

## Refund Notary

**Endpoint:** `POST https://refund.decide.fyi/api/v1/refund/eligibility`
**MCP Tool:** `refund_eligibility`

Checks if a subscription purchase is within the vendor's refund window.

**Input:** `vendor`, `days_since_purchase`, `region`, `plan`

```json
{"refundable":true,"verdict":"ALLOWED","code":"WITHIN_WINDOW","message":"Refund is allowed. Purchase is 12 day(s) old, within 14 day window.","vendor":"adobe","window_days":14}
```

**Codes:** `WITHIN_WINDOW`, `OUTSIDE_WINDOW`, `NO_REFUNDS`, `UNSUPPORTED_VENDOR`

## Cancel Notary

**Endpoint:** `POST https://cancel.decide.fyi/api/v1/cancel/penalty`
**MCP Tool:** `cancellation_penalty`

Checks cancellation penalties — early termination fees, contract locks, or free cancellation.

**Input:** `vendor`, `region`, `plan`

```json
{"verdict":"PENALTY","code":"EARLY_TERMINATION_FEE","message":"adobe charges an early termination fee: 50% of remaining months on annual plan.","vendor":"adobe","policy":"etf"}
```

**Codes:** `NO_PENALTY`, `EARLY_TERMINATION_FEE`, `CONTRACT_LOCKED`, `UNSUPPORTED_VENDOR`

## Return Notary

**Endpoint:** `POST https://return.decide.fyi/api/v1/return/eligibility`
**MCP Tool:** `return_eligibility`

Checks if a subscription purchase can be returned/reversed, with return type and method.

**Input:** `vendor`, `days_since_purchase`, `region`, `plan`

```json
{"returnable":true,"verdict":"RETURNABLE","code":"FULL_RETURN","message":"Return is available. Purchase is 5 day(s) old, within 14-day window.","vendor":"adobe","return_type":"full_refund","method":"self_service"}
```

**Codes:** `FULL_RETURN`, `PRORATED_RETURN`, `CREDIT_RETURN`, `OUTSIDE_WINDOW`, `NO_RETURNS`, `UNSUPPORTED_VENDOR`

## Trial Notary

**Endpoint:** `POST https://trial.decide.fyi/api/v1/trial/terms`
**MCP Tool:** `trial_terms`

Checks free trial availability, length, card requirement, and auto-conversion status.

**Input:** `vendor`, `region`, `plan`

```json
{"verdict":"TRIAL_AVAILABLE","code":"AUTO_CONVERTS","message":"adobe offers a 7-day free trial. Credit card required. Auto-converts to paid plan.","vendor":"adobe","trial_days":7,"card_required":true,"auto_converts":true}
```

**Codes:** `AUTO_CONVERTS`, `NO_AUTO_CONVERT`, `TRIAL_NOT_AVAILABLE`, `UNSUPPORTED_VENDOR`

---

## Supported Vendors (64)

| Vendor | Identifier | Refund | Cancel | Return | Trial |
|--------|-----------|--------|--------|--------|-------|
| 1Password | `1password` | No refunds | Free | No return | 14d |
| Adobe | `adobe` | 14d | ETF | 14d full | 7d |
| Amazon Prime | `amazon_prime` | 3d | Free | 3d full | 30d |
| Apple App Store | `apple_app_store` | 14d | Free | 14d full | - |
| Apple Music | `apple_music` | No refunds | Free | No return | 30d |
| Apple TV+ | `apple_tv_plus` | No refunds | Free | No return | 7d |
| Audible | `audible` | No refunds | Free | No return | 30d |
| Bitwarden | `bitwarden` | 30d | Free | 30d full | 7d |
| Bumble | `bumble` | No refunds | Free | No return | 7d |
| Calm | `calm` | 30d | Free | 30d full | 7d |
| Canva | `canva` | No refunds | Free | No return | 30d |
| ChatGPT Plus | `chatgpt_plus` | No refunds | Free | No return | - |
| Claude Pro | `claude_pro` | No refunds | Free | No return | - |
| Coursera Plus | `coursera_plus` | 14d | Free | 14d full | 7d |
| Crunchyroll | `crunchyroll` | No refunds | Free | No return | 7d |
| Deezer | `deezer` | No refunds | Free | No return | 30d |
| Disney+ | `disney_plus` | No refunds | Free | No return | - |
| DoorDash DashPass | `doordash_dashpass` | No refunds | Free | No return | 30d |
| Dropbox (US) | `dropbox_us` | No refunds | Free | No return | 30d |
| Duolingo | `duolingo` | No refunds | Free | No return | 14d |
| Evernote | `evernote` | 20d | Free | 20d full | 14d |
| ExpressVPN | `expressvpn` | 30d | Free | 30d full | 7d |
| Figma | `figma` | No refunds | Free | No return | 30d |
| Fubo TV | `fubo_tv` | No refunds | Free | No return | 7d |
| GitHub Pro | `github_pro` | No refunds | Free | No return | - |
| Google Play | `google_play` | 2d | Free | 2d full | - |
| Grammarly | `grammarly` | No refunds | Free | No return | 7d |
| Headspace | `headspace` | No refunds | Free | No return | 7d |
| HelloFresh | `hellofresh` | No refunds | Free (5d notice) | No return | - |
| Hinge | `hinge` | No refunds | Free | No return | 7d |
| Hulu | `hulu` | No refunds | Free | No return | 30d |
| iCloud+ | `icloud_plus` | 14d | Free | 14d full | - |
| Instacart+ | `instacart_plus` | 5d | Free | 5d full | 14d |
| LinkedIn Premium | `linkedin_premium` | 7d | Free | 7d full | 30d |
| MasterClass | `masterclass` | 30d | Free | 30d full | - |
| Max (HBO) | `max` | No refunds | Free | No return | - |
| Microsoft 365 | `microsoft_365` | 30d | Free | 30d full | 30d |
| Midjourney | `midjourney` | No refunds | Free | No return | - |
| Netflix | `netflix` | No refunds | Free | No return | - |
| Nintendo Switch Online | `nintendo_switch_online` | No refunds | Free | No return | 7d |
| Noom | `noom` | 14d | Free | 14d full | 7d |
| NordVPN | `nordvpn` | 30d | Free | 30d full | 7d |
| Notion | `notion` | 3d | Free | 3d full | - |
| Paramount+ | `paramount_plus` | No refunds | Free | No return | 7d |
| Peacock | `peacock` | No refunds | Free | No return | 7d |
| Peloton | `peloton` | No refunds | Free | No return | 30d |
| PlayStation Plus | `playstation_plus` | 14d | Free | 14d prorated | 14d |
| Scribd | `scribd` | 30d | Free | 30d full | 30d |
| Shutterstock | `shutterstock` | No refunds | ETF | No return | 30d |
| Slack | `slack` | No refunds | Free | Credit | 90d |
| Sling TV | `sling_tv` | No refunds | Free | No return | - |
| Spotify | `spotify` | No refunds | Free | No return | 30d |
| Squarespace | `squarespace` | 14d | Free | 14d full | 14d |
| Strava | `strava` | 14d | Free | 14d full | 30d |
| Surfshark | `surfshark` | 30d | Free | 30d full | 7d |
| Tidal | `tidal` | No refunds | Free | No return | 30d |
| Tinder | `tinder` | No refunds | Free | No return | - |
| Todoist | `todoist` | 30d | Free | 30d full | 30d |
| Twitch | `twitch` | No refunds | Free | No return | - |
| Walmart+ | `walmart_plus` | No refunds | Free | No return | 30d |
| Wix | `wix` | 14d | Free | 14d full | 14d |
| Xbox Game Pass | `xbox_game_pass` | 30d | Free | 30d full | 14d |
| YouTube Premium | `youtube_premium` | No refunds | Free | No return | 30d |
| Zoom | `zoom` | No refunds | Free | No return | - |

**Scope:** US region, individual plans only.

## Data Freshness

Policies are sourced from official vendor documentation and terms of service.

- **Daily automated checks** — GitHub Action runs at 08:00 UTC, hashing vendor policy pages across all 4 services (refund, cancel, return, trial). If a page changes, an issue is opened for review.
- **Policy source URLs tracked** — Each service has its own sources file in `rules/` linking to official policy pages.
- **Versioned rules** — Each rules file includes a `rules_version` field for staleness detection.

## Architecture

- **Stateless** — No database, no sessions, no side effects
- **Deterministic** — Same input always produces same output
- **Versioned Rules** — Rules files include version for tracking changes
- **Daily Monitoring** — GitHub Action checks all vendor policy pages daily
- **Serverless** — Runs on Vercel serverless functions
- **Zero Dependencies** — Core compute logic has no external dependencies
- **Hostname Routing** — Vercel middleware routes subdomains to correct MCP endpoints

## Limitations

- **US Only** — Currently only supports US region
- **Individual Plans Only** — Business/enterprise plans not yet supported
- **Calendar Days** — Windows are based on calendar days, not business days
- **Static Rules** — Does not account for promotional offers or special circumstances

## Changelog

### v1.2.0 (2026-02-02)

**Added:**
- Cancel Notary MCP (cancel.decide.fyi) — cancellation penalty checker
- Return Notary MCP (return.decide.fyi) — return eligibility checker
- Trial Notary MCP (trial.decide.fyi) — free trial terms checker
- Hostname-based middleware routing for all subdomains
- Policy source files and daily checking for cancel, return, and trial policies
- Humans/Agents mode toggle on landing page
- MCP catalog with cards for all 4 servers

**Fixed:**
- Daily policy checker: added `contents:write` permission and fixed shell logic
- Removed dead Cloudflare email-decode scripts causing 404s

### v1.1.0 (2026-02-01)

**Added:**
- Expanded from 9 to 64 supported vendors
- Daily policy-check GitHub Action (cron at 08:00 UTC)
- Policy source URLs tracked in `rules/policy-sources.json`
- MCP vendor `enum` in inputSchema for agent discoverability

**Fixed:**
- `ERR_IMPORT_ATTRIBUTE_MISSING` crash on Vercel (Node 22 import attributes)

### v1.0.0 (2026-01-15)

**Added:**
- Initial release with REST API and MCP server
- Support for 9 vendors

## Free API (No Auth)

All 4 servers are free to use. No authentication. No API keys.

Rate limit: 100 requests/minute per IP.

Questions? [decidefyi@gmail.com](mailto:decidefyi@gmail.com) or [@decidefyi on X](https://x.com/decidefyi)

## Links

- **Website:** [https://decide.fyi](https://decide.fyi)
- **Refund:** [https://refund.decide.fyi](https://refund.decide.fyi)
- **Cancel:** [https://cancel.decide.fyi](https://cancel.decide.fyi)
- **Return:** [https://return.decide.fyi](https://return.decide.fyi)
- **Trial:** [https://trial.decide.fyi](https://trial.decide.fyi)
- **X/Twitter:** [@decidefyi](https://x.com/decidefyi)
- **MCP Spec:** [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

---

Built with love by the [decide.fyi](https://decide.fyi) team
