// Optional local composition test. Pass isolated DecideSite and Krafthaus checkouts.
import './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import cancelRest from '../lib/routes/v1/policies/cancel-penalty.js';
import decide from '../api/decide.js';
import { invokeJson } from './test-helpers/http-harness.js';

const [sitePath, appPath] = process.argv.slice(2).map(path => resolve(path));
assert.ok(sitePath && appPath, 'Pass DecideSite and Krafthaus checkout paths');
const siteRequire = createRequire(join(sitePath, 'package.json'));
const appRequire = createRequire(join(appPath, 'package.json'));
const proxy = siteRequire('./api/proxy.js');
const { fetchPolicyNotaryEvidence } = appRequire('./lib/policy-notary-evidence-client.js');
const binding = readFileSync(new URL('../lib/policy-request-binding.cjs', import.meta.url), 'utf8');
for (const path of [sitePath, appPath]) assert.equal(readFileSync(join(path, 'lib/policy-request-binding.cjs'), 'utf8'), binding);
const artifactDir = mkdtempSync(join(tmpdir(), 'typeform-stack-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DECIDE_PROXY_API_KEY_AUTH: '0', DECIDE_BACKEND_ORIGIN: 'https://engine.test.invalid',
  DECIDE_LEDGER_BACKEND: 'fs', DECIDE_LEDGER_PATH: join(artifactDir, 'ledger.jsonl'),
  DECIDE_CHAIN_BACKEND: 'fs', DECIDE_CHAIN_LEDGER_PATH: join(artifactDir, 'chain.jsonl'),
  DECIDE_RULEBOOK_REGISTRY_BACKEND: 'fs', DECIDE_RULEBOOK_REGISTRY_PATH: join(artifactDir, 'rulebooks.jsonl'),
  DECIDE_RECEIPT_SIGNING_SECRET: 'typeform-stack-test-only',
});
const request = { vendor: 'typeform', region: 'US', plan: 'basic', billing_cadence: 'monthly',
  product: 'platform_subscription', purchase_channel: 'direct', contract_type: 'self_serve', requested_action: 'cancel_at_period_end' };
const policy = await invokeJson(cancelRest, { method: 'POST', headers: { 'x-decide-policy-record': '1' }, body: request });
assert.equal(policy.json.verdict, 'CANCEL_AT_PERIOD_END');
let replayCount = 0;
const network = async (url, options = {}) => {
  if (String(url).startsWith('https://engine.test.invalid/api/v1/cancel/penalty')) {
    // Deliberately return this same policy record even when the caller changes scope.
    return new Response(JSON.stringify(policy.json), { headers: { 'content-type': 'application/json' } });
  }
  assert.equal(String(url), 'https://engine.test.invalid/api/decide', 'No external network calls');
  replayCount += 1;
  const result = await invokeJson(decide, { method: 'POST', body: JSON.parse(options.body), headers: { 'content-type': 'application/json' } });
  assert.equal(result.statusCode, 200);
  return new Response(JSON.stringify(result.json), { status: result.statusCode, headers: { 'content-type': 'application/json' } });
};
globalThis.fetch = network;
const callProxy = async body => {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = JSON.parse(String(value)); return this; },
    end(value) { if (value) this.body = JSON.parse(String(value)); return this; },
  };
  await proxy({ method: 'POST', url: '/api/proxy?path=v1%2Fcancel%2Fpenalty&decision_record=1',
    headers: { 'content-type': 'application/json' }, body, socket: { remoteAddress: '127.0.0.73' } }, res);
  return res;
};
const record = await callProxy(request);
assert.equal(record.statusCode, 200, JSON.stringify(record.body));
assert.equal(record.body.application_verdict, 'CANCEL_AT_PERIOD_END');
assert.ok(record.body.decision_id);
assert.ok(record.body.rulebook_attestation);
assert.equal(replayCount, 1);
const accepted = await fetchPolicyNotaryEvidence('cancel', request, { fetchImpl: async () => ({ ok: true, json: async () => record.body }) });
assert.equal(accepted.ok, true);
assert.equal(accepted.evidence.policy_action, 'schedule_cancellation_at_period_end');
for (const field of Object.keys(request)) {
  const altered = { ...request, [field]: 'other' };
  const rejected = await callProxy(altered);
  assert.equal(rejected.statusCode, 502, field);
  assert.equal(rejected.body.error, 'POLICY_REQUEST_BINDING_MISMATCH');
  const appResult = await fetchPolicyNotaryEvidence('cancel', altered, { fetchImpl: async () => ({ ok: true, json: async () => record.body }) });
  assert.equal(appResult.ok, false, field);
}
assert.equal(replayCount, 1, 'Mismatched material never reaches core replay');
console.log(`PASS: actual REST -> DecideSite proxy -> actual Rulebook API -> Decision Record -> Krafthaus; artifacts ${artifactDir}`);
