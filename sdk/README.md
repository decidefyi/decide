# Decide SDK

JavaScript SDK and CLI for the Decide Decision API, Decision Record verification, conformance checks, replay, execution receipts, and outcome reporting.

Published release: `@decide-fyi/sdk@0.1.19`. Python examples use raw HTTPS requests today; Decide does not advertise a separate PyPI package yet.

Verified package links:

- npm package: `https://www.npmjs.com/package/@decide-fyi/sdk`
- npm registry metadata: `https://registry.npmjs.org/@decide-fyi/sdk`
- npm source tarball: `https://registry.npmjs.org/@decide-fyi/sdk/-/sdk-0.1.19.tgz`
- public source: `https://github.com/decidefyi/decide/tree/main/sdk`
- public support tracker: `https://github.com/decidefyi/decide/issues`

The public `decidefyi/decide` repository is the canonical source for SDK releases beginning with `0.1.18`. Published package metadata points to this exact directory, and support and bug reports use the public Decide issue tracker. See the public source-provenance record at `https://github.com/decidefyi/decide/blob/main/sdk/SOURCE_PROVENANCE.md` for the release boundary.

```sh
npm install @decide-fyi/sdk
```

```js
const { createDecideClient } = require('@decide-fyi/sdk');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

const pricingExceptionRulebook = {
  schema_version: 'rulebook_v1',
  rulebook_id: 'pricing_exception',
  version: '2026-06-11',
  input_schema: {
    required: ['discount_percent', 'margin_floor_passed'],
    properties: {
      discount_percent: { type: 'number' },
      margin_floor_passed: { type: 'boolean' }
    }
  },
  rules: [
    {
      rule_id: 'approve_standard_exception',
      priority: 100,
      condition: {
        all: [
          { field: 'discount_percent', operator: 'lte', value: 15 },
          { field: 'margin_floor_passed', operator: 'eq', value: true }
        ]
      },
      outcome: {
        decision: 'yes',
        verdict: 'APPROVE',
        action: 'approve_discount',
        reason_code: 'STANDARD_EXCEPTION_ALLOWED'
      }
    }
  ],
  default_outcome: {
    decision: 'review',
    verdict: 'REVIEW',
    action: 'route_to_owner',
    reason_code: 'NO_RULE_MATCHED'
  }
};

const record = await decide.decide(
  {
    mode: 'rulebook',
    rulebook: pricingExceptionRulebook,
    context: {
      workflow: 'pricing_exception',
      source_record_id: 'deal_1042',
      requested_action: 'approve_discount',
      target_system: 'billing',
      target_object_id: 'sub_1042',
      mutation: 'discount.create',
      inputs: {
        discount_percent: 15,
        margin_floor_passed: true
      }
    }
  },
  {
    idempotencyKey: 'deal_1042_discount_15',
    responseView: 'full'
  }
);

// Binding application result: APPROVE, STANDARD_EXCEPTION_ALLOWED,
// matched_rule_id=approve_standard_exception.

// Adapter-backed applications replace context.inputs with:
// adapter: { adapter_id, version, manifest_hash, input }.
// The adapter emits bounded facts; Rulebook v1 still selects the verdict.
// Responses include runtime_binding: direct calls use
// direct_declarative_rulebook, while adapter-backed calls use
// trusted_adapter_facts_then_declarative_rulebook. Customer-supplied
// executable rulebooks are rejected.
// Response-only material such as runtime_binding, adapter_facts,
// rulebook_attestation, decision_contract, application_verdict, and action must not be
// supplied as request authority; such requests fail closed with
// RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN.
//
// Workflow apps that execute downstream actions should satisfy
// decide_application_binding_v1 before handoff: preserve rulebook_contract,
// runtime_binding, verdict/application_verdict/action, reason_code,
// matched_rule_id, rulebook.hash, input_hash, and
// rulebook_attestation.bundle_hash.

const verified = await decide.verifyRecord({ record });
if (!verified.verified) {
  throw new Error('Decision Record integrity or authenticity verification failed');
}

await decide.recordExecution(
  record.decision_id,
  {
    execution_status: 'executed',
    action_taken: 'approve_discount',
    target_system: 'billing',
    target_object_id: 'sub_1042',
    mutation: 'discount.create',
    execution_id: 'billing_run_1042',
    external_ref: 'bill_1042',
    decision_record_hash: record.record_hash,
    decision_receipt_hash: record.receipt_hash,
    action_binding: record.action_binding,
    state_before_hash: 'sha256:subscription_before_1042',
    state_after_hash: 'sha256:subscription_after_1042'
  },
  {
    idempotencyKey: 'deal_1042_discount_15_execution'
  }
);

await decide.recordOutcome(
  record.decision_id,
  {
    outcome_status: 'succeeded',
    action_taken: 'approve_discount',
    target_system: 'billing',
    target_object_id: 'sub_1042',
    mutation: 'discount.create',
    external_ref: 'bill_1042',
    decision_record_hash: record.record_hash,
    decision_receipt_hash: record.receipt_hash,
    observed_metrics: {
      margin_after_discount: 0.182
    }
  },
  {
    idempotencyKey: 'deal_1042_discount_15_outcome'
  }
);

const packet = await decide.decisionPacket(record.decision_id, {
  includeInput: true,
  includeChain: true,
  includeIntelligence: true
});
```

