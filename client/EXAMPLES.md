# Refund Eligibility Notary - Usage Examples

Copy-paste examples for integrating the refund eligibility API into agents.

---

## Fastest Start (cURL)

Test it right now in your terminal:

```bash
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{
    "vendor": "adobe",
    "days_since_purchase": 12,
    "region": "US",
    "plan": "individual",
    "qualifying_conditions_met": true
  }'
```

**Output:**
```json
{
  "refundable": true,
  "verdict": "ALLOWED",
  "code": "WITHIN_WINDOW",
  "message": "Refund is allowed. Purchase is 12 day(s) old, within 14 day window.",
  "rules_version": "2026-07-16",
  "vendor": "adobe",
  "window_days": 14,
  "days_since_purchase": 12,
  "qualifying_conditions_met": true,
  "automation_safe": true
}
```

---

## Inline Code (Copy-Paste)

Drop these directly into your code. No files, no setup.

### JavaScript (Node 18+)

```javascript
const result = await fetch("https://refund.decide.fyi/api/v1/refund/eligibility", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    vendor: "adobe",
    days_since_purchase: 12,
    region: "US",
    plan: "individual",
    qualifying_conditions_met: true
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
    "plan": "individual",
    "qualifying_conditions_met": True
}).json()

print(result["verdict"])  # "ALLOWED" | "DENIED" | "UNKNOWN"
```

---

## CLI Tools (Optional)

If you want standalone command-line tools:

### Node.js (Zero Dependencies)

```bash
# Download the client
curl -O https://raw.githubusercontent.com/decidefyi/decide/main/client/refund-auditor.js

# Run it (requires Node.js 18+)
node refund-auditor.js adobe 12 true
```

**Output:**
```
✅ ALLOWED
   Refund is allowed. Purchase is 12 day(s) old, within 14 day window.
   Window: 14 days
   Rules version: 2026-07-16
```

### Python (One Command)

```bash
# Download the client
curl -O https://raw.githubusercontent.com/decidefyi/decide/main/client/refund-check.py

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
   Rules version: 2026-02-01
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

Claude will call the `refund_eligibility` tool automatically. If the policy needs source-specific facts or vendor approval, the tool returns `UNKNOWN` with `required_context` instead of inventing an answer.

---

## Supported Vendors (100)

Use the versioned [refund rules](../rules/v1_us_individual.json) and [official-source registry](../rules/policy-sources.json) as the canonical catalog. Each vendor is explicitly classified as `deterministic`, `conditional`, or `review_only`. The monitor detects source changes; only reviewed repository changes alter runtime rules.

---

## What You Get Back

Every response includes:
- `verdict` - `"ALLOWED"` / `"DENIED"` / `"UNKNOWN"`
- `message` - Human-readable explanation
- `rules_version` - Data version for tracking
- `refundable` - Boolean (null if UNKNOWN)
- `code` - Machine-readable status code
- `required_context` - Facts or manual review needed when the verdict is `UNKNOWN`
- `automation_safe` - Whether the returned verdict is safe for the supported automation scope

**Example response:**
```json
{
  "refundable": true,
  "verdict": "ALLOWED",
  "code": "WITHIN_WINDOW",
  "message": "Refund is allowed. Purchase is 12 day(s) old, within 14 day window.",
  "rules_version": "2026-07-16",
  "vendor": "adobe",
  "window_days": 14,
  "days_since_purchase": 12,
  "qualifying_conditions_met": true,
  "automation_safe": true
}
```

---

## Why Use This?

- **Deterministic** - Same input always returns same output
- **Stateless** - No accounts, no API keys (rate limit: 100 req/min per IP)
- **Auditable** - Versioned rules, official-source metadata, and policy lineage fields
- **Fail-closed** - Missing facts and approval-dependent policies return `UNKNOWN`
- **Agent-Ready** - MCP + REST, works in any agent framework
