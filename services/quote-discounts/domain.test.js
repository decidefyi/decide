import test from 'node:test';
import assert from 'node:assert/strict';
import domain from './domain.cjs';
import { policy, quote, proposal } from './fixtures.js';
import { evaluateRulebookV1 } from '../../lib/rulebook-v1.js';

test('portable quote facts and rules produce the same deterministic Runtime result without a local store', () => {
  const { input, amounts } = domain.buildQuoteDiscountInput({ policy, quote, proposal });
  assert.deepEqual(amounts, { discount_minor: 15000, net_amount_minor: 85000, margin_bps: 2941 });
  assert.equal(input.context.inputs.quote_id, quote.quote_id);
  assert.equal(input.context.inputs.quote_revision, quote.revision);
  assert.equal(input.context.inputs.list_amount_minor, 100000);
  const result = evaluateRulebookV1({ rulebook: input.rulebook, inputs: input.context.inputs, bindingMode: input.binding_mode });
  assert.equal(result.ok, true);
  assert.equal(result.result.verdict, 'yes');
});
