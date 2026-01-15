# Refund Eligibility Notary - Usage Examples

Copy-paste examples for integrating the refund eligibility API into agents.

## Quick Start

### Node.js (Zero Dependencies)

```bash
# Download the client
curl -O https://raw.githubusercontent.com/ndkasndakn/decade/main/client/refund-auditor.js

# Run it (requires Node.js 18+)
node refund-auditor.js adobe 12
```

**Output:**
```
✅ ALLOWED
   Refund is allowed. Purchase is 12 day(s) old, within 14 day window.
   Window: 14 days
   Rules version: 2026-01-15
```

### Python (One Command)

```bash
# Download the client
curl -O https://raw.githubusercontent.com/ndkasndakn/decade/main/client/refund-check.py

# Install requests (if needed)
pip install requests

# Run it
python refund-check.py spotify 5
```

**Output:**
```
❌ DENIED
   spotify does not offer refunds for individual plans
   Window: 0 days
   Rules version: 2026-01-15
```

---

## Claude Desktop Integration

Add this to your Claude Desktop MCP config file:

**Location:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Config:**
```json
{
  "mcpServers": {
    "refund-notary": {
      "url": "https://refund.decide.fyi/api/mcp",
      "description": "Deterministic refund eligibility notary for US subscriptions",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

**Then restart Claude Desktop.**

Now you can ask Claude:
```
"Check if I can get a refund for my Adobe subscription I bought 10 days ago"
```

Claude will call the `refund_eligibility` tool automatically.

---

## Raw API Call (cURL)

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

---

## Inline Usage (No Files)

### JavaScript (Node 18+)

```javascript
const result = await fetch("https://refund.decide.fyi/api/v1/refund/eligibility", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    vendor: "adobe",
    days_since_purchase: 12,
    region: "US",
    plan: "individual"
  })
}).then(r => r.json());

console.log(result.verdict); // "ALLOWED" | "DENIED" | "UNKNOWN"
```

### Python

```python
import requests

result = requests.post("https://refund.decide.fyi/api/v1/refund/eligibility", json={
    "vendor": "adobe",
    "days_since_purchase": 12,
    "region": "US",
    "plan": "individual"
}).json()

print(result["verdict"])  # "ALLOWED" | "DENIED" | "UNKNOWN"
```

---

## Supported Vendors

| Vendor | ID | Refund Window |
|--------|-----|---------------|
| Adobe | `adobe` | 14 days |
| Apple App Store | `apple_app_store` | 14 days |
| Canva | `canva` | No refunds |
| Dropbox (US) | `dropbox_us` | No refunds |
| Google Play | `google_play` | 2 days |
| Microsoft 365 | `microsoft_365` | 30 days |
| Netflix | `netflix` | No refunds |
| Notion | `notion` | 3 days |
| Spotify | `spotify` | No refunds |

---

## What You Get Back

Every response includes:
- `verdict` - `"ALLOWED"` / `"DENIED"` / `"UNKNOWN"`
- `message` - Human-readable explanation
- `rules_version` - Data version for tracking
- `refundable` - Boolean (null if UNKNOWN)
- `code` - Machine-readable status code

**Example response:**
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

---

## Why Use This?

- **Deterministic** - Same input always returns same output
- **Stateless** - No accounts, no API keys, no rate limits
- **Fast** - ~50ms response time globally
- **Authoritative** - Single source of truth for refund policies
- **Agent-Ready** - MCP + REST, works in any agent framework