The client defaults to `https://www.decide.fyi`. Pass `baseUrl` for a staging or local deployment, and keep `apiKey` on the server side.

Use a stable, operation-specific `idempotencyKey` for every execution, outcome, and CRM sync write. Decide atomically claims keyed lifecycle requests: concurrent duplicates return `409` with an in-progress status, completed duplicates replay the original record, changed payloads conflict, and storage or idempotency outages return a retryable `503` without reporting a successful untracked write.

Stored-record APIs are isolated to the API key that created the Decision Record. An unknown or cross-tenant `decisionId` returns `404`; lifecycle list and Decision Packet reads return a retryable `503` when required storage is unavailable rather than returning incomplete proof data.

Audit-chain appends are serialized against the stored head, so concurrent decisions retain ordered hash lineage. Chain reads also fail with a retryable `503` when authoritative storage is unavailable instead of reporting that the chain does not exist.

CLI verifier:

```sh
npx @decide-fyi/sdk verify decision-record.json \
  --input decision-input.json \
  --key-registry https://www.decide.fyi/api/decision/receipt-keys
```

Use `--json` for machine-readable output, `--summary` for human-readable output, `--public-key public.pem` for a pinned Ed25519 trust anchor, or `--hmac-secret "$DECIDE_RECEIPT_SIGNING_SECRET"` for private HMAC receipts. An embedded record key can prove internal integrity, but authenticity requires the pinned key, registry, environment key, or HMAC secret.

Application-binding verifier:

```sh
npx @decide-fyi/sdk verify app-record.json --application-binding --summary
```

```js
const { verifyApplicationBinding } = require('@decide-fyi/sdk');

const binding = verifyApplicationBinding(appRecord);
if (!binding.verified) {
  throw new Error(`Missing Decide application-binding material: ${binding.missing.join(', ')}`);
}
```

Packet verifier:

```sh
npx @decide-fyi/sdk verify-packet decision-packet.json \
  --key-registry https://www.decide.fyi/api/decision/receipt-keys \
  --summary
```

Rulebook v1 conformance runner:

```sh
npx @decide-fyi/sdk rulebook-conformance \
  --index https://api.decide.fyi/conformance/rulebook-v1/index.json \
  --endpoint https://api.decide.fyi/api/decide \
  --summary
```

Use `--endpoint http://localhost:3000/api/decide` to test a local compatible implementation. Add `--api-key "$DECIDE_API_KEY"` when the target endpoint requires API-key authentication.

Conformance fixtures:

```sh
npx @decide-fyi/sdk verify fixtures/valid-decision-record.json \
  --input fixtures/decision-input.json \
  --hmac-secret decide_conformance_hmac_secret_v1 \
  --json
```

The fixture pack lives in `fixtures/`. `valid-decision-record.json` verifies, `tampered-record.json` fails verification, and `replay-diff-example.json` shows a current-policy drift packet. The conformance HMAC secret is intentionally public and only signs the fixtures.

Verify in CI:

```yaml
name: Verify Decision Record

on:
  pull_request:
  workflow_dispatch:

jobs:
  verify-decision-record:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: "24"
      - run: |
          npx @decide-fyi/sdk verify ./artifacts/decision-record.json \
            --input ./artifacts/decision-input.json \
            --key-registry https://www.decide.fyi/api/decision/receipt-keys \
            --json
```

