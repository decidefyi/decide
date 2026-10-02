# Approved-action production path

Status: Implementation sequence, not a production feature
Date: 2026-09-23
Architecture authority: [Ecosystem Constitution](ECOSYSTEM_CONSTITUTION.md)

## Outcome

An application can enforce an owner-approved decision for an exact proposed
action, then link the attempted execution and observed result to the same
record. A second, independent application must be able to use the same core
contract without adopting Krafthaus or copying its business logic into Decide.

No public endpoint or MCP tool is introduced by this document. The existing
Rulebook v1 developer API and private-preview Runtime MCP remain unchanged.
The local preview adds optional signed authority material to Decision Record v1
without changing hashes for records that lack it. Calling the raw-rulebook evaluator is not equivalent
to obtaining permission under independently approved rules.

## Verified starting point and limits

- The engine evaluates Rulebook v1, including bounded trusted-adapter facts.
  The `decidesite` adapter owns the current customer-facing record lifecycle.
- Krafthaus owns application-specific fact gathering, packet validation and the
  `POST /api/workflow-app-lifecycle` facade. It does not become the record engine.
- The unmerged MP-02 work in the canonical development checkout includes an
  approved-binding model. Its documented evaluation entries are unsigned and
  in memory. Synthetic credentials and facts are not production identity or
  provenance. It must be reconciled with the current baseline before reuse.
- That experiment provides no durable distributed claims, external provider
  submission, recovery or reconciliation. A successful model test is not proof
  that any customer action has been controlled in production.

## Decisions fixed by the architecture

1. **Keep two caller profiles.** Developer evaluation can accept a Rulebook v1
   supplied by a trusted application. An untrusted agent's approved-action
   check references a stored approved configuration, an explicit proposal, a
   trusted fact snapshot and an idempotency key. It cannot submit replacement
   rules, approval flags, credentials or manufactured Decision Record material.
2. **Separate permissions.** A rule owner may draft, validate, activate and
   suspend a configuration. A permitted requester may evaluate an action. A
   trusted executor may claim and attempt execution. Checking an action must
   not grant rule-activation or provider-mutation authority.
3. **Use one decision contract.** REST, SDK and MCP call the same underlying
   authority and evaluator implementation. Do not build separate MCP semantics
   or a second unsigned record format.
4. **Keep business execution in the application.** Provider credentials, target
   reads, human review, provider idempotency, reservations and reconciliation
   belong to Krafthaus or the independent application. Decide owns generic
   authority checks and evidence contracts, not provider-specific mutations.
5. **Keep records distinct from reality.** An approval is not execution. A
   claim is not provider submission. A timeout is not proof of failure. An
   application-reported receipt is not independently verified external truth
   unless its provenance and verification method establish that explicitly.

## Production slices and acceptance evidence

All rows below are open production requirements, not completed claims.

| Slice | Responsible component | Required verification before release |
| --- | --- | --- |
| Owner-approved configuration | Decide authority service and developer administration | Immutable content/version binding; separate owner and requester permissions; activation, suspension and revision conflicts tested |
| Identity and tenancy | Existing Decide authentication boundary | Workspace derived from verified credentials; cross-workspace access refused; scoped grants, credential rotation, revocation and legacy-key recovery tested |
| Trusted fact snapshots | Application sources plus Decide evidence validation | Source identity, observed time, schema, resource version and hash retained; agent-supplied assertions cannot silently become trusted facts; stale or future facts refuse automatic execution |
| Exact-action decision | Decide evaluator and record adapter | Actor, operation, target, mutation, parameters, rule version and validity covered by the record; changed parameters or copied evidence cannot authorize a different action |
| Durable claim | Decide authority persistence | Atomic workspace/operation uniqueness, request fingerprint and authority revision checks; competing processes cannot both obtain a new claim; retries do not renew expiry or revive revoked authority |
| External execution | Krafthaus or independent trusted executor | Non-bypassable enforcement; provider preconditions and idempotency tested; shared-budget/resource reservations occur at an authoritative transaction boundary |
| Completion and recovery | Application plus Decide receipt/outcome contracts | Restart after claim, submission timeout, delayed success, duplicate callback, out-of-order events and reconciliation all retain distinct states and do not blindly resubmit |
| Evidence and operations | Decide record adapter and accountable operator | Covered signed material, verifier rotation, retention/access revocation, quotas, load, outage behavior and audit visibility validated; no unsigned fallback represented as production authority |
| Reuse and demand | Krafthaus plus independent integrator | One real Krafthaus workflow and one materially different independent application use the same versioned contract; integration effort and observed operational benefit recorded |

## Implementation order

### Verified prerequisite improvement, 2026-09-23

The site adapter's existing Rulebook registry now has a local implementation of
atomic Redis version/snapshot publication and fail-closed stored snapshot checks.
Its real-store suite covers separate Node processes, crash recovery, lost
acknowledgments, lineage conflicts, corrupt content, tenant mismatch and signed
registration requirements. The wire format and key layout are unchanged.

