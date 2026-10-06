// Fictional preparation writes happen before evaluation; the exposed adapter can only read.
import { setup, quote, policy, proposal, NOW } from './fixtures.js';
import { createQuoteDiscountMcpAdapter } from './mcp.js';

export function createReadOnlyEvaluationFixture() {
  const { service, owner, agent } = setup();
  const ids = {};
  function seed(label, facts, discount_bps) {
    owner.putQuote({ ...quote, quote_id: `quote-${label}`, ...facts });
    const record = agent.checkDiscount({ ...proposal, quote_id: `quote-${label}`, discount_bps, request_id: `request-${label}` });
    ids[label] = record.decision_id;
    return record;
  }
  seed('within', {}, 1500);
  ids.retry = agent.checkDiscount({ ...proposal, quote_id: 'quote-within', request_id: 'request-within' }).decision_id;
  seed('low', { cost_minor: 80_000 }, 1500);
  seed('exception', {}, 1800);
  seed('missing', { cost_minor: null }, 1500);
  seed('zero', {}, 10_000);
  seed('rounded', { list_amount_minor: 101, cost_minor: 60 }, 1500);
  owner.approvePolicy({ ...policy, version: 'v2', decision_ttl_ms: 10_000 });
  seed('short', {}, 1500);
  const questions = [
    { question: `Read ${ids.within} and ${ids.low}. How many basis points lower is the post-discount margin in the latter? Return one integer.`, answer: '2353', solve: read => read(ids.within).decision.margin_bps - read(ids.low).decision.margin_bps },
    { question: `Read ${ids.exception} and ${ids.missing}. Both need further handling; which reason code identifies missing trusted facts rather than an exception to the discount limit? Return the reason code only.`, answer: 'INPUT_SCHEMA_FAILED', solve: read => { const a = read(ids.exception).decision, b = read(ids.missing).decision; return b.margin_bps === null && a.margin_bps !== null ? b.reason_code : 'invalid'; } },
    { question: `Compare ${ids.zero} and ${ids.low}. Which reason code explains a zero net quote amount, rather than a margin-floor breach? Return the reason code only.`, answer: 'INVALID_NET_AMOUNT', solve: read => { const a = read(ids.zero).decision, b = read(ids.low).decision; return a.net_amount_minor === 0 && b.net_amount_minor > 0 ? a.reason_code : 'invalid'; } },
    { question: `Read ${ids.within} and ${ids.rounded}. They request the same percentage. For the smaller quote, what is the floor-rounded discount in integer minor units? Return one integer.`, answer: '15', solve: read => { const a = read(ids.within).decision, b = read(ids.rounded).decision; return a.discount_bps === b.discount_bps ? b.discount_minor : -1; } },
    { question: `Read ${ids.within} and ${ids.short}. At the fixed epoch time ${NOW + 15_000}, how many of these saved decisions have already expired? Return one integer.`, answer: '1', solve: read => [read(ids.within).decision, read(ids.short).decision].filter(record => record.expires_at_ms <= NOW + 15_000).length },
    { question: `Read ${ids.within} and ${ids.retry}. Do they identify the same saved decision, without a renewed expiry? Return True or False.`, answer: 'True', solve: read => { const a = read(ids.within).decision, b = read(ids.retry).decision; return a.decision_id === b.decision_id && a.expires_at_ms === b.expires_at_ms ? 'True' : 'False'; } },
    { question: `Read ${ids.low} and ${ids.exception}. One is denied and the other needs customer exception handling. What execution_authority string do both records expose? Return the string only.`, answer: 'none', solve: read => { const a = read(ids.low).decision, b = read(ids.exception).decision; return a.execution_authority === b.execution_authority ? a.execution_authority : 'invalid'; } },
    { question: `Read ${ids.within} and ${ids.short}. Even with yes verdicts, does either saved record alone give this agent permission to mutate a CRM quote? Return True or False.`, answer: 'False', solve: read => [read(ids.within).decision, read(ids.short).decision].some(record => record.execution_authority !== 'none') ? 'True' : 'False' },
    { question: `Read absent-record-reference and ${ids.missing}. Which error/reason token represents an inaccessible resource tool error, rather than a valid needs-input business decision? Return the token only.`, answer: 'NOT_FOUND', solve: read => { const a = read('absent-record-reference'), b = read(ids.missing); return !a.ok && b.ok ? a.error.code : 'invalid'; } },
    { question: `Read ${ids.within} and ${ids.short}, then reread the first. Did reading the saved decision extend its expiry to the other decision's lifetime? Return True or False.`, answer: 'False', solve: read => { const a = read(ids.within).decision; read(ids.short); const b = read(ids.within).decision; return b.expires_at_ms !== a.expires_at_ms ? 'True' : 'False'; } },
  ];
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const xml = `<evaluation>\n${questions.map(item => `  <qa_pair>\n    <question>${escape(item.question)}</question>\n    <answer>${escape(item.answer)}</answer>\n  </qa_pair>`).join('\n')}\n</evaluation>\n`;
  return { service, adapter: createQuoteDiscountMcpAdapter(agent, { readOnly: true }), questions, xml };
}
