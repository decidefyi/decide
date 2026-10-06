import { setup, quote, proposal } from './fixtures.js';
import { createQuoteDiscountMcpAdapter } from './mcp.js';

const { service, owner, agent, executor } = setup({ max_records_per_workspace: 10 });
try {
  owner.putQuote({ ...quote, quote_id: 'quote-low-margin', cost_minor: 80_000 });
  owner.putQuote({ ...quote, quote_id: 'quote-missing-cost', cost_minor: null });
  const adapter = createQuoteDiscountMcpAdapter(agent);
  const inputs = [
    ['Within approved limits', proposal],
    ['Below margin floor', { ...proposal, quote_id: 'quote-low-margin', request_id: 'request-low-margin' }],
    ['Outside automatic discount limit', { ...proposal, discount_bps: 1800, request_id: 'request-exception' }],
    ['Missing trusted cost', { ...proposal, quote_id: 'quote-missing-cost', request_id: 'request-missing-cost' }],
  ];
  const checked = inputs.map(([scenario, args]) => {
    const result = adapter.callTool('decide_check_quote_discount', args);
    if (result.isError) throw new Error(result.structuredContent.error.code);
    return { scenario, record: result.structuredContent.decision };
  });
  const first = checked[0].record;
  const claim = executor.consumeApproval({ decision_id: first.decision_id, ...proposal });
  const retryClaim = executor.consumeApproval({ decision_id: first.decision_id, ...proposal });
  const output = {
    mode: 'fictional_local_reference', production_access: false, billing_enabled: false, external_actions: 0,
    cases: checked.map(({ scenario, record }) => ({ scenario, verdict: record.verdict, reason_code: record.reason_code, discount_minor: record.discount_minor, net_amount_minor: record.net_amount_minor, margin_bps: record.margin_bps, execution_authority: record.execution_authority })),
    identical_retry_returns_same_record: agent.checkDiscount(proposal).decision_id === first.decision_id,
    saved_record_read_matches: agent.getDecision({ decision_id: first.decision_id }).input_hash === first.input_hash,
    first_claim_new: claim.newly_claimed, repeat_claim_new: retryClaim.newly_claimed,
  };
  console.log(JSON.stringify(output, null, 2));
} finally { service.close(); }
