# refund.decide.fyi (v1)

Deterministic refund eligibility signal: **ALLOWED / DENIED / UNKNOWN**.

## Endpoint
POST `https://refund.decide.fyi/api/v1/refund/eligibility`

## Request JSON
```json
{
  "vendor": "adobe",
  "days_since_purchase": 12,
  "region": "US",
  "plan": "individual"
}
