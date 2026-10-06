import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyEvaluationFixture } from './evaluations.js';

test('ten independent agent questions have verified stable answers using saved-record reads only', t => {
  const fixture = createReadOnlyEvaluationFixture(); t.after(() => fixture.service.close());
  assert.equal(fixture.questions.length, 10);
  assert.deepEqual(fixture.adapter.listTools().map(tool => tool.name), ['decide_get_quote_discount_decision']);
  for (const question of fixture.questions) {
    let reads = 0;
    const read = id => {
      reads++;
      return fixture.adapter.callTool('decide_get_quote_discount_decision', { decision_id: id }).structuredContent;
    };
    assert.equal(String(question.solve(read)), question.answer, question.question);
    assert.ok(reads >= 2, 'each question requires at least two independent record reads');
  }
  assert.equal((fixture.xml.match(/<qa_pair>/g) || []).length, 10);
});
