# Decide Rulebook v1

Status: Declarative runtime, trusted adapter contract, immutable registry, and historical replay implemented
Schema version: `rulebook_v1`
Effective: 2026-06-11
JSON Schema: `https://api.decide.fyi/schemas/rulebook-v1.schema.json`

## Architecture Decision

Decide uses a hybrid architecture with a strict trust boundary:

1. Customer-facing production rulebooks are declarative data.
2. Trusted executable adapters may exist only as registered, first-party code.
3. Arbitrary customer code is never accepted or executed inside Decide.

The public v1 runtime implements both boundaries. The first registered adapter
normalizes facts for the Krafthaus Solana Execution Gate.

## Why Declarative Is The Core

Production rulebooks need to be:

- reviewable by operators and customers
- portable across environments
- canonicalizable and hashable
- safe to store in Decision Records
- replayable without rebuilding an old application deployment
- constrained enough to validate before execution
- independent of network access, clocks, randomness, and process state

Allowing arbitrary code would weaken each property and turn rulebook execution
into an untrusted code-hosting problem.

## Where Trusted Code Fits

Some domains require calculations or fact normalization that are awkward in a
small condition language. Registered first-party adapters may provide those
facts.

A trusted adapter must be:

- registered at deploy time
- identified by a stable adapter ID and version
- pure for the same canonical input
- bounded in execution time and output size
- prohibited from network, clock, randomness, and mutable environment access
- tested independently
- bound to a manifest hash and bundled implementation source hash
- included in the resulting Decision Record and immutable rulebook snapshot

Adapters produce normalized facts. The declarative rulebook still selects the
binding outcome.

Rulebook v1 does not accept adapter source code, expressions, JavaScript, or
user-defined functions. Unknown object fields are rejected rather than ignored,
so callers cannot mistake inert code-shaped data for supported behavior.

The v1 runtime additionally validates adapter output against its registered
schema before Rulebook v1 can consume it. Adapter execution failure or output
drift fails closed and never falls back to an LLM.

See [Trusted Adapters v1](TRUSTED_ADAPTERS_V1.md).

## Public Interface

Rulebook evaluation uses the existing Decision API:

```http
POST /api/decide
Content-Type: application/json
```

```json
{
  "mode": "rulebook",
  "rulebook": {
    "schema_version": "rulebook_v1",
    "rulebook_id": "pricing_exception",
    "version": "2026-06-11",
    "input_schema": {
      "required": ["discount_percent", "margin_percent"],
      "properties": {
        "discount_percent": { "type": "number" },
        "margin_percent": { "type": "number" }
      }
    },
    "rules": [
      {
        "rule_id": "block_below_margin_floor",
        "priority": 100,
        "condition": {
          "field": "margin_percent",
          "operator": "lt",
          "value": 15
        },
        "outcome": {
          "decision": "no",
          "verdict": "BLOCK",
          "action": "reject_discount",
          "reason_code": "MARGIN_FLOOR_BREACH"
        }
      },
      {
        "rule_id": "approve_standard_exception",
        "priority": 50,
        "condition": {
          "all": [
            {
              "field": "discount_percent",
              "operator": "lte",
              "value": 15
            },
            {
              "field": "margin_percent",
              "operator": "gte",
              "value": 15
            }
          ]
        },
        "outcome": {
          "decision": "yes",
          "verdict": "APPROVE",
          "action": "approve_discount",
          "reason_code": "STANDARD_EXCEPTION_ALLOWED"
        }
      }
    ],
    "default_outcome": {
      "decision": "review",
      "verdict": "REVIEW",
      "action": "route_to_owner",
      "reason_code": "NO_RULE_MATCHED"
    }
  },
  "context": {
    "inputs": {
      "discount_percent": 10,
      "margin_percent": 22
    }
  }
}
```

An application that needs registered fact normalization sends `adapter` instead
of `context.inputs`:

```json
{
  "mode": "rulebook",
  "adapter": {
    "adapter_id": "solana_execution_gate",
    "version": "1.0.0",
    "manifest_hash": "75f30d8f83aa6cec814ff9f1deeaa71b8599ff5c92637b0f319085f821855f03",
    "input": {
      "sol_amount": 48,
      "risk_level": "medium",
      "evidence_level": "strong",
      "quorum_signed": true,
      "budget_within_policy": true,
      "recipient_verified": true
    }
  },
  "rulebook": {
    "schema_version": "rulebook_v1",
    "rulebook_id": "solana_execution_gate",
    "version": "2026-06-11",
    "rules": [
      {
        "rule_id": "approve_policy_compliant_execution",
        "priority": 100,
        "condition": {
          "field": "decision_score",
          "operator": "gte",
          "value": 70
        },
        "outcome": {
          "decision": "yes",
          "verdict": "APPROVE",
          "action": "authorize_execution",
          "reason_code": "EXECUTION_GATE_APPROVED"
        }
      }
    ],
    "default_outcome": {
      "decision": "review",
      "verdict": "DEFER",
      "action": "defer_execution",
      "reason_code": "NO_RULE_MATCHED"
    }
  },
  "context": {
    "workflow": "solana_execution_gate",
    "requested_action": "treasury_payout"
  }
}
```

