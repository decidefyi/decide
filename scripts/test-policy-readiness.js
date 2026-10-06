import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPolicyCoverageScorecard } from '../lib/policy-coverage-scorecard.js';
const read = file => JSON.parse(readFileSync(new URL(`../rules/${file}.json`, import.meta.url)));
const rulebooks = Object.fromEntries(Object.entries({ refund: 'v1_us_individual', cancel: 'v1_us_individual_cancel',
  return: 'v1_us_individual_return', trial: 'v1_us_individual_trial' }).map(([key, file]) => [key, read(file)]));
const sourceMaps = Object.fromEntries(Object.entries({ refund: 'policy-sources', cancel: 'cancel-policy-sources',
  return: 'return-policy-sources', trial: 'trial-policy-sources' }).map(([key, file]) => [key, read(file)]));
const options = { rulebooks, sourceMaps, candidateRegistry: read('policy-vendor-candidates'), now: '2026-10-06T12:00:00Z' };
const snapshot = structuredClone(testPolicyEvidenceSnapshot);
snapshot.generated_at = '2026-10-06T03:00:00Z';
snapshot.policies.forEach(row => { row.checked_at = '2026-10-06T02:00:00Z'; });
const report = buildPolicyCoverageScorecard({ ...options, evidenceSnapshot: snapshot }).production.runtime_readiness;
assert.equal(report.retired_surface_count, 3);
assert.ok(report.reviews_due_soon_count > 390, 'July review deadlines must be visible without renewing them');
assert.equal(report.rows.find(row => row.policy === 'cancel' && row.vendor === 'adobe').evidence_ready, false);
assert.equal(report.rows.find(row => row.policy === 'cancel' && row.vendor === 'canva').evidence_ready, true);
assert.equal(report.rows.find(row => row.policy === 'cancel' && row.vendor === 'weightwatchers').evidence_reason, 'source_retired');
assert.equal(report.review_queue.some(row => row.vendor === 'weightwatchers' && row.policy !== 'trial'), false, 'Do not schedule review work for deliberately retired scopes');
assert.equal(buildPolicyCoverageScorecard(options).production.runtime_readiness.evidence_ready_surface_count, 0);
assert.equal(buildPolicyCoverageScorecard({ ...options, now: '2026-10-15T12:00:00Z', evidenceSnapshot: snapshot })
  .production.runtime_readiness.rows.find(row => row.vendor === 'canva' && row.policy === 'cancel').evidence_ready, false);
console.log('PASS: readiness distinguishes configured modes, retired sources, current evidence and upcoming/expired human reviews');
