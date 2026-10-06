# Quote/discount approvals: first local contract

Status: implementation contract for a local acceptance build, not a public or
production service. No hosted route, CRM connection, payments or OAuth grants.
Decide Services owns this package; the existing Rulebook evaluator selects every
verdict. The customer's application owns policy approval, quote facts and action.

## Caller boundaries
- Trusted host code provisions stable workspace/principal memberships and calls
  `client({workspace_id, principal_id})` after authentication. These references
  are NOT tool arguments and this package is NOT an identity provider.
- Owner clients approve versioned limits and write trusted quote snapshots.
- Agent clients check/read only explicitly granted policies in their workspace.
- Executor clients consume stored approvals; no executor method is an MCP tool.
- Every operation reloads membership. Revocation and grant revision changes
  invalidate outstanding claims. No permissions are inferred from tool hints.

## Agent inputs
`decide_check_quote_discount`: `quote_id`, `quote_revision`, `discount_bps`,
`request_id`. A basis point is 0.01%; 1500 means 15%. Exact keys, bounded opaque
references, integer 0..10000. The server chooses the quote's approved policy.
No raw facts, tenant override, rulebook, approval flag, cost, margin or URL.
`decide_get_quote_discount_decision`: `decision_id` only.

## Evaluation
The owner explicitly configures currency, maximum automatic discount in basis
points and minor units, minimum post-discount gross-margin basis points, effective
and expiry times, maximum fact age and decision lifetime. No policy is activated
by example use or an agent call. Changed content requires a new policy version.

Quote amounts are integer minor units in the policy's currency. Discount amount
is floor(list_amount_minor * discount_bps / 10000), with BigInt intermediates.
Post-discount gross margin is floored to basis points. A zero net amount is
denied; insufficient margin is denied; exceeding the automatic discount limits
requires the customer's review; missing cost yields the evaluator's needs_input
review. Stale/future facts, currency mismatches and unavailable authority are
errors, never implicit allows. No exchange rates or tax interpretation.

## Persistence and action gate
SQLite is a dependency-free LOCAL reference store using installed Node 24.
Checks, saved records, idempotency and consume claims use atomic transactions.
Same workspace/request ID and exact proposal return the same record; changed
proposal conflicts. Retries never extend validity. Returned records cannot
authorize by themselves and say `execution_authority: none`.

Consume requires an executor, stored decision reference and the exact proposal.
It rechecks the current agent grant, policy epoch/version/hash, quote epoch/hash,
resource revision, fact freshness and decision deadline. Only a matching `yes`
can be claimed. There is at most one claim for a workspace/quote revision; repeat
identical consumption reports an existing claim, not permission to execute again.
No claim proves an external action was applied. A real executor still requires
provider conditional writes, stable idempotency and durable reconciliation.

## Design review
| Finding | Disposition |
| --- | --- |
| Shared deterministic evaluator, strict reference-only arguments | Good |
| Cross-workspace/object access | Enforce stored membership and policy grants on every operation |
| Caller-supplied facts/policies/results | Reject unknown input keys; setup methods not in MCP |
| Changed policy/quote or revocation after evaluation | Recheck current stored epochs/grants at consume |
| Restart, retry and concurrent checks/claims | Local durable SQLite transactions and unique constraints; test with independent connections/workers |
| Production authentication/storage/provider execution | Not claimed; separate integration and release gates |
| Paid metering/distribution readiness | Unchanged; do not publish the local service as customer-ready |

Existing REST/SDK/Policy Notaries contracts and signatures remain unchanged.
This specialized local record is not a new version of the public Decision Record
or a signed production approval format. Its eventual host must use the existing
runtime's signed record/binding contract and approved account/usage infrastructure.

## Portable domain boundary

`domain.cjs` exposes exact-input validation and `buildQuoteDiscountInput`, a pure
integer normalization/Rulebook builder with no SQLite, identity, network or
verdict engine. Both this local service and the separate local authenticated
sandbox candidate use the same bytes. The sandbox supplies immutable fictional
facts and limits and uses its existing signed Runtime record and shared free
allowance. It does not import this local consume gate or claim production quote
authority. The portable builder alone is not a freshness or permission check;
this service retains its current-policy, quote, grant and deadline enforcement.
