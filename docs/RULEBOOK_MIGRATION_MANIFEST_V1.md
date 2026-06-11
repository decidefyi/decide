# Rulebook Migration Manifest v1

Status: Accepted release-gate contract
Schema version: `rulebook_migration_v1`
JSON Schema: `https://api.decide.fyi/schemas/rulebook-migration-v1.schema.json`
Effective: 2026-06-11

Rulebook migrations should be described by a machine-readable manifest before
production routing changes. The manifest is the release-gate wrapper around the
golden replay corpus: it declares the candidate artifacts, fixture scope,
expected drift policy, and approval status.

The dry-run CLI validates manifests against the published JSON Schema before it
loads candidate artifacts or starts replay.

Run a manifest through the dry-run gate:

```bash
npm run rulebook:migration-dry-run -- --migration path/to/migration.json --json
```

The report keeps strict replay semantics:

- `ok: true` means the corpus replay had no drift or errors.
- `ok: false` means drift or errors were observed.
- `gate_passed: true` means the release gate may proceed. For drifted
  migrations, this requires the drift to match the manifest's expected drift
  fields and for the manifest to be approved.

## Manifest Shape

```json
{
  "schema_version": "rulebook_migration_v1",
  "migration_id": "pricing_exception_2026_07_01",
  "status": "proposed",
  "compatibility_class": "rulebook",
  "summary": "Lower the standard pricing exception threshold from 15 percent to 12 percent.",
  "corpus": "public/replay/rulebook-v1/index.json",
  "fixtures": ["pricing_exception_direct_approve"],
  "candidate": {
    "evaluator_version": "decide_rulebook_v1_1",
    "rulebooks": [
      {
        "rulebook_id": "pricing_exception",
        "path": "rules/pricing-exception-2026-07-01.json"
      }
    ],
    "adapters": [
      {
        "adapter_id": "solana_execution_gate",
        "version": "1.1.0",
        "manifest_hash": "<sha256>"
      }
    ]
  },
  "expected_drift": {
    "policy": "requires_approval",
    "fixtures": ["pricing_exception_direct_approve"],
    "fields": ["rulebook", "attestation_hash"]
  },
  "approval": {
    "status": "pending",
    "approved_by": null,
    "approved_at": null,
    "notes": "Approval is required before this candidate can pass the release gate."
  }
}
```

## Status And Approval

`status` must be one of:

- `proposed`
- `approved`
- `rejected`
- `superseded`

`approval.status` must be one of:

- `not_required`
- `pending`
- `approved`
- `rejected`

If `approval.status` is `approved`, the manifest `status` must also be
`approved`, and `approved_by` plus an ISO `approved_at` timestamp are required.

## Drift Policy

`expected_drift.policy` supports:

- `none`: any drift is unexpected and blocks the gate.
- `requires_approval`: drift is allowed only when each drift field matches the
  manifest's expected fixture and field lists, and the manifest is approved.

Expected drift is counted per drift field. A rulebook-version migration that
changes lineage without changing the semantic outcome may still drift on
`rulebook` and `attestation_hash`. Semantic drift, evaluator drift, input hash
drift, adapter lineage drift, or adapter fact drift must be listed explicitly
or it remains unexpected.

## Candidate Artifacts

`candidate.rulebooks` replaces matching stored rulebook snapshots by
`rulebook_id` during the dry run. The loaded rulebook must have the same
`rulebook_id` as the selector.

`candidate.adapters` replaces matching adapter invocations by `adapter_id` with
the proposed adapter version and manifest hash. The adapter must already be
registered in the local Decide runtime.

`candidate.evaluator_version` is a release label in the report. It does not
change the current evaluator implementation by itself; evaluator changes still
need code changes plus corpus proof.
