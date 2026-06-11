# Rulebook Migration Examples

Status: Accepted examples
Effective: 2026-06-11

These examples show how compatibility changes should move through Decide without
silently changing historical records.

The replay gate for all examples is the golden replay corpus:

- corpus: `https://api.decide.fyi/replay/rulebook-v1/index.json`
- corpus version: `rulebook_v1_golden_replay_v1`
- replay contract: `historical_rulebook_replay_v1`

Before a migration is shipped, the old corpus must still replay against its
stored rulebook snapshots, evaluator versions, input material, adapter lineage,
semantic outputs, hashes, and attestation bundle hashes.

## Evaluator Migration Example

Scenario: Decide introduces an internal evaluator candidate that optimizes
condition traversal but should preserve Rulebook v1 semantics.

Candidate label:

```text
DECIDE_RULEBOOK_EVALUATOR_NEXT=decide_rulebook_v1_1
```

Migration flow:

1. Keep existing production records bound to `decide_rulebook_v1`.
2. Run the public conformance fixtures.
3. Run the golden replay corpus at
   `https://api.decide.fyi/replay/rulebook-v1/index.json`.
4. If every corpus fixture reproduces the stored semantic output, rulebook hash,
   input hash, evaluator binding, and attestation bundle hash, the evaluator can
   be released as a candidate for new rulebook versions.
5. Existing `rulebook_id` plus `version` pairs do not silently move to the new
   evaluator.

Breaking example: changing lexical tie-breaking between equal-priority rules.
That requires a new evaluator version and new rulebook versions for workflows
that opt in.

## Adapter Migration Example

Scenario: the Solana Execution Gate adapter adds a new normalized fact while
preserving existing consumed facts.

Old dependency:

```text
solana_execution_gate@1.0.0
```

New dependency:

```text
solana_execution_gate@1.1.0
```

Migration flow:

1. Register `solana_execution_gate@1.1.0` with a new manifest hash and bundled
   implementation hash.
2. Keep records that reference `solana_execution_gate@1.0.0` replaying with the
   stored adapter attestation.
3. Create a new rulebook version if the rulebook consumes the new fact or if
   any consumed fact semantics changed.
4. Run the golden replay corpus to prove the old `solana_execution_gate@1.0.0`
   fixture still reproduces its stored adapter facts, semantic output, hashes,
   and attestation bundle hash.
5. Add a new fixture for the `1.1.0` path before making it a production
   dependency.

Compatible example: adding an optional adapter output that no existing rulebook
version consumes.

Breaking example: changing how `decision_score` is calculated. That changes a
consumed fact and requires a new adapter version plus explicit rulebook version
migration.

## Rulebook Migration Example

Scenario: the pricing exception workflow changes the standard approval threshold
from 15 percent to 12 percent.

Old rulebook:

```text
pricing_exception@2026-06-11
```

New rulebook:

```text
pricing_exception@2026-07-01
```

Migration flow:

1. Keep `pricing_exception@2026-06-11` immutable in the registry.
2. Create `pricing_exception@2026-07-01` with the changed threshold.
3. Add a new conformance or golden replay fixture for the new threshold.
4. Run the existing golden replay corpus and confirm the
   `pricing_exception@2026-06-11` fixture still reproduces the stored semantic
   output, rulebook hash, input hash, evaluator version, and attestation bundle
   hash.
5. Route only new decisions to `pricing_exception@2026-07-01`; historical replay
   remains bound to the old snapshot.

Compatible example: adding an optional input field that no existing rule
consumes and that does not change outputs for existing inputs.

Breaking example: changing `STANDARD_EXCEPTION_ALLOWED` to mean a different
business action. That requires a new rulebook version and updated downstream
docs/tests.

