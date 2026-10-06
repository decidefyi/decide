# Decide Services: Quote/discount approvals

**Local reference build. Not published, hosted, production-enabled or billable.**

An agent proposes a discount against a quote reference. The service retrieves
the connected application's stored quote facts and owner-approved limits, then
uses Decide Runtime's existing Rulebook evaluator to produce yes, no or review.
It saves a specialized quote decision for retrieval and identical retries.

This package has no Krafthaus dependency. Krafthaus or another customer app may
own the quote workflow, exception routing and actual execution. Policy Notaries
remains a separate source-backed lookup service; no policy lookup grants quote
access or approves a customer's refund/discount action.

## Run locally

Use the existing **Node 24** runtime (verified on 24.19.0). The service uses its
built-in SQLite module and the repository's unchanged evaluator/hash utilities.
Tests reuse the lockfile-matching AJV package; no new dependency or paid service.

```sh
npm run test:quote-discounts
npm run demo:quote-discounts
npm run mcp:quote-discounts:demo
```

The last command is a fictional stdio MCP session, not an HTTP endpoint. It
exposes exactly two tools. Do not run it with customer data or advertise it as
the hosted Decide Runtime connection.

Example local client configuration (replace both absolute paths):

```json
{
  "mcpServers": {
    "decide-quote-discounts-local": {
      "command": "/absolute/path/to/node24",
      "args": ["/absolute/path/to/decide/services/quote-discounts/stdio-demo.js"]
    }
  }
}
```

## The example has explicit context

The fictional application owns a draft USD quote priced at $1,000 with $600
cost. Its owner-approved policy permits at most 15% and $200 of automatic
discount, and requires at least 20% **post-discount gross margin**. At 15%, the
discount is $150, the net quote is $850, and margin floors to 29.41%.

| Case in the runnable demo | Result | Reason |
| --- | --- | --- |
| 15%, trusted cost $600 | yes | Within both limits and margin floor |
| 15%, trusted cost $800 | no | Post-discount margin is 5.88% |
| 18%, trusted cost $600 | review | Outside the automatic percentage limit |
| Missing trusted cost | review/needs_input | The agent must not invent margin |

These values are examples, not recommended business limits. Using the hosted
trial's discount example does not activate this local service for an account.
Customer exception handling belongs to their application; it is not a task
queue for the Decide owner.

## Agent interface

### `decide_check_quote_discount`

```json
{
  "quote_id": "quote-100",
  "quote_revision": "v1",
  "discount_bps": 1500,
  "request_id": "request-100"
}
```

Basis points are integer hundredths of a percent. Exactly these four fields are
accepted. No margins, costs, raw rulebooks, approval flags, tenant IDs, URLs or
credentials belong in arguments. The server chooses the quote's approved policy.

Output is `{ok, decision, error}` with strict JSON schemas, serialized text and
`structuredContent`. The decision includes amounts, margin, policy/input hashes,
reason, deadline and actual Runtime lineage. Yes/no/review are successful tool
results; infrastructure/access/invalid-input failures are `isError: true` with
`decision: null`. The check persists a record and is not labeled read-only.

### `decide_get_quote_discount_decision`

Pass only `{ "decision_id": "qdd_..." }`. Reading is scoped to the current
workspace and policy grant. It never renews the deadline or allocates another
decision. Read history is not current execution authority.

The normal stdio demo allows ten fictional records per process and uses a fixed
test clock. Restarting that **fictional demo** starts a new session; it is not
connected to the hosted account's ten-record allowance. The reusable file-backed
service separately demonstrates local restart persistence.

## Trusted application interface

`createQuoteDiscountService({enabled: true, filename, clock,
max_records_per_workspace})` is disabled without explicit opt-in. A trusted host
provisions stable principal memberships; an authenticated host then obtains
`client({workspace_id, principal_id})`. This is an internal integration boundary,
**not authentication**. Never expose client construction or provisioning as a
request or tool argument, nor reuse a global demo client for HTTP visitors.