This is a prerequisite improvement, not completion of any production authority
row above. It has not been deployed or verified against the managed provider.
The identity, binding, fact, signed-decision, claim and execution-report previews
below build on it. Actual provider acceptance and production operations remain
open. See the site's
[`RULEBOOK_REGISTRY_ROLLOUT.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/RULEBOOK_REGISTRY_ROLLOUT.md)
for the local test and recovery boundaries, and
[competitive evidence](DECISION_API_COMPETITIVE_SCORECARD.md) for comparison gates.

### A. Resolve the production contract before routing traffic

The next locally implemented prerequisite is the adapter's disabled-by-default
identity preview. It maps explicitly enrolled owners to stable workspace and
principal IDs and issues distinct, finite-lived requester/executor credentials.
Real Redis/HTTP tests cover rotation, revocation, lost-response recovery,
cross-workspace refusal and an eight-process credential-replacement race. Its
versioned OpenAPI contract and runbook live in
[`DECISION_AUTHORITY_IDENTITY_PREVIEW.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/DECISION_AUTHORITY_IDENTITY_PREVIEW.md).

The companion binding lifecycle is now also implemented locally. Enrolled
owners create immutable configurations, then activate or suspend them using
revision checks and finite windows. Delegates have scoped read access, never
configuration-write authority. Actual engine validation precedes signed registry
publication. Separate API processes, forced restart, lost replies, corrupt data
and tenant isolation are covered by the real Redis/HTTP suite. See the site's
[`DECISION_AUTHORITY_BINDINGS_PREVIEW.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/DECISION_AUTHORITY_BINDINGS_PREVIEW.md).

The engine's new [internal validator contract](../contracts/rulebook-validation-preview.openapi.json)
is disabled by default and requires a dedicated server credential. It reuses
Rulebook v1 semantics without emitting a decision, making model calls or logging
decision records. It is a prerequisite for the site authority service, not a
second public evaluator or a change to existing runtime schemas.

Authenticated application fact publication is now also locally implemented in
the adapter. An owner pins one source principal; evidence is immutable and bound
to the requester, operation, exact proposal, config hash and approval epoch.
Publication atomically rechecks source/requester credentials, binding state and
freshness using Redis time. Local HTTP/Redis tests cover in-flight revocation,
rotation, expiry, suspension, process races and recovery. See the site's
[`DECISION_AUTHORITY_FACTS_PREVIEW.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/DECISION_AUTHORITY_FACTS_PREVIEW.md).
Authenticated evidence is not independent truth or a signed action decision.

