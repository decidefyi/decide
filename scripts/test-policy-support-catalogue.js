import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import { invokeJson } from './test-helpers/http-harness.js';
const { default: support } = await import('../api/policy-support.js');

const response = await invokeJson(support, { method: 'GET', query: {} });
assert.equal(response.statusCode, 200);
assert.equal(response.json.schema_version, 'policy_support_catalogue_v1');
assert.equal(response.json.rows.length, testPolicyEvidenceSnapshot.policies.length);
assert.equal(response.json.execution_authority, 'none');
assert.equal(response.json.operating_model, 'automated_or_unavailable');
assert.equal(response.json.operator_review_required, false);
assert.equal(response.json.summary.retired, 3);
assert.equal(response.json.rows.find(row => row.policy === 'cancel' && row.vendor === 'adobe').support_status, 'unsupported');
assert.equal(response.json.rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').support_status, 'supported');
assert.equal(response.json.rows.find(row => row.policy === 'refund' && row.vendor === 'weightwatchers').support_status, 'retired');
assert.ok(response.json.rows.every(row => row.automation_supported === (row.support_status === 'supported')));
console.log('PASS: public catalogue distinguishes scope support from known vendor identifiers');

const filtered = await invokeJson(support, { method: 'GET', url: '/api/policy-support?policy=refund&vendor=netflix' });
assert.equal(filtered.json.total, 1);
assert.equal(filtered.json.rows[0].verified_at, null);
assert.equal(filtered.json.rows[0].review_status, 'missing_or_invalid');
assert.equal(filtered.json.rows[0].support_status, 'unsupported');
for (const url of ['/api/policy-support?policy=other', '/api/policy-support?now=2026-10-01',
  '/api/policy-support?policy=refund&policy=cancel']) {
  assert.equal((await invokeJson(support, { method: 'GET', url })).statusCode, 400);
}
assert.equal((await invokeJson(support, { method: 'POST' })).statusCode, 405);
const { buildPolicySupportCatalogue } = await import('../lib/policy-support-catalogue.js');
const unavailable = buildPolicySupportCatalogue();
assert.equal(unavailable.evidence_status, 'unavailable');
assert.equal(unavailable.summary.supported, 0);
assert.equal(unavailable.summary.retired, 3);
assert.equal(unavailable.summary.pending_changes, null, 'Missing monitoring is not zero unresolved changes');
assert.equal(unavailable.summary.retirement_review, null);
const changed = structuredClone(testPolicyEvidenceSnapshot);
const row = changed.policies.find(row => row.policy === 'cancel' && row.vendor === 'canva');
row.status = 'fetch_failed'; row.consecutive_fetch_failures = 8;
assert.equal(buildPolicySupportCatalogue({ snapshot: changed }).rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').retirement_review_required, true);
assert.equal(buildPolicySupportCatalogue({ snapshot: changed }).rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').automation_supported, false, 'Persistent failures automatically withhold availability, not await the owner');
row.consecutive_fetch_failures = 1;
assert.equal(buildPolicySupportCatalogue({ snapshot: changed }).rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').retirement_review_required, false);
assert.equal(buildPolicySupportCatalogue({ snapshot: changed }).rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').automation_supported, true, 'One transient failure does not erase still-current evidence');
const expired = buildPolicySupportCatalogue({ snapshot: testPolicyEvidenceSnapshot, now: '2026-10-15T12:00:00Z' });
assert.equal(expired.rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').support_status, 'unsupported');
assert.equal(expired.rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').verified_at, response.json.rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').verified_at, 'Expiry never auto-renews qualification');
console.log('PASS: catalogue filters, source requalification and persistent-failure queues fail closed');
