# Decide Application Binding v1

Status: Active downstream binding contract
Contract version: `decide_application_binding_v1`
Runtime manifest: `https://api.decide.fyi/manifests/rulebook-runtime-v1.json`

## Purpose

This contract defines what a Krafthaus workflow application must bind before it
claims a deterministic Decide-backed verdict.

Krafthaus can be broad in application shape. Decide stays narrow at the
production boundary: a versioned Rulebook v1 evaluation, optional first-party
trusted adapter facts, and Decision Record material captured before a human or
software action is handed off.

## Binding Rule

A production Krafthaus application must call Decide before the governed action
or handoff executes.

The application may use one of two fact sources:

- `context.inputs`: explicit caller-supplied facts evaluated directly by
  Rulebook v1.
- `adapter_facts`: facts emitted by a registered first-party trusted adapter
  before Rulebook v1 selects the binding outcome.

The rulebook remains the only binding verdict selector. Trusted adapters produce
facts only. LLMs may help draft, extract, summarize, or explain, but
`llm_output_is_binding_production_verdict` is a prohibited claim.

## Required Decision Material

Before execution handoff, the application must capture the following response
material:

- `rulebook_contract`
- `runtime_binding`
- `verdict`
- `application_verdict`
- `action`
- `reason_code`
- `matched_rule_id`
- `rulebook.hash`
- `input_hash`
- `rulebook_attestation.bundle_hash`

This material is the minimum bridge from a Krafthaus workflow surface to a
replayable Decide evaluation. It lets the application explain what happened,
which rulebook contract was enforced, which fact source was consumed, and which
semantic tuple can be replayed later.

## Prohibited Claims

An application must not claim Decide-backed deterministic execution when:

- `llm_output_is_binding_production_verdict`
- `customer_executable_code_runs_as_rulebook_v1`
- `action_executes_before_decision_material_is_captured`

If a workflow needs customer-authored executable policy logic, it requires a
future versioned contract. It is not Rulebook v1.

## Public Verification

The active runtime manifest publishes the same requirements under
`application_binding`.

Conformance fixtures:
`https://api.decide.fyi/conformance/rulebook-v1/index.json`

Golden replay corpus:
`https://api.decide.fyi/replay/rulebook-v1/index.json`

If a Krafthaus application cannot point to the runtime manifest, conformance
fixtures, and replay corpus for its binding mode, it should be described as
AI-assisted or exploratory, not as a deterministic production Decide verdict.