| Operation | Caller | Effect |
| --- | --- | --- |
| `provisionPrincipal` | Trusted bootstrap/provisioning host only | Stores role, policy grants and active state; advances grant revision |
| `approvePolicy` | Owner | Explicitly approves currency/limits/time bounds; immutable versions, advances policy epoch |
| `putQuote` | Owner/trusted application integration | Stores the quote snapshot and advances its epoch |
| `suspendPolicy` | Owner | Withholds new checks/claims while retaining decision history |
| `checkDiscount`, `getDecision` | Granted agent or owner | Evaluate/read only authorized policy scopes |
| `consumeApproval` | Granted executor | Validate and claim a stored exact yes; no provider mutation |

None of the setup or consume operations is an MCP tool. The agent cannot change
its stored role, activate policy or call the executor through these two tools.
Every operation reloads stored membership/grants. Use a private local directory
for file-backed test stores; no real customer data, credentials or production
database is configured by the demos.

See [CONTRACT.md](CONTRACT.md) for the exact policy and snapshot fields.

## Enforcement and retries

A returned `yes` has `execution_authority: none`. A trusted executor passes
`{decision_id, quote_id, quote_revision, discount_bps, request_id}` to
`consumeApproval` before attempting the exact proposed action. The gate reloads
the saved record, current agent/executor grants, policy and quote epochs,
resource revision, fact freshness and expiry. Denials, review, missing facts,
changed targets/policies, revoked grants and errors cannot be consumed.

At most one local claim exists per workspace/quote revision. The first returns
`newly_claimed: true`; repeats return the existing claim with false. A changed
discount conflicts. A fresh request ID cannot bypass this claim boundary.

**A claim is not proof of execution or an exactly-once provider guarantee.** A
real application still needs conditional provider writes against the current
resource revision, a stable provider idempotency key, a durable submission
receipt and lost-response reconciliation. It must not treat a repeat claim as
permission to resubmit. No CRM, payment or billing call is made here.

Money uses integer minor units with BigInt intermediates. Discount amount and
margin basis points floor deterministically. Currency must match the approved
policy; no currency conversion or tax assumptions. Same request ID and proposal
return the same record while its references remain available; changed arguments
conflict, and retries never renew authority or validity. Local record limits
are persisted-record bounds, **not prices, credits or billed usage**.

## Verification and agent-evaluation preparation

The focused suite exercises the real evaluator and SQLite store: strict typed
outputs, four business scenarios, owner/agent/executor separation, account and
policy isolation, revocation, policy/quote changes, money extremes, expiry,
read-copy tampering, bounded records, restart, JSON-RPC and stdio framing.
Six independently opened concurrent worker connections also demonstrate one
saved decision and one local consume claim for identical proposals.

For ten independent read-only agent questions against pre-saved fictional
snapshots:

```sh
node services/quote-discounts/stdio-demo.js --evaluation
```

This prepares records **before** exposing a read-only evaluation connection.
Questions and expected answers are emitted as XML on stderr; stdout remains
MCP-only. Use only each question as the model prompt, not its expected answer.
Record references are valid only within that running fixture session. Local
tests verify the answer keys using saved-record reads, but **no paid-model
evaluation or real third-party client acceptance has been run**. That remains
separate from passing protocol/unit tests.

## Next integration gate — not yet done

1. Bind the existing authenticated sandbox's account/grant identity to this
   service, with explicit quote-policy permissions. Existing Runtime OAuth
   scopes alone do not authorize a new quote store or policy administration.
2. Adapt persistence to the existing managed store with equivalent transaction,
   uniqueness, quota and revocation tests. **Do not use local SQLite as a durable
   Vercel serverless store**. Complete retention, rate limits and account-usage
   reconciliation; do not meter discovery/reads/retries as new decisions.
3. Use the existing canonical signed Runtime record/binding contract. These
   local specialized records are not public Decision Record v1, signed approvals,
   an SDK release or a second production attestation format.
4. Connect one consenting application's authoritative quote source and gated
   executor; test version races and uncertain provider results in its sandbox.
5. Run required release preflight/exact-SHA gates, obtain deployment/access and
   publication approval, and verify a real agent path before directory claims.

Current public REST/SDK/Policy Notaries schemas, manifests, billing, OAuth grants
and production access are unchanged. No demand, revenue or production-readiness
claim follows from this local build.
