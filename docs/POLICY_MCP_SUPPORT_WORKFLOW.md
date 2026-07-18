# Policy MCP Support Workflow

This is the production reference architecture for a support-policy workflow.
It deliberately separates fact extraction, deterministic policy evaluation,
production authorization, and side-effect execution.

## Boundary

The canonical Policy Notaries remote is:

```text
https://policy.decide.fyi/api/mcp
```

It exposes four read-only deterministic tools:

- `refund_eligibility`
- `cancellation_penalty`
- `return_eligibility`
- `trial_terms`

Each tool returns a versioned policy result. It does not write to Zendesk,
issue a refund, change an entitlement, or authorize any downstream action.

## Production flow

```text
ticket or support inbox
  -> optional AI extraction of proposed facts (advisory only)
  -> validated structured facts from the system of record
  -> Decide Policy Notaries tool call
  -> Rulebook v1 action boundary and Decision Record
  -> downstream executor
  -> execution receipt and observed outcome
```

The model may propose facts or draft a reply. It must not choose the binding
verdict, fabricate policy facts, or trigger the downstream side effect. Missing
or approval-dependent context stays fail-closed and routes to human review.

## Required facts

| Tool | Always supply | Supply when applicable | Fail-closed outcome |
| --- | --- | --- | --- |
| `refund_eligibility` | `vendor`, `region`, `plan`, `days_since_purchase` | `qualifying_conditions_met` | `UNKNOWN` / `MISSING_REQUIRED_CONTEXT` |
| `cancellation_penalty` | `vendor`, `region`, `plan` | `billing_cadence` | `UNKNOWN` / `MISSING_REQUIRED_CONTEXT` |
| `return_eligibility` | `vendor`, `region`, `plan`, `days_since_purchase` | `qualifying_conditions_met` | `UNKNOWN` / `MISSING_REQUIRED_CONTEXT` |
| `trial_terms` | `vendor`, `region`, `plan`, `offer_confirmed` | `observed_trial_days`, `observed_card_required`, `observed_auto_converts` | `UNKNOWN` / `MISSING_REQUIRED_CONTEXT` |

Do not infer these facts from a customer statement alone when the policy needs
purchase, subscription, entitlement, or offer evidence. Resolve them from the
relevant system of record before calling the notary.

## Production action boundary

Use the returned notary result as a bounded fact inside a Rulebook v1 decision
request. The production decision must carry the Rulebook contract, input hash,
attestation, Decision Record, and verification URL described in
[`APPLICATION_BINDING_V1.md`](APPLICATION_BINDING_V1.md).

For a Krafthaus-installed support workflow, that action boundary belongs in the
customer-specific workflow app. Decide provides the deterministic policy result
and record infrastructure; Krafthaus owns the ticket-system integration and
the purpose-specific executor.

Persist at least:

- ticket or case identifier
- exact notary tool and versioned policy result
- source/policy version and source hash
- Rulebook v1 Decision Record identifiers and verification material
- attempted execution receipt and observed customer outcome

## Zendesk reference routes

The four `/api/v1/workflows/zendesk/*` routes are protected reference adapters,
not a production execution integration. Production requests require a
server-to-server Bearer token, return `execution_allowed: false`, and never
perform a Zendesk write. Their `/api/decide` classification is advisory-only.
`decision_override` is test-only and unavailable to deployed clients.

Use them to understand the request/response shape. Build production Zendesk
actions behind the Rulebook v1 boundary above, with customer-specific identity,
authorization, idempotency, audit retention, and executor controls.

## Policy-source governance

The scheduled tracker detects source-page changes but cannot alter notary
rules. A human reviewer must verify the source and land a reviewed, versioned
rulebook change before a deterministic verdict changes. See
[`POLICY_UPDATE_FLOW.md`](POLICY_UPDATE_FLOW.md) and
[`POLICY_RULE_REVIEW.md`](POLICY_RULE_REVIEW.md).