The abbreviated example omits the additional production block and defer rules.
A request cannot combine `adapter.input` with `context.inputs`.

## Outcome Model

Each rule and the required default outcome define:

- `decision`: normalized `yes`, `no`, or `review`
- `verdict`: purpose-specific uppercase token such as `APPROVE`, `BLOCK`, or
  `NEEDS_REVIEW`
- `action`: bounded action identifier
- `reason_code`: uppercase machine-readable reason

The normalized decision keeps Decision Record consumers stable. The application
verdict preserves the vocabulary required by a specific Krafthaus application.

## Evaluation Order

Rules are evaluated by:

1. higher `priority` first
2. lexical `rule_id` order when priorities are equal

The first matching rule wins. If no rule matches, `default_outcome` is used.

This order is independent of JSON object key order and does not depend on an
LLM.

## Input Schema

`input_schema.required` lists required dotted input paths.

`input_schema.properties` may type those paths as:

- `string`
- `number`
- `integer`
- `boolean`
- `array`
- `object`
- `null`

Missing or type-invalid inputs return:

- normalized decision: `review`
- application verdict: `NEEDS_INPUT`
- action: `collect_required_input`
- reason code: `INPUT_SCHEMA_FAILED`

This is a valid bounded Decision result, not a runtime failure.

## Conditions

Condition combinators:

- `all`
- `any`
- `not`

Leaf operators:

- `exists`
- `not_exists`
- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`
- `in`
- `not_in`
- `contains`
- `not_contains`

Rulebook v1 intentionally excludes regular expressions, source code,
expressions, network calls, dates derived from the current clock, and dynamic
function invocation.

## Validation And Limits

- maximum 100 rules
- maximum 256 condition nodes
- maximum condition depth 8
- maximum 32 children per `all` or `any`
- stable lowercase IDs
- unique rule IDs
- priorities from `-1000` to `1000`
- normalized decision restricted to `yes`, `no`, or `review`

An invalid rulebook returns HTTP `422` with `RULEBOOK_INVALID` and structured
field errors. It is never sent to an LLM as a fallback.

## Hashing And Lineage

The runtime computes a SHA-256 hash over canonical rulebook JSON.

The response exposes that value as:

- `rulebook.hash`
- `policy_hash`
- `source_hash`

The runtime also computes `input_hash` over the canonical inputs or trusted
adapter facts actually consumed by the declarative rulebook. The raw inputs do
not need to be returned for downstream systems to bind the Decision Record to
the replay material.

The rulebook ID becomes `policy_id`, and its version becomes `policy_version`.
The decidesite proxy then incorporates those values into Decision Record v1.

Adapter-backed responses additionally expose:

- `trusted_adapter.adapter_id`
- `trusted_adapter.version`
- `trusted_adapter.implementation_revision`
- `trusted_adapter.implementation_hash`
- `trusted_adapter.manifest_hash`
- `trusted_adapter.input_hash`
- `trusted_adapter.output_hash`
- `adapter_facts`

The public registry binds one rulebook ID/version to both an evaluator version
and, when present, one trusted adapter dependency. Adapter drift requires an
explicit rulebook or adapter version migration.

## Current Production Boundary

`mode: "rulebook"` is the deterministic production evaluation path.

The legacy modes remain separate:

- `single`: AI-assisted yes/no response
- `multi`: AI-assisted comparative scoring
- `runtime`: AI-assisted recommendation structure

Those modes must not be used as evidence that arbitrary business judgment is
deterministic.

## Implemented Public Boundary

The public Decision Record layer now:

1. registers successful Rulebook v1 evaluations in a tenant-scoped immutable
   registry keyed by rulebook ID, version, and canonical hash
2. rejects reuse of one rulebook ID/version with different content
3. binds one rulebook ID/version to one evaluator version, so evaluator changes
   require an explicit rulebook version migration
4. binds adapter-backed rulebooks to one adapter ID, version, manifest hash, and
   implementation hash
5. stores the immutable snapshot, evaluator version, and adapter dependency with
   the ledger record
6. defaults Rulebook v1 replay to historical mode using the stored canonical
   input and snapshot
7. rejects caller input overrides and adapter-lineage drift during historical
   replay
8. exposes exact tenant-scoped metadata lookup without listing or returning the
   stored rulebook body
9. tests historical semantic reproduction through the public Decision Record
   endpoint
10. powers the Krafthaus Solana Execution Gate without browser-local verdict
    logic

## Next Contract Work

1. Add a signed rulebook bundle or registry attestation.
2. Add stronger runtime enforcement for declared adapter capability denial.
3. Migrate a second materially different Krafthaus application.
4. Define evaluator and adapter migration plus long-term compatibility policy.