The signed operation-decision preview now consumes those facts through the real
evaluator and persists one Ed25519-signed Decision Record per workspace operation.
The record covers the full exact proposal, approval epoch, source/requester
revisions, resource version and expiry. A final Redis transaction rechecks all
current state after evaluation/signing. Real HTTP/Redis tests cover concurrent
publication, forced restart, lost replies, substitution, late revocation and
expiry. Server and SDK verification cover the optional versioned extension;
historical retries never renew authority. See the site's
[`DECISION_AUTHORITY_OPERATIONS_PREVIEW.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/DECISION_AUTHORITY_OPERATIONS_PREVIEW.md).

The separate [internal evaluation contract](../contracts/rulebook-evaluation-preview.openapi.json)
requires its own server credential, has no model/provider side effects and
delegates all verdict selection to the existing Rulebook v1 evaluator. It is
not a second public authority service.

The companion durable-claim preview now pins an executor independently of the
fact publisher. One immutable workspace/operation claim binds an exact decision,
proposal, resource version and executor attempt. Successful PUT creation and
retry compare current authority atomically; replay never renews its deadline.
GET recovers history without conferring permission. Local Redis/HTTP tests cover
independent-process races, lost responses, restart, revocation and expiry. See
[`DECISION_AUTHORITY_CLAIMS_PREVIEW.md`](https://github.com/nodeblur-hub/decidesite/blob/main/docs/DECISION_AUTHORITY_CLAIMS_PREVIEW.md).

The companion execution-report preview now retains immutable, executor-attributed
history for each claim. Only the claim's named executor with a current grant can
write; unknown can resolve once to succeeded or not executed. Reports remain
accountable after expiry or suspension without renewing permission. Checksums
bind the report chain, not independent provider truth or a portable signature.
See [`DECISION_AUTHORITY_EXECUTION_PREVIEW.md`](https://github.com/nodeblur/decidesite/blob/main/docs/DECISION_AUTHORITY_EXECUTION_PREVIEW.md).

This is not a completed execution-authority product. Claims are authenticated
service state, not portable signed bearer permissions or proof of external
execution. The adapter now also has local
[workspace controls](https://github.com/nodeblur/decidesite/blob/main/docs/DECISION_AUTHORITY_WORKSPACES_PREVIEW.md):
explicit owner initialization, atomic suspension of new authority, and resumed
generations requiring binding reapproval. History and executor reports remain
available. This does not revoke a claim already issued or stop a dispatched
provider call. Krafthaus's local application integration is described below;
managed-store acceptance, key history and actual provider acceptance remain open. The normal
evaluator and MCP have not been changed to accept delegated credentials. No
release occurred.

Reconcile the local MP-02 experiment with current `origin/main` in an isolated
checkout. Specify versioned request, decision-authority and execution-claim
schemas alongside the existing record/signature contracts. Do not overload an
existing `yes` result with a stronger implied authorization guarantee.

Document the selected identity/grant model, authoritative durable store and
transaction strategy before implementing them. Reuse existing supported
infrastructure where it can meet the contract. No new paid provider or account
is implied by this plan. The provider choice, migration/recovery design and
operational owner are unresolved production decisions, not facts established by
the local prototype.

### B. Implement the reusable authority path, disabled by default

Use test-first public-interface tests for owner-only activation, cross-workspace
access, immutable versions, freshness, exact proposal matching, expiry,
revocation, idempotency and storage outages. Add genuine multi-process
concurrency and restart tests against the selected persistent store. A
single-process `Promise.all` test is insufficient.

Version authority material under the existing signed record model. Record the
ordering point for suspension versus a claim. A suspension must block later
claims; it cannot promise to reverse a request already submitted externally.
Repeated checks must not turn the same operation into a new execution grant.

### C. Connect one real application

The Krafthaus server-only quote-discount preview now owns a durable app attempt,
obtains the exact claim, and submits one conditional request to a contract-faithful
local provider. The provider fixture atomically checks the approved resource
version and original deadline and retains an idempotent operation result. Only
one independent app worker can confirm the dispatch marker; later invocations
read the provider record and synchronize receipts without another submission.

End-to-end tests use actual engine and authority HTTP handlers, socket-only Redis
and separate app processes. They cover lost provider responses, forced restart,
late deadlines, version conflicts, swapped evidence, lost store acknowledgments,
revoked authority and unknown-to-terminal reconciliation. An authority outage
does not prevent read-only provider recovery; report synchronization can finish
later. A crash before network submission remains unknown until it can be safely
resolved, not permission to retry. No provider account or real connector was
provisioned, and no hosted flag was enabled. See
[`QUOTE_DISCOUNT_EXECUTION_PREVIEW.md`](https://github.com/nodeblur/krafthaus/blob/main/docs/QUOTE_DISCOUNT_EXECUTION_PREVIEW.md).

The user-selected Krafthaus pilot now also has a persistent draft-quote target
implemented as application code, separate from that fixture. It authenticates
the retained exact Decide claim and atomically writes the conditional quote
change, immutable revision and recoverable operation result. Local actual-handler
tests connect it to the executor and authority path, including lost-response
recovery during an authority outage. See
[`QUOTE_SANDBOX_PREVIEW.md`](https://github.com/nodeblur/krafthaus/blob/main/docs/QUOTE_SANDBOX_PREVIEW.md).
It remains disabled and unhosted. The companion application-owned
[workflow initiator and fact publisher](https://github.com/nodeblur/krafthaus/blob/main/docs/QUOTE_WORKFLOW_PREVIEW.md)
now accepts only a quote ID, expected version and discount. It reads the stored
quote, retains the original observation, publishes source-attributed facts,
requests the actual Decide decision and calls the existing executor for an ok
yes. Retries do not refresh evidence or create another provider attempt. The
combined local workflow/target/executor suite passes 99 nodes, including local
route rewrites, origin-scoped protected service access and lost-response
recovery through those connections. Actual hosted routing/protection checks,
isolated storage, credential and operational acceptance remain required.

This local implementation does not close the real-application requirement.
The site and Krafthaus repositories are private. Cross-repository CI still needs
explicit read access and reviewed source SHA pins; local integration is not a
green hosted CI or release result.

Use Quote Approval as the first technical reference because existing fixtures
already exercise it, not because a buyer or market advantage has been proven.
Connect a confirmed customer target only after its identity, permissions,
provider behavior and release authority have been resolved.

The Krafthaus server supplies or resolves trusted facts, preserves the signed
Decision Record, obtains the required claim, and calls the provider. The browser
or agent cannot choose a different approved action or directly obtain mutation
credentials. Missing decision evidence, `no` and `review` cannot proceed.

Exercise recovery against a provider test environment before any real customer
mutation. The receipt/outcome path must distinguish reported, verified,
pending and unknown results rather than showing a green success on submission.

### D. Establish external reuse before expanding distribution

An independent application must use the same API and evidence contract. Do not
count a second internally copied demo as external adoption. Capture setup time,
custom integration code, review effort, denied or deferred attempts and
reconciled outcomes. Set commercial success criteria with the actual buyer.

Only after identity, persistence, failure handling, independent review and
operational ownership are evidenced should the new profile enter an authorized
preview. Public MCP listing, general availability and stronger marketing claims
require separate release evidence. The existing Runtime MCP remains private
preview until its own release requirements pass.

## Non-goals for this sequence

- Replacing transactional business systems, authorization providers or durable
  workflow orchestration merely because they also make decisions.
- Moving stable policy endpoints to a new hostname or renaming wire fields.
- Broadening Policy Notaries into the definition of Decide.
- Describing the entire agent or workflow as deterministic AI.
- Claiming exactly-once external execution from a successful local claim test.
