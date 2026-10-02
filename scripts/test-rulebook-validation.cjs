const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { once } = require('node:events');
const fixture = require('../public/conformance/rulebook-v1/pricing-exception-direct-approve.json');
const Ajv2020 = require('ajv/dist/2020');
const contract = require('../contracts/rulebook-validation-preview.openapi.json');
const definitions = JSON.parse(JSON.stringify(contract.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validators = Object.fromEntries(['ValidationResult', 'ValidationError'].map((name) => [name, ajv.compile({ $defs: definitions, $ref: `#/$defs/${name}` })]));

async function serve(t, env = {}) {
  const { createRulebookValidationHandler } = await import('../api/rulebook-validation.js');
  const handler = createRulebookValidationHandler({ env });
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return async (body, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rulebook-validation`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.DECIDE_AUTHORITY_VALIDATOR_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), ...options
    });
    const value = await response.json();
    const validate = validators[response.status === 200 ? 'ValidationResult' : 'ValidationError'];
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    return { status: response.status, body: value, headers: response.headers };
  };
}

test('private validation uses actual Rulebook v1 semantics without issuing a decision', async (t) => {
  const call = await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_VALIDATOR_TOKEN: 'local-validator-token-with-more-than-32-bytes' });
  const { evaluateRulebookV1 } = await import('../lib/rulebook-v1.js');
  const rulebook = fixture.request.body.rulebook;
  const expected = evaluateRulebookV1({ rulebook, inputs: {} }).result;
  const result = await call({ rulebook });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(result.body.rulebook, expected.rulebook);
  assert.deepEqual(result.body.rulebook_contract, expected.rulebook_contract);
  assert.deepEqual(Object.keys(result.body).sort(), ['ok', 'request_id', 'rulebook', 'rulebook_contract']);
  assert.equal((await call({ rulebook: { ...rulebook, rules: [...rulebook.rules, rulebook.rules[0]] } })).status, 422);
});

test('validation is disabled unless explicitly configured and never accepts browser or customer credentials', async (t) => {
  const body = { rulebook: fixture.request.body.rulebook };
  assert.equal((await (await serve(t))(body)).status, 503);
  assert.equal((await (await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_VALIDATOR_TOKEN: 'short' }))(body)).status, 503);
  const token = 'local-validator-token-with-more-than-32-bytes';
  const call = await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_VALIDATOR_TOKEN: token });
  for (const headers of [
    { Authorization: 'Bearer customer-key' }, { 'x-api-key': token },
    { Authorization: `Bearer ${token}`, Origin: 'https://www.decide.fyi' },
    { Authorization: `Bearer ${token}`, 'x-api-key': 'ambiguous' }
  ]) assert.equal((await call(body, { headers })).status, 401);
  assert.equal((await call(undefined, { method: 'GET' })).status, 405);
  assert.equal((await call(body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call(body, { body: '{broken' })).status, 400);
  assert.equal((await call({ ...body, inputs: { discount_percent: 10 } })).status, 400);
  assert.equal((await call({ padding: 'x'.repeat(65536) })).status, 413);
});