The packaged example lives at `examples/github-actions-verify.yml`.

Integration examples:

- `examples/pricing-exception.js` shows the canonical pricing exception call.
- `examples/billing-discount-gate.js` gates a billing discount before mutation and stores Decide metadata with the billing update.
- `examples/crm-writeback.js` records a hashed CRM write-back receipt after a Decision Record is stored on a CRM object.
- `examples/webhook-queue-gate.js` gates queue or webhook workers before side effects and fails closed to review when Decide is unavailable.
- `examples/agent-action-gate.js` authorizes an agent-proposed action before execution and returns the Decision Record handles to persist.
- `examples/lifecycle-proof-pack.js` runs the buyer proof path: Decision Record, execution receipt, Outcome Record, effectiveness score, and anomaly review.
- `examples/action-execution-receipt.js` records a target-system neutral execution receipt for the mutation authorized by a Decision Record.
- `examples/outcome-tracking.js` records what happened after a Decision Record authorized a billing mutation.
- `examples/policy-effectiveness.js` reads Outcome Record based policy effectiveness metrics.
- `examples/policy-anomalies.js` reads explainable anomaly reports from Outcome Records.
- `examples/policy-confidence.js` reads predictive confidence for a policy verdict from caller-scoped Outcome Records.
- `examples/policy-benchmarks.js` reads opt-in anonymized cohort benchmarks with minimum privacy thresholds.
- `examples/policy-patterns.js` reads first-party policy templates for common Decision API integration paths.
- `examples/decision-chain.js` reads the cryptographic audit chain attached to a Decision Record.
- `examples/counterfactual-analysis.js` evaluates simulation-only what-if scenarios against a stored Decision Record.

Methods:

- `decide(input, options)` calls `POST /api/decide`.
- `verifyRecord({ record, input, publicKey })` calls `POST /api/decision/verify`. A request-supplied `publicKey` is diagnostic on the hosted endpoint; hosted authenticity is anchored to the server-configured Decide receipt registry.
- `verifyDecision(decisionId)` calls `GET /api/decision/:id/verify`.
- `lookupDecision(decisionId)` calls `GET /api/decision/:id`.
- `replayDecision(decisionId, body)` calls `POST /api/decision/:id/replay`. Rulebook records default to immutable historical replay; pass `replay_mode: "current"` for explicit current-runtime comparison.
- `diffDecision(decisionId, body)` calls `POST /api/decision/:id/diff` and forces current-mode comparison.
- `counterfactuals(decisionId, body)` calls `POST /api/decision/:id/counterfactuals`.
- `recordExecution(decisionId, body, options)` calls `POST /api/decision/:id/execution`.
- `listExecutions(decisionId, options)` calls `GET /api/decision/:id/execution`.
- `recordOutcome(decisionId, body, options)` calls `POST /api/decision/:id/outcome`.
- `listOutcomes(decisionId, options)` calls `GET /api/decision/:id/outcome`.
- `recordCrmSync(decisionId, body, options)` calls `POST /api/decision/:id/crm-sync`.
- `listCrmSyncs(decisionId, options)` calls `GET /api/decision/:id/crm-sync`.
- `policyEffectiveness(policyId, options)` calls `GET /api/decision/policies/:policy_id/effectiveness`.
- `policyAnomalies(policyId, options)` calls `GET /api/decision/policies/:policy_id/anomalies`.
- `policyConfidence(policyId, options)` calls `GET /api/decision/policies/:policy_id/confidence`.
- `policyBenchmarks(policyId, options)` calls `GET /api/decision/policies/:policy_id/benchmarks`.
- `decisionChain(chainId, options)` calls `GET /api/decision/chains/:chain_id`.
- `decisionPacket(decisionId, options)` calls `GET /api/decision/:id/packet`.
- `receiptKeys()` calls `GET /api/decision/receipt-keys`.
- `policyBundles()` calls `GET /api/decision/policy-bundles`.
- `rulebookMetadata(options)` calls `GET /api/decision/rulebooks` with `hash`, or `rulebookId` plus `version`. It returns tenant-scoped metadata, never the stored snapshot body.
- `policyPatterns(options)` calls `GET /api/decision/policy-patterns`.
- `status()` calls `GET /api/decision/status`.

OpenAPI: `https://www.decide.fyi/openapi.json`

Before publishing a release, run `npm run test:sdk-package` from the repository root.
