# Changelog

## 0.1.18

- Publishes the SDK source in the public `decidefyi/decide` repository.
- Licenses the SDK under Apache-2.0 and includes the license in the package tarball.
- Adds accurate repository, homepage, author, description, and bounded discovery metadata.
- Keeps runtime behavior and the exported API unchanged from `0.1.17`.

## 0.1.17

- Removes the inaccessible private repository and issue-tracker links from the public npm manifest.
- Routes SDK support and bug reports to the public Decide issue tracker.
- Clarifies that the published npm tarball is the inspectable SDK artifact; this release does not change runtime behavior.

## 0.1.16

- Adds `verifyApplicationBinding(record)` for checking `decide_application_binding_v1` pre-handoff material.
- Adds `decide verify --application-binding` so CLI verification can fail closed when app-level records are missing `rulebook_contract`, `runtime_binding`, verdict/action material, `input_hash`, or `rulebook_attestation.bundle_hash`.
- Binds `rulebook_contract`, `runtime_binding`, and `rulebook_attestation` into SDK record-hash verification when those fields are present.
- Keeps application-binding checks separate from receipt/hash verification while exposing the result in CLI JSON and summary output.

## 0.1.15

- Exposes `RuntimeBinding` and a typed `DecisionRecord.runtime_binding` for Rulebook v1 responses.
- Documents the supported production binding modes: `direct_declarative_rulebook` and `trusted_adapter_facts_then_declarative_rulebook`.
- Keeps customer-supplied executable rulebooks explicitly rejected in the public SDK contract.

## 0.1.14

- Adds `decisionPacket(decisionId, options)` for exporting portable Decision Packet v1 proof bundles from `/api/decision/:id/packet`.
- Adds the `decide verify-packet` CLI and packet verifier helpers for offline packet hash, embedded record, execution, outcome, intelligence, and audit-chain checks.
- Adds `rulebookMetadata(options)` for exact tenant-scoped immutable rulebook metadata lookup without exposing stored snapshot bodies.
- Adds `decide rulebook-conformance` and `runRulebookConformance()` for running the public Rulebook v1 conformance fixture index against a target Decision API endpoint.
- Documents historical Rulebook v1 replay and current-mode diff semantics.
- Documents and types trusted adapter invocation and attestation lineage for adapter-backed Rulebook v1 applications.
- Verifier `record_hash` checks bind Rulebook v1 application verdicts, registry attestations, trusted adapter attestations, and adapter facts when present.

## 0.1.13

- Ships `sdk/examples/lifecycle-proof-pack.js` to demonstrate the buyer proof path from Decision Record to execution receipt, Outcome Record, policy effectiveness score, and anomaly review.

## 0.1.12

- Adds `recordExecution(decisionId, body, options)` and `listExecutions(decisionId, options)` for target-system neutral action execution receipts.
- Ships `sdk/examples/action-execution-receipt.js` so integrations can prove the authorized mutation was executed, skipped, failed, or reverted before reporting outcomes.

## 0.1.11

- Adds `counterfactuals(decisionId, body)` for evaluating labeled what-if scenarios against a stored Decision Record.
- Ships `sdk/examples/counterfactual-analysis.js` with a simulation-only pricing exception comparison.

## 0.1.10

- Adds `policyPatterns(options)` for reading first-party Decision API pattern templates from `/api/decision/policy-patterns`.
- Ships `sdk/examples/policy-patterns.js` so integrations can start from versioned policy templates instead of blank payloads.

## 0.1.9

- Adds `recordCrmSync(decisionId, body, options)` and `listCrmSyncs(decisionId, options)` for CRM write-back receipts.
- Ships `decision_crm_sync_v1` examples that map Decision Record fields onto CRM fields without storing CRM credentials.

## 0.1.8

- Adds `policyBenchmarks(policyId, options)` for opt-in anonymized cross-customer policy benchmarks.
- Returns `decision_benchmark_v1` with caller metrics, cohort thresholds, anonymized percentiles, comparison deltas, and `benchmark_hash`.

## 0.1.7

- Adds `policyConfidence(policyId, options)` for predictive confidence baselines from caller-scoped Outcome Records.
- Documents the `decision_confidence_v1` block returned on new Decision Records, including score, level, recommendation, and `confidence_hash`.

## 0.1.6

- Adds `decisionChain(chainId, options)` for reading the cryptographic audit trail attached to Decision Records.
- Surfaces `audit_chain` metadata with rolling Merkle roots, chain positions, link hashes, and retained-link verification.

## 0.1.5

- Adds `policyAnomalies(policyId, options)` for deterministic, Outcome Record based anomaly reports.
- Returns explainable reason codes, policy baselines, severity, and a hashed `decision_anomaly_report_v1` envelope.

## 0.1.4

- Adds `policyEffectiveness(policyId, options)` for Outcome Record based policy scoring.
- Keeps policy effectiveness explicitly scoped to the caller API key and labels false-positive/false-negative values as outcome proxies.

## 0.1.3

- Adds SDK helpers for Decision Outcome tracking: `recordOutcome(decisionId, body, options)` and `listOutcomes(decisionId, options)`.
- Adds a packaged outcome-tracking example that records what happened after a Decision Record authorized a billing mutation.

## 0.1.2

- Adds Decision Record v1 conformance fixtures for valid verification, tamper rejection, and replay/diff examples.
- Includes fixture checks in the SDK package release test so verifier behavior stays stable across releases.

## 0.1.1

- Adds packaged integration examples for billing discount gates, webhook/queue workers, and agent action authorization.
- Documents the examples as first-party SDK adoption paths for state-changing workflows.

## 0.1.0

- Initial JavaScript client for the Decide Decision API protocol.
- Includes decision creation, exported-record verification, ledger verification, lookup, replay, diff, receipt key registry, policy bundle registry, and status helpers.
- Adds the `decide verify` CLI for local Decision Record verification in CI, support packets, and audit workflows.
- Includes a GitHub Actions example for verifying exported Decision Records in CI.
