# Policy strengthening release packet

Status: local implementation; not a deployment receipt.

Decide Runtime is the engine. Decide Services owns specialist APIs/MCPs such as
Policy Notaries. Krafthaus remains optional workflow, review and execution.

## Corrections

- Adobe cancellation: review-only. Monthly/annual cadence cannot distinguish the
  contract, initial purchase window, annual payment structure, state or renewal
  phase. No cancellation or fee calculation is authorized by these requests.
  Primary source: https://www.adobe.com/legal/subscription-terms.html (effective
  August 1, 2026). No human policy-verification date has been renewed.
- WeightWatchers refund/cancel/return: retired from active monitoring and new
  automated decisions. The October 5 monitor reports fetch failures on all three
  and last successes on August 5. Historical rules, hashes and review state are
  retained. Trial is not retired by association.
  Evidence: https://github.com/decidefyi/decide/actions/runs/37263127260 .
- Retired scopes return UNKNOWN through Rulebook v1, even when handed a fresh
  source snapshot. Only server-owned source metadata controls retirement.
- Persistent failures enter a per-policy retirement-review queue. Seven failed
  checks or expired source freshness plus a current failure triggers review,
  not automatic removal. A short outage is not a retirement decision.
- Health reporting separates configured decision modes from current evidence.
  It exposes retired scopes, missing/expired reviews and reviews due within 14
  days. Evidence readiness still requires complete request context and is not a
  live end-to-end availability claim.
- Canva and Spotify refund/return scopes are review-only: the existing inputs
  do not resolve product, purchase channel and applicable exceptions. Netflix
  refund/return is also review-only; its old source was a plan-change article.
  The replacement Terms of Use source still needs US regional qualification
  and burn-in. Its prior human verification is explicitly cleared, not inherited
  from the policy family's date. See `POLICY_SCOPE_REVIEW_20261006.md`.
- `GET /api/policy-support` publishes the server-owned support catalogue and
  validated monitoring evidence separately. Missing evidence produces unknown
  maintenance counts, not zero. It grants no decision or execution authority.
- The existing private Signalnio Ops MCP view adds a separate Policy Notaries
  health panel. It validates source identity, freshness and counts, showing
  automated availability, qualification expiry and exclusion diagnostics.
  No credentials, customer inputs or raw MCP arguments are sent to this reader.
- Service operation is automated-or-unavailable, not an owner review queue.
  Seven persistent source failures automatically withhold runtime availability;
  one short outage may still use current evidence. Unsupported scopes remain
  off and their history is retained. Reopening is a future tested capability
  update, not a required human task for keeping other scopes running.

## Supported catalogue semantics

Known vendor identifiers are preserved for compatibility and historical lookups.
Presence in an input enum does not mean a scope is automated or currently usable.
Use policy_decision_mode, policy_evidence and automation_safe on each response.
Review-only, retired, changed, expired or unavailable evidence cannot authorize
execution. The calling application always controls the action.

## Reopening and expansion

For a retired policy, qualify a stable official source, resolve product/channel/
region/contract scope, encode required facts, run the existing source burn-in,
obtain a recorded applicability review and add golden yes/no/review cases before
an explicit admission/reopening change. Do not erase history or merely reset a
date. Admit individual policy scopes; never infer support across the company.

## Release gates and remaining work

Local verification passes: 5,006 typed-output cases, 70 runtime contract cases,
HTTP MCP checks, workflow smoke, evidence/state-integrity and transport checks,
monitoring, feed, alerts, lifecycle/readiness, public-source and distribution
checks, candidate review checks and Typeform regressions. The retirement test
confirms zero fetch attempts while retaining historical monitoring state.
Both final local full preflights passed on October 6: Decide on CI Node 24 and
Signalnio on Node 22, including its Next build and isolated PostgreSQL checks.
The Ops component was inspected locally with unavailable evidence and review
queues. These are local receipts, not proof of a hosted release.

This batch changes catalogue hashes. A coordinated monitor snapshot refresh with
the exact new catalogue is required when releasing: old snapshots intentionally
fail closed. Do not weaken hash matching or extend freshness to avoid this gate.
Most July 16 qualifications reach the existing 90-day boundary October 14.
Affected scopes become unavailable automatically. Source fetches do not renew
them, and this release does not claim perpetual self-renewing qualification.

Runtime OAuth MCP usage, directory conversion and client attribution are still
separate reporting gaps. This policy health change does not connect those lanes.
Stored policy telemetry does not retain vendor arguments: this factual review
was risk-selected, not a claimed per-vendor usage ranking.
No billing, production Runtime access, OAuth scopes, database permissions or paid
service changes are included.
