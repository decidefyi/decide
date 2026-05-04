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
request_id=...
policy_version=...
source_hash=...
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
  -d '{"mode":"single","question":"Should this support workflow use one deterministic API verdict for routing?"}'
```

The response should include:

- `c`: `yes`, `no`, or `tie`
- `v`: stable verdict string
- `request_id`: support/debug handle
- `policy_version` and `source_hash`: replay/audit fields

## Free policy proof curl

If they want to see support-policy proof without a production Decision API key:

```bash
curl -sS -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}'
```

## Triage

- `401`: key not provisioned, copied incorrectly, or pointed at the wrong environment.
- `429`: customer is hitting rate limit or the smoke was repeated too quickly.
- `c="unclear"` with `v="try again"`: auth/transport worked, but model/provider path is degraded; check runtime logs and model fallback attempts.
- Missing `request_id`, `policy_version`, or `source_hash`: response contract regression; do not hand off until fixed.

## Handoff checklist

- Confirm plan, owner email, and expected monthly decision volume.
- Run the keyed smoke and paste the `request_id` into the CRM/customer note.
- Send the customer curl plus docs link: `https://www.decide.fyi/resources/docs#decision-api-runtime`.
- For support-policy buyers, also send `https://www.decide.fyi/resources/policy-alerts` and the relevant notary URL.
