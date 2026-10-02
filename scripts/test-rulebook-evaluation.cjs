const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { once } = require('node:events');
const fixture = require('../public/conformance/rulebook-v1/pricing-exception-direct-approve.json');
const Ajv2020 = require('ajv/dist/2020');
const contract = require('../contracts/rulebook-evaluation-preview.openapi.json');
const validation = require('../contracts/rulebook-validation-preview.openapi.json');
const definitions = JSON.parse(JSON.stringify({ ...validation.components.schemas, ...contract.components.schemas }).replace(/(?:rulebook-validation-preview\.openapi\.json)?#\/components\/schemas\//g, '#/$defs/'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validators = Object.fromEntries(['EvaluationResult', 'ValidationError'].map((name) => [name, ajv.compile({ $defs: definitions, $ref: `#/$defs/${name}` })]));

async function serve(t, env = {}) {
  const { createRulebookEvaluationHandler } = await import('../api/rulebook-evaluation.js');
  const server = http.createServer(createRulebookEvaluationHandler({ env }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return async (body, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rulebook-evaluation`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.DECIDE_AUTHORITY_EVALUATOR_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), ...options
    });
    const value = await response.json();
    const validate = validators[response.status === 200 ? 'EvaluationResult' : 'ValidationError'];
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    return { status: response.status, body: value, headers: response.headers };
  };
}

test('private evaluation returns the actual pinned engine result for yes, no, review and invalid input types', async (t) => {
  const call = await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_EVALUATOR_TOKEN: 'local-evaluator-token-with-more-than-32-bytes' });
  const { evaluateRulebookV1 } = await import('../lib/rulebook-v1.js');
  for (const inputs of [{ discount_percent: 10, margin_percent: 22 }, { discount_percent: 10, margin_percent: 5 }, { discount_percent: 30, margin_percent: 22 }, {}, { discount_percent: '10', margin_percent: 22 }]) {
    const body = { rulebook: fixture.request.body.rulebook, inputs };
    const result = await call(body);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(result.body.evaluation, evaluateRulebookV1({ ...body, bindingMode: 'direct_declarative_rulebook' }).result);
    assert.deepEqual(Object.keys(result.body).sort(), ['evaluation', 'ok', 'request_id']);
    assert.equal(Object.hasOwn(result.body.evaluation, 'decision_id'), false);
  }
});

test('internal evaluation rejects disabled, unauthenticated, ambiguous, malformed and oversized requests', async (t) => {
  const body = { rulebook: fixture.request.body.rulebook, inputs: { discount_percent: 10, margin_percent: 22 } };
  assert.equal((await (await serve(t))(body)).status, 503);
  assert.equal((await (await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_EVALUATOR_TOKEN: 'short' }))(body)).status, 503);
  const token = 'local-evaluator-token-with-more-than-32-bytes';
  const call = await serve(t, { DECIDE_AUTHORITY_ENABLED: '1', DECIDE_AUTHORITY_EVALUATOR_TOKEN: token });
  for (const headers of [
    { Authorization: 'Bearer customer-key' }, { 'x-api-key': token },
    { Authorization: `Bearer ${token}`, Origin: 'https://www.decide.fyi' },
    { Authorization: `Bearer ${token}`, 'x-api-key': 'ambiguous' }
  ]) assert.equal((await call(body, { headers })).status, 401);
  assert.equal((await call(undefined, { method: 'GET' })).status, 405);
  assert.equal((await call(body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call(body, { body: '{broken' })).status, 400);
  for (const inputs of [null, [], false, '10']) assert.equal((await call({ ...body, inputs })).status, 400);
  assert.equal((await call({ ...body, binding_mode: 'trusted_adapter_facts_then_declarative_rulebook' })).status, 400);
  assert.equal((await call({ ...body, inputs: { nested: { verdict: 'yes' } } })).status, 422);
  assert.equal((await call({ ...body, rulebook: { ...body.rulebook, rules: [...body.rulebook.rules, body.rulebook.rules[0]] } })).status, 422);
  assert.equal((await call({ padding: 'x'.repeat(131072) })).status, 413);
});
