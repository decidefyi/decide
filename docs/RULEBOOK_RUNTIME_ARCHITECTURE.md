# Rulebook Runtime Architecture

Status: Accepted

Date: 2026-06-11

## Decision

Rulebook v1 is the public production determinism contract for Decide.

The production core is
`hybrid_declarative_rulebook_with_trusted_adapters`. The runtime supports two
binding modes:

- `direct_declarative_rulebook`, where caller-supplied `context.inputs` feed the
  declarative evaluator directly.
- `trusted_adapter_facts_then_declarative_rulebook`, where a registered
  first-party adapter emits bounded facts before Rulebook v1 selects the
  verdict.

Production calls that need deterministic, replayable verdicts use a limited
declarative rule format:

- `schema_version`
- `rulebook_id`
- `version`
- optional `input_schema`
- ordered `rules`
- `default_outcome`

The rulebook selects the binding application verdict, reason code, matched rule,
and action. It is closed, canonicalized, hashed, registered by the public
Decision Record layer, and replayed from an immutable snapshot.

Successful Rulebook v1 evaluations include a `rulebook_attestation_v1` registry
attestation: canonical engine, evaluator, rulebook hash, input hash, outcome,
and trusted-adapter lineage, plus a SHA-256 `bundle_hash` over that material.
This is the replay binding surface for downstream Decision Records.
Environments with `DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM` configured also
return a `rulebook_attestation_signature_v1` Ed25519 signature over the
`bundle_hash`. Verification keys are published at
`/.well-known/rulebook-attestation-keys.json`.

Production can set `DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true` to
fail closed. With that guard enabled, Rulebook v1 responses must be signed; if
the signing key is missing or invalid, `/api/decide` returns
`RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED` instead of a successful unsigned
decision.

Production can publish rotated verifier keys with
`DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON`. The active key continues to
sign new responses. Retired keys are published through the same well-known
endpoint so older Decision Records remain independently verifiable after key
rotation. Invalid key history fails closed at the verifier endpoint rather than
publishing a partial or malformed keyset.

Customer-supplied executable rulebooks do not run inside Decide.

Executable code is allowed only through registered first-party trusted adapters.
Trusted adapters may emit facts, but they do not select the binding verdict.
The declarative Rulebook v1 evaluator consumes those facts and remains the
production decision boundary.

## Runtime Boundary

The engine enforces the boundary in two places:

- Rulebook v1 validates the request rulebook against the published JSON Schema,
  then applies semantic checks for evaluator limits such as unique rule IDs.
- Trusted adapter invocation validation accepts only `adapter_id`, `version`,
  `manifest_hash`, and bounded `input`.

Executable-looking fields such as `code`, `source`, `script`, `function`,
`handler`, `javascript`, `typescript`, and `wasm` are not contract fields. They
are rejected as unknown fields rather than ignored.

Requests that explicitly ask for `binding_mode: "customer_executable_rulebook"`
fail closed with `RULEBOOK_BINDING_MODE_UNSUPPORTED`. Rulebook v1 does not
silently reinterpret that request as a direct declarative rulebook call.
Supported binding modes must also match request material; for example,
`trusted_adapter_facts_then_declarative_rulebook` requires an `adapter` request
and otherwise returns `RULEBOOK_BINDING_MODE_CONFLICT`.

Rulebook requests also fail closed when callers provide output-only Decision
Record material such as `runtime_binding`, `trusted_adapter`, `adapter_facts`,
`rulebook_attestation`, `application_verdict`, or `action`. Decide generates
that material after validation and evaluation; accepting it on input would blur
the production authority boundary. These requests return
`RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN`.

Successful and `needs_input` Rulebook v1 responses expose `rulebook_contract`
with the enforced schema version, schema URL, schema hash, and evaluator
version. They also expose `runtime_binding` with the production core, binding
mode, verdict authority, adapter authority when present, and rejected
customer-code stance.

Legacy `single`, `multi`, and `runtime` responses expose `decision_contract`
instead of `rulebook_contract` or `runtime_binding`. That contract marks them as
`authority: "advisory_only"` with `production_verdict: false` and points binding
callers to Rulebook v1. The field exists to keep AI-assisted exploration
available without letting LLM output masquerade as the deterministic production
boundary.

## Why

Decide's credibility depends on deterministic behavior that customers can
inspect, hash, verify, replay, and explain later. A small declarative rulebook is
easier to validate and easier to trust than customer-supplied executable code.

This also preserves the product split:

- Decide owns deterministic evaluation, lineage, policy hashes, replay, and
  Decision Record infrastructure.
- Krafthaus owns the workflow surface that installs Decide into one
  consequential customer action boundary.
- Trusted adapters bridge real workflow inputs into normalized facts without
  turning the public rulebook contract into arbitrary code execution.

## Trusted Adapter Boundary

A trusted adapter is registered first-party infrastructure, not a customer
executable rulebook. It must have:

- explicit adapter id and semantic version
- pinned manifest hash
- bundled implementation hash
- strict input and output schemas
- registration-time capability checks
- one-shot worker execution
- empty environment
- hard time and resource limits
- denied common ambient capabilities
- Decision Record lineage for adapter input, emitted facts, manifest, and
  implementation

Worker-thread isolation is an execution guardrail, not an OS sandbox.

The `ambient_capability_deny_v2` runtime locks environment, high-resolution
clock, Web Crypto randomness, network, and timer globals before invoking the
adapter. Adapter attempts to use or replace those globals fail with
`TRUSTED_ADAPTER_CAPABILITY_DENIED`.

Three Krafthaus application patterns now exercise this architecture:

- Solana Execution Gate uses a registered trusted adapter to derive bounded
  execution facts before declarative evaluation.
- Decision Memo Readiness Gate uses a registered trusted adapter to derive
  bounded packet completeness facts before advisory memo analysis can run.
- Krafthaus Workflow Readiness Binding uses a registered trusted adapter to
  derive bounded workflow readiness facts before a workflow application binds an
  action path.
- Refund, Trial, Cancel, and Return Policy MCP notaries supply normalized
  policy facts directly to Rulebook v1 and require no trusted adapter.

Evaluator, rulebook, trusted-adapter, replay, and public response migrations are
governed by [Rulebook Compatibility Policy](RULEBOOK_COMPATIBILITY_POLICY.md).

## Future Changes

If Decide later supports customer-authored executable policy logic, it must be
introduced as a new architecture decision and a new versioned contract. It must
not be added to Rulebook v1.

Rulebook v1 signing covers the existing `rulebook_attestation.bundle_hash`, not
the mutable response envelope. The unsigned registry attestation remains the v1
canonical bundle format for local and development environments. Production
deployments should configure a signing key and publish the matching public key
through the well-known verifier endpoint, then enable
`DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true`.

See also:

- [Rulebook v1](RULEBOOK_V1.md)
- [Trusted Adapters v1](TRUSTED_ADAPTERS_V1.md)
- [Rulebook Compatibility Policy](RULEBOOK_COMPATIBILITY_POLICY.md)
- [Ecosystem Constitution](ECOSYSTEM_CONSTITUTION.md)
