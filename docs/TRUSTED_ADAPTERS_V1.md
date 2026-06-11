# Decide Trusted Adapters v1

Status: Implemented first-party extension contract
Manifest version: `trusted_adapter_manifest_v1`
Effective: 2026-06-11

## Decision

Decide supports both:

1. declarative Rulebook v1 evaluation as the binding verdict core
2. registered first-party code adapters for bounded fact normalization

Customer-supplied executable code is not accepted. A trusted adapter cannot
select the final verdict. It emits schema-validated facts, then Rulebook v1
selects the outcome.

## Invocation Contract

```json
{
  "adapter_id": "solana_execution_gate",
  "version": "1.0.0",
  "manifest_hash": "75f30d8f83aa6cec814ff9f1deeaa71b8599ff5c92637b0f319085f821855f03",
  "input": {}
}
```

The runtime resolves only an exact registered `adapter_id` and `version`. The
request must pin the current manifest hash. Unknown fields, versions, hashes,
and invalid inputs are rejected.

## Manifest Contract

Each adapter manifest records:

- stable adapter ID and semantic version
- implementation revision
- SHA-256 hash of the bundled function source
- strict input and output schemas
- denied network, clock, randomness, environment, and cross-invocation mutable state capabilities
- one-shot worker isolation, empty environment, hard timeout, and resource limits
- SHA-256 manifest hash over the complete materialized manifest

The response attestation adds canonical input and output hashes plus the
execution-isolation, capability-enforcement, and timeout contract.

## Runtime Rules

- canonical adapter input is deep-frozen before execution
- each invocation runs in a fresh worker thread with an empty environment
- common ambient network, clock, timer, and randomness globals are denied
- a registration-time source audit rejects direct references to denied ambient capabilities
- the parent runtime enforces a 250 ms hard timeout and worker resource limits
- output must exactly match the registered schema
- adapter exceptions fail closed
- invalid output fails closed
- adapter requests cannot also supply `context.inputs`
- no LLM fallback is allowed
- Rulebook v1 remains the only binding verdict selector

## Registry And Replay

The public Decision Record layer binds an adapter-backed rulebook version to:

- evaluator version
- adapter ID and version
- implementation revision and source hash
- manifest hash

Historical replay restores the original adapter invocation and immutable
rulebook snapshot. A different adapter dependency or attestation is rejected
instead of being reported as a successful reproduction.

## First Production Application

`solana_execution_gate@1.0.0` normalizes bounded Solana treasury facts for the
Krafthaus Solana Execution Gate. The browser does not score or select a verdict.
It sends validated inputs to Krafthaus, which calls Decide server-side with the
pinned adapter and Rulebook v1.

## Honest Boundary

Trusted adapters are reviewed code bundled with Decide, not untrusted plugins
and not a general-purpose or OS-level sandbox. V1 enforces one-shot worker
isolation, an empty environment, hard time/resource limits, common ambient
capability denial, and source auditing. A reviewed adapter module could still
be unsafe if it deliberately bypassed those JavaScript-level controls, so
registration review remains part of the trust boundary.
