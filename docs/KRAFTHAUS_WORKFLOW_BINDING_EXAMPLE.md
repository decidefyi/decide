# Krafthaus Workflow Binding Example

Status: Public integration example

This example shows how a Krafthaus workflow application binds one action path to
Decide before execution or handoff.

Reference application: Krafthaus Workflow Readiness Binding.

Public JSON example:
`https://api.decide.fyi/examples/krafthaus-workflow-binding-v1.json`

Conformance fixture:
`https://api.decide.fyi/conformance/rulebook-v1/krafthaus-workflow-readiness-adapter-bind.json`

Golden replay fixture:
`https://api.decide.fyi/replay/rulebook-v1/krafthaus-workflow-readiness-adapter-bind.json`

## Pattern

Krafthaus owns the workflow surface. Decide owns the deterministic production
boundary.

The application sends a Rulebook v1 request with a registered first-party
trusted adapter:

- adapter: `krafthaus_workflow_readiness@1.0.0`
- binding mode: `trusted_adapter_facts_then_declarative_rulebook`
- binding outcome: `BIND_READY`, `ROUTE_REVIEW`, or `BLOCKED`
- governed action: `bind_workflow_application`

The trusted adapter emits bounded workflow facts. Rulebook v1 selects the
binding verdict and action. The application must not treat an LLM output as the
binding production verdict.

Prohibited claim:
`llm_output_is_binding_production_verdict`

## Minimal Client Flow

```js
const example = await fetch(
  "https://api.decide.fyi/examples/krafthaus-workflow-binding-v1.json"
).then((res) => res.json());

const response = await fetch("https://api.decide.fyi/api/decide", {
  method: example.decide_request.method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(example.decide_request.body),
});

if (!response.ok) {
  throw new Error(`Decide request failed: ${response.status}`);
}

const decision = await response.json();

const decisionMaterial = {
  rulebook_contract: decision.rulebook_contract,
  runtime_binding: decision.runtime_binding,
  verdict: decision.verdict,
  application_verdict: decision.application_verdict,
  action: decision.action,
  reason_code: decision.reason_code,
  matched_rule_id: decision.matched_rule_id,
  rulebook_hash: decision.rulebook?.hash,
  input_hash: decision.input_hash,
  rulebook_attestation_bundle_hash: decision.rulebook_attestation?.bundle_hash,
};

if (decision.application_verdict === "BIND_READY") {
  // Persist decisionMaterial, then continue with bind_workflow_application.
}
```

## Required Material

Before a Krafthaus workflow application executes or hands off the governed
action, it must persist:

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

That material is the minimum bridge from the workflow UI to a replayable Decide
Decision Record.

## Expected Bind-Ready Output

For the published example request, Decide returns:

- `application_verdict`: `BIND_READY`
- `action`: `bind_workflow_application`
- `reason_code`: `WORKFLOW_BINDING_READY`
- `matched_rule_id`: `bind_ready_workflow_application`
- `adapter_facts.workflow_score`: `80`
- `adapter_facts.workflow_band`: `bind_ready`
- `adapter_facts.handoff_risk`: `medium`
- `adapter_facts.ready_to_bind`: `true`

If the workflow lacks ownership, evidence, or safe handoff inputs, the same
pattern routes to `ROUTE_REVIEW` or `BLOCKED`.
