import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.POLICY_CHECK_DIRECT_ATTEMPTS = '1';
process.env.POLICY_CHECK_FALLBACK_ATTEMPTS = '1';
process.env.POLICY_CHECK_SAME_RUN_RECHECK_PASSES = '0';
let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error('TEST_NO_EXTERNAL_NETWORK'); };
const { checkPolicySet } = await import('./check-policies.js');
const dir = mkdtempSync(join(tmpdir(), 'decide-retired-monitor-'));
const paths = Object.fromEntries(['sources', 'hashes', 'candidates', 'coverage', 'semantic', 'baseline', 'dailyFingerprint', 'blockedRetry']
  .map(name => [`${name}Path`, join(dir, `${name}.json`)]));
const history = { historical: 'retained' };
writeFileSync(paths.sourcesPath, JSON.stringify({ vendors: { retired: { url: 'https://retired.invalid/terms',
  monitoring_status: 'retired', retirement_reason: 'Persistent source failure', retirement_evidence: 'https://evidence.invalid/run' } } }));
writeFileSync(paths.hashesPath, JSON.stringify({ retired: 'old-hash' }));
writeFileSync(paths.candidatesPath, JSON.stringify({ retired: history }));
writeFileSync(paths.coveragePath, JSON.stringify({ vendors: { retired: { last_successful_fetch_utc: '2026-08-05T12:00:00Z', consecutive_fetch_failures: 20 } } }));
const result = await checkPolicySet({ name: 'cancel', ...paths, rulesFile: 'unused-retired-rules.json' });
assert.equal(requests, 0, 'Retired sources must not consume fetch/retry/provider work');
assert.equal(result.totalChecks, 0);
assert.deepEqual(result.errors, []);
assert.equal(result.vendorStatusRows[0].status, 'retired');
assert.equal(result.vendorStatusRows[0].consecutive_fetch_failures, 20);
assert.equal(JSON.parse(readFileSync(paths.hashesPath)).retired, 'old-hash');
assert.deepEqual(JSON.parse(readFileSync(paths.candidatesPath)).retired, history);
assert.equal(JSON.parse(readFileSync(paths.coveragePath)).vendors.retired.last_successful_fetch_utc, '2026-08-05T12:00:00Z');
console.log('PASS: retired scopes use no fetch work and retain historical state');
