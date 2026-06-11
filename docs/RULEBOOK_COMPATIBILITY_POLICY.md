# Rulebook Compatibility Policy

Status: Accepted
Policy version: `compatibility_policy_v1`
Effective: 2026-06-11

## Purpose

This policy defines how Decide can change Rulebook v1 evaluators, rulebooks,
trusted adapters, replay behavior, and public response contracts without
weakening its deterministic production claims.

Rulebook v1 remains declarative. Customer-supplied executable policy logic is
outside this contract and would require a separate architecture decision plus a
new versioned public contract.

## Compatibility Classes

Decide treats compatibility as three separate surfaces:

- Historical replay compatibility: existing Decision Records replay from their
  stored canonical input, immutable rulebook snapshot, evaluator version, and
  trusted-adapter lineage.
- New evaluation compatibility: new decisions can opt into newer evaluators,
  rulebooks, or adapters only through explicit versioned registration.
- Public API compatibility: REST, MCP, SDK, and docs contracts can add optional
  fields, but cannot remove, rename, or change the meaning of stable fields
  without a new versioned surface.

## Non-Negotiable Invariants

The same `rulebook_id` plus `version` cannot bind to a different canonical rulebook hash.

The same `rulebook_id` plus `version` cannot silently move to a different evaluator version.

Adapter-backed rulebooks bind to one exact adapter ID, adapter version, manifest
hash, and bundled implementation hash.

Historical replay never reinterprets stored records with the current evaluator or adapter.
It restores the stored snapshot and lineage, then reports whether the
historical semantic output is reproduced.

Adapter dependency changes require a new adapter version, a new manifest hash, and an explicit rulebook version migration.

## Evaluator Migration

An evaluator change is compatible only when existing conformance fixtures and
the golden replay corpus prove that all existing Rulebook v1 semantic outputs
are unchanged.

Any change that can affect condition evaluation, priority ordering, lexical
tie-breaking, schema validation, canonicalization, hashing, default-outcome
selection, adapter-fact consumption, error classification, or attestation bundle
material requires a new evaluator version.

Existing records keep their stored evaluator version for historical replay. A
rulebook can opt into a new evaluator only through a new rulebook version or an
explicit registry migration entry. Silent rebinding is prohibited.

The evaluator migration gate is:

1. update the migration note and expected impact
2. run public conformance fixtures
3. run the golden replay corpus
4. run first-party application contract checks for Solana Execution Gate,
   Refund Notary, Trial Notary, Cancel Notary, and Return Notary
5. verify registry attestation and replay metadata
6. deploy only through explicit versioned references

Rollback for new evaluations is a routing or version-selection change back to
the previous evaluator and rulebook version. Historical replay is unaffected.

## Adapter Migration

An adapter change requires a new adapter version or manifest hash when it
changes source code, implementation revision, input schema, output schema,
emitted fact semantics, capability contract, timeout/resource limits, or source
audit requirements.

If a rulebook consumes adapter facts, changing the consumed fact semantics is
breaking even when the JSON field names stay the same. Additive output fields
are compatible only when they are optional, schema-valid, and not consumed by
the existing rulebook version.

Changing an adapter dependency for an existing rulebook requires a new rulebook
version or explicit adapter-dependency migration. Old records continue to use
the stored adapter attestation and historical replay lineage.

Capability-contract changes require an architecture review and documentation
update before production use.

## Rulebook Migration

Rule text, condition structure, priority, default outcome, reason-code meaning,
action meaning, outcome enum meaning, required input fields, or policy-source
meaning changes require a new rulebook version.

Optional additive input fields are compatible only when existing required fields
remain unchanged and the same existing inputs still produce the same semantic
outputs.

Required input additions, outcome removals, outcome renames, or changed
verdict/action/reason semantics are breaking migrations.

## Public API Compatibility

REST and MCP responses may add optional fields under existing objects such as
`rulebook_result`, `rulebook_attestation`, `trusted_adapter`, or structured
content.

Stable fields must not be removed, renamed, or semantically repurposed without a
new versioned API, MCP tool, SDK, or response contract. Stable fields include:

- `verdict`
- `application_verdict`
- `code`
- `reason_code`
- `action`
- `matched_rule_id`
- `policy_hash`
- `source_hash`
- `input_hash`
- `rulebook`
- `evaluator_version`
- `rulebook_registry`
- `rulebook_attestation`
- `rulebook_attestation.signature`
- `trusted_adapter`

Existing notary verdict and code meanings must remain stable. New verdicts or
codes are allowed only as additive enum expansion with docs and tests.

## Release Checklist

Before shipping evaluator, rulebook, adapter, or public response compatibility
changes:

1. document the migration intent and compatibility class
2. update or add conformance fixtures
3. run the golden replay corpus
4. run app-specific contract and smoke checks
5. update public docs, schemas, SDK notes, and examples when the public surface
   changes
6. verify registry, attestation, signature, and replay metadata
7. deploy through explicit versioned references
8. run production smoke checks against the affected surfaces
