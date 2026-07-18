# First Customer Runbook

Use this when a customer is evaluating or has just received API access. The goal is to confirm the exact customer key works against production before they build on it.

## Keyed API smoke

Run this after provisioning a key:

```bash
DECIDE_SMOKE_API_KEY='<customer-key>' npm run smoke:customer-key
```

Expected success:

```text
PASS customer key smoke
endpoint=https://www.decide.fyi/api/decide
status=200
decision=yes
decision_record_version=decision_record_v1
decision_id=...
request_id=...
application_verdict=APPROVE
binding_mode=direct_declarative_rulebook
reason_code=CUSTOMER_KEY_SMOKE_ALLOWED
policy_version=...
source_hash=...
record_hash=...
verify_url=...
latency_ms=...
```

Dry-run without sending the key:

```bash
DECIDE_SMOKE_API_KEY='<customer-key>' npm run smoke:customer-key -- --dry-run
```

Point at preview or local:

```bash
DECIDE_SMOKE_BASE_URL='https://preview.example.com' DECIDE_SMOKE_API_KEY='<customer-key>' npm run smoke:customer-key
```

## Customer curl

Send this with their key placeholder:

```bash
export DECIDE_API_KEY='<customer-key>'

curl -sS -X POST https://www.decide.fyi/api/decide \
  -H "Authorization: Bearer $DECIDE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"rulebook","rulebook":{"schema_version":"rulebook_v1","rulebook_id":"customer_key_smoke","version":"2026-06-19","input_schema":{"required":["route_score"],"properties":{"route_score":{"type":"number"}}},"rules":[{"rule_id":"approve_customer_key_smoke","priority":100,"condition":{"field":"route_score","operator":"gte","value":70},"outcome":{"decision":"yes","verdict":"APPROVE","action":"allow_test_handoff","reason_code":"CUSTOMER_KEY_SMOKE_ALLOWED"}}],"default_outcome":{"decision":"review","verdict":"REVIEW","action":"route_to_operator","reason_code":"CUSTOMER_KEY_SMOKE_REVIEW"}},"context":{"inputs":{"route_score":91}}}'
```

This is a Rulebook v1 production smoke, not the legacy `single` advisory path.

The response should include:

- `decision_record_version`: `decision_record_v1`
- `decision_id`: stable Decision Record handle
- `request_id`: support/debug handle
- `verdict` / `c`: `yes` for the successful Rulebook v1 smoke
- `application_verdict`: `APPROVE`
- `runtime_binding.binding_mode`: `direct_declarative_rulebook`
- `rulebook_contract`, `input_hash`, and `rulebook_attestation`: production binding material
- `record_hash` and `verify_url`: public verification fields
- `policy_version` and `source_hash`: replay/audit fields

## Free policy proof curl

If they want to see support-policy proof without a production Decision API key:

```bash
curl -sS -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual","qualifying_conditions_met":true}'
```

Only set `qualifying_conditions_met=true` after verifying the source-specific purchase facts. Approval-dependent policies return `UNKNOWN` and require review even when this flag is present.

## Triage

- `401`: key not provisioned, copied incorrectly, or pointed at the wrong environment.
- `429`: customer is hitting rate limit or the smoke was repeated too quickly.
- `c="unclear"` with a Rulebook validation error: auth/transport worked, but the production rulebook path rejected the request; check the response `error` and `errors` fields.
- Missing `decision_record_version`, `decision_id`, `request_id`, `policy_version`, `source_hash`, `record_hash`, or `verify_url`: response contract regression; do not hand off until fixed.

## Handoff checklist

- Confirm plan, owner email, and expected monthly decision volume.
- Run the keyed smoke and paste the `request_id` into the CRM/customer note.
- Send the customer curl plus docs link: `https://www.decide.fyi/resources/docs#decision-api-runtime`.
- For support-policy buyers, send the canonical four-tool remote `https://policy.decide.fyi/api/mcp`, the policy-alert feed at `https://www.decide.fyi/resources/policy-alerts`, and [`POLICY_MCP_SUPPORT_WORKFLOW.md`](POLICY_MCP_SUPPORT_WORKFLOW.md). Keep specialist notary URLs for compatibility only.
