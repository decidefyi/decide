import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import policyMcp from '../api/policy-mcp.js';
import { invokeJson } from './test-helpers/http-harness.js';

for (const billing_cadence of ['monthly', 'annual']) {
  const response = await invokeJson(policyMcp, {
    method: 'POST', headers: { 'user-agent': 'policy-support-safety-test' },
    body: { jsonrpc: '2.0', id: billing_cadence, method: 'tools/call', params: {
      name: 'cancellation_penalty', arguments: { vendor: 'adobe', region: 'US', plan: 'individual', billing_cadence },
    } },
  });
  const result = response.json?.result?.structuredContent;
  assert.equal(response.statusCode, 200);
  assert.equal(result.policy_evidence.status, 'current', 'Fresh evidence must not mask the scope test');
  assert.equal(result.verdict, 'UNKNOWN', `${billing_cadence} alone cannot describe the Adobe contract`);
  assert.equal(result.automation_safe, false);
  assert.equal(result.policy_decision_mode, 'review_only');
  assert.deepEqual(result.required_context, ['manual_policy_review']);
  assert.equal(result.rulebook_result.matched_rule_id, 'review_missing_context');
}
console.log('PASS: public MCP routes both incomplete Adobe contract branches to review');

for (const policy of ['refund', 'cancel', 'return']) {
  const { compute } = await import(`../lib/${policy}-compute.js`);
  const result = compute({ vendor: 'weightwatchers', region: 'US', plan: 'individual',
    days_since_purchase: 1, qualifying_conditions_met: true, billing_cadence: 'monthly' },
  { evidenceSnapshot: testPolicyEvidenceSnapshot });
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.automation_safe, false);
  assert.equal(result.policy_evidence.reason, 'source_retired', 'Even a fresh-looking snapshot cannot reactivate a retired source');
}
const { compute: trial } = await import('../lib/trial-compute.js');
assert.notEqual(trial({ vendor: 'weightwatchers', region: 'US', plan: 'individual' },
  { evidenceSnapshot: testPolicyEvidenceSnapshot }).policy_evidence.reason, 'source_retired');
console.log('PASS: retirement is enforced per policy, never blanket vendor exclusion');

for (const vendor of ['canva', 'spotify', 'netflix']) {
  for (const [tool, days] of [['refund_eligibility', 'days_since_purchase'], ['return_eligibility', 'days_since_purchase']]) {
    const response = await invokeJson(policyMcp, { method: 'POST', body: {
      jsonrpc: '2.0', id: `${vendor}:${tool}`, method: 'tools/call', params: { name: tool,
        arguments: { vendor, region: 'US', plan: 'individual', [days]: 1, qualifying_conditions_met: true } },
    } });
    const result = response.json?.result?.structuredContent;
    if (vendor !== 'netflix') assert.equal(result.policy_evidence.status, 'current');
    assert.equal(result.verdict, 'UNKNOWN', `${vendor} ${tool} cannot flatten exceptions into a blanket denial`);
    assert.equal(result.automation_safe, false);
    assert.equal(result.policy_decision_mode, 'review_only');
    if (vendor === 'netflix') {
      assert.equal(result.policy_evidence.current, false, 'A replacement source must not inherit the old applicability review');
      assert.equal(result.policy_last_verified_utc, null);
    }
  }
}
console.log('PASS: reviewed subscription exceptions cannot produce blanket refund/return denials');
