import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { compute, getSupportedVendors } from '../lib/cancel-compute.js';
import { bindPolicyRequest, policyRequestMatchesInputs } from '../lib/policy-request-binding.cjs';
import cancelRest from '../lib/routes/v1/policies/cancel-penalty.js';
import cancelMcp from '../api/cancel-mcp.js';
import policyMcp from '../api/policy-mcp.js';
import { invokeJson } from './test-helpers/http-harness.js';

export const request = { vendor: 'typeform', region: 'US', plan: 'basic', billing_cadence: 'monthly',
  product: 'platform_subscription', purchase_channel: 'direct', contract_type: 'self_serve',
  requested_action: 'cancel_at_period_end' };
const evaluate = (input, evidenceSnapshot = testPolicyEvidenceSnapshot) => compute(input, { evidenceSnapshot });
assert.ok(getSupportedVendors().includes('typeform'), 'Typeform is discoverable in the real cancellation notary');
for (const billing_cadence of ['monthly', 'annual']) {
  const input = { ...request, billing_cadence };
  const result = evaluate(input);
  assert.equal(result.verdict, 'CANCEL_AT_PERIOD_END');
  assert.equal(result.rulebook_result.action, 'schedule_cancellation_at_period_end');
  assert.equal(result.automation_safe, true);
  assert.equal(result.cancellation_effective, 'paid_term_end');
  assert.equal(result.execution_performed, false);
  assert.equal(result.cancellation_confirmed, false);
  assert.equal(result.refund, 'not_evaluated');
  const inputs = result.rulebook_result.policy_inputs;
  assert.deepEqual(inputs.policy_request, bindPolicyRequest('cancel', input));
  assert.equal(policyRequestMatchesInputs('cancel', input, inputs), true);
  for (const field of Object.keys(input)) {
    assert.equal(evaluate({ ...input, [field]: 'unsupported' }).automation_safe, false, field);
    const missing = { ...input }; delete missing[field];
    assert.equal(evaluate(missing).automation_safe, false, `missing ${field}`);
    assert.equal(policyRequestMatchesInputs('cancel', missing, inputs), false, `binding ${field}`);
    assert.equal(policyRequestMatchesInputs('cancel', { ...input, [field]: 'other' }, inputs), false);
  }
}
assert.equal(evaluate(request, null).code, 'POLICY_EVIDENCE_NOT_CURRENT');
for (const field of ['action', 'reason_code', 'automation_safe', 'account_observed_at', 'now', 'evidenceSnapshot']) {
  assert.equal(evaluate({ ...request, [field]: 'injected' }).automation_safe, false, `unexpected ${field}`);
}
for (const mutate of [
  row => { row.checked_at = '2020-01-01T00:00:00Z'; },
  row => { row.verified_at = '2020-01-01T00:00:00Z'; },
  row => { row.source_url = 'https://wrong.example/'; },
  row => { row.source_hash = 'f'.repeat(64); },
  row => { row.policy_version = 'old'; },
  row => { row.status = 'changed'; },
  row => { row.flags = ['pending_candidate']; },
  row => { row.checked_at = '2099-01-01T00:00:00Z'; },
]) {
  const snapshot = structuredClone(testPolicyEvidenceSnapshot);
  mutate(snapshot.policies.find(row => row.policy === 'cancel' && row.vendor === 'typeform'));
  assert.equal(evaluate(request, snapshot).automation_safe, false);
}
assert.equal(evaluate(request, { ...testPolicyEvidenceSnapshot, generated_at: '2020-01-01T00:00:00Z' }).automation_safe, false);
assert.equal(evaluate({ ...request, evidenceSnapshot: testPolicyEvidenceSnapshot, now: '2026-09-07', automation_safe: true }, null).automation_safe, false);

const rest = await invokeJson(cancelRest, { method: 'POST', headers: { 'x-decide-policy-record': '1' }, body: request });
assert.equal(rest.statusCode, 200);
assert.equal(rest.json.verdict, 'CANCEL_AT_PERIOD_END');
assert.equal(rest.json.decision_record_material.request.mode, 'rulebook');
assert.equal(policyRequestMatchesInputs('cancel', request, rest.json.decision_record_material.request.context.inputs), true);
for (const handler of [cancelMcp, policyMcp]) {
  const list = await invokeJson(handler, { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  const tool = list.json.result.tools.find(tool => tool.name === 'cancellation_penalty');
  assert.ok(tool.inputSchema.properties.vendor.enum.includes('typeform'));
  const ajv = new Ajv({ strict: false });
  assert.equal(ajv.compile(tool.inputSchema)(request), true);
  const call = await invokeJson(handler, { method: 'POST', body: { jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'cancellation_penalty', arguments: request } } });
  assert.equal(call.json.result.structuredContent.verdict, 'CANCEL_AT_PERIOD_END');
  const validate = ajv.compile(tool.outputSchema);
  assert.equal(validate(call.json.result.structuredContent), true, JSON.stringify(validate.errors));
}
console.log('PASS: scoped Typeform REST, MCP, evidence and exact-request binding integration');
