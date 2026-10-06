import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteDiscountService } from './service.js';
import { NOW, policy, quote, proposal, setup } from './fixtures.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the service is disabled unless the trusted host explicitly enables it', () => {
  assert.throws(() => createQuoteDiscountService(), { code: 'SERVICE_DISABLED' });
});

test('checks a referenced quote using approved rules and saves the actual Runtime result', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  assert.equal(record.verdict, 'yes');
  assert.equal(record.discount_minor, 15_000);
  assert.equal(record.net_amount_minor, 85_000);
  assert.equal(record.margin_bps, 2941);
  assert.equal(record.runtime.runtime_binding.verdict_authority, 'declarative_rulebook');
  assert.equal(record.reason_code, 'STANDARD_DISCOUNT_APPROVED');
  assert.equal(record.execution_authority, 'none');
  assert.deepEqual(agent.getDecision({ decision_id: record.decision_id }), record);
});

test('agents cannot supply trusted facts, policies, ownership or approvals', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  for (const extra of [
    { margin_bps: 10_000 }, { cost_minor: 1 }, { rulebook: {} },
    { approved: true }, { workspace_id: 'workspace-b' }, { fact_source: 'https://example.com' },
  ]) assert.throws(() => agent.checkDiscount({ ...proposal, ...extra }), { code: 'INVALID_REQUEST' });
});

test('approved policy versions cannot be silently edited or activated by an agent', t => {
  const { service, owner, agent } = setup(); t.after(() => service.close());
  assert.throws(() => agent.approvePolicy({ ...policy, max_discount_bps: 9000 }), { code: 'FORBIDDEN' });
  assert.throws(() => owner.approvePolicy({ ...policy, max_discount_bps: 9000 }), { code: 'POLICY_VERSION_CONFLICT' });
  assert.equal(agent.checkDiscount({ ...proposal, discount_bps: 1600 }).verdict, 'review');
});

test('only an executor can claim an exact saved yes, and an identical retry never gives a second claim', t => {
  const { service, agent, executor } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  const request = { decision_id: record.decision_id, ...proposal };
  assert.throws(() => agent.consumeApproval(request), { code: 'FORBIDDEN' });
  assert.throws(() => executor.consumeApproval({ ...request, discount_bps: 1000 }), { code: 'ACTION_MISMATCH' });
  const first = executor.consumeApproval(request), retry = executor.consumeApproval(request);
  assert.equal(first.newly_claimed, true);
  assert.equal(retry.newly_claimed, false);
  assert.equal(first.claim_id, retry.claim_id);
});

test('invalid owner inputs, malformed contexts and non-finite clocks fail closed', t => {
  const { service, owner, agent } = setup(); t.after(() => service.close());
  for (const bad of [NaN, Infinity, -1, 10001, 1.5, '1500', null]) {
    assert.throws(() => agent.checkDiscount({ ...proposal, discount_bps: bad }), { code: 'INVALID_REQUEST' });
  }
  assert.throws(() => service.client({ workspace_id: 'workspace-a', principal_id: 'agent', role: 'owner' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => owner.putQuote({ ...quote, cost_minor: -1 }), { code: 'INVALID_REQUEST' });
  assert.throws(() => owner.approvePolicy({ ...policy, version: 'v2', min_margin_bps: -1 }), { code: 'INVALID_REQUEST' });
  const badClock = createQuoteDiscountService({ enabled: true, clock: () => NaN }); t.after(() => badClock.close());
  badClock.provisionPrincipal({ workspace_id: 'workspace-a', principal_id: 'owner', role: 'owner', policy_ids: [], active: true });
  assert.throws(() => badClock.client({ workspace_id: 'workspace-a', principal_id: 'owner' }).approvePolicy(policy), { code: 'CLOCK_INVALID' });
});

test('policy suspension withdraws outstanding approvals without deleting their history', t => {
  const { service, owner, agent, executor } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  owner.suspendPolicy({ policy_id: policy.policy_id });
  assert.throws(() => agent.checkDiscount({ ...proposal, request_id: 'request-new' }), { code: 'POLICY_INACTIVE' });
  assert.throws(() => executor.consumeApproval({ decision_id: record.decision_id, ...proposal }), { code: 'POLICY_INACTIVE' });
  assert.deepEqual(agent.getDecision({ decision_id: record.decision_id }), record);
});

test('the local record budget is bounded and identical retries do not consume another record', t => {
  const { service, agent } = setup({ max_records_per_workspace: 1 }); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  assert.deepEqual(agent.checkDiscount(proposal), record);
  assert.throws(() => agent.checkDiscount({ ...proposal, request_id: 'request-other' }), { code: 'RECORD_LIMIT_REACHED' });
  assert.throws(() => agent.checkDiscount({ ...proposal, discount_bps: 1000 }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('margin breaches deny, limit exceptions review, and missing cost never permits consumption', t => {
  const { service, owner, agent, executor } = setup(); t.after(() => service.close());
  const exception = agent.checkDiscount({ ...proposal, discount_bps: 1600, request_id: 'request-exception' });
  assert.equal(exception.verdict, 'review');
  assert.throws(() => executor.consumeApproval({ decision_id: exception.decision_id, ...proposal, discount_bps: 1600, request_id: 'request-exception' }), { code: 'DECISION_NOT_ALLOWING' });
  owner.putQuote({ ...quote, cost_minor: 80_000 });
  const denied = agent.checkDiscount({ ...proposal, request_id: 'request-denied' });
  assert.equal(denied.verdict, 'no');
  assert.equal(denied.reason_code, 'MARGIN_FLOOR_BREACH');
  assert.throws(() => executor.consumeApproval({ decision_id: denied.decision_id, ...proposal, request_id: 'request-denied' }), { code: 'DECISION_NOT_ALLOWING' });
  owner.putQuote({ ...quote, cost_minor: null });
  const missing = agent.checkDiscount({ ...proposal, request_id: 'request-missing' });
  assert.equal(missing.verdict, 'review');
  assert.equal(missing.reason_code, 'INPUT_SCHEMA_FAILED');
  assert.equal(missing.margin_bps, null);
});

test('amount limits, floor rounding and zero net use exact integer money, not floating prices', t => {
  const { service, owner, agent } = setup(); t.after(() => service.close());
  owner.putQuote({ ...quote, list_amount_minor: 101, cost_minor: 60 });
  const rounded = agent.checkDiscount(proposal);
  assert.equal(rounded.discount_minor, 15);
  assert.equal(rounded.net_amount_minor, 86);
  owner.approvePolicy({ ...policy, version: 'v2', max_discount_minor: 14 });
  assert.equal(agent.checkDiscount({ ...proposal, request_id: 'request-amount' }).verdict, 'review');
  assert.equal(agent.checkDiscount({ ...proposal, discount_bps: 10_000, request_id: 'request-zero' }).reason_code, 'INVALID_NET_AMOUNT');
  owner.putQuote({ ...quote, list_amount_minor: Number.MAX_SAFE_INTEGER, cost_minor: 0 });
  const large = agent.checkDiscount({ ...proposal, discount_bps: 1, request_id: 'request-large' });
  assert.equal(large.discount_minor, Number(BigInt(Number.MAX_SAFE_INTEGER) / 10_000n));
  owner.putQuote({ ...quote, list_amount_minor: 1, cost_minor: Number.MAX_SAFE_INTEGER });
  assert.throws(() => agent.checkDiscount({ ...proposal, discount_bps: 0, request_id: 'request-range' }), { code: 'MONEY_RANGE_UNSUPPORTED' });
});

test('current quote data, revision, policy epoch and account grants are rechecked at consumption', t => {
  for (const change of ['quote-facts', 'quote-version', 'policy', 'grant', 'revocation']) {
    const { service, owner, agent, executor } = setup(); t.after(() => service.close());
    const record = agent.checkDiscount(proposal);
    if (change === 'quote-facts') owner.putQuote({ ...quote, cost_minor: 81_000 });
    if (change === 'quote-version') owner.putQuote({ ...quote, revision: 'v2' });
    if (change === 'policy') owner.approvePolicy({ ...policy, version: 'v2', max_discount_bps: 500 });
    if (['grant', 'revocation'].includes(change)) service.provisionPrincipal({ workspace_id: 'workspace-a', principal_id: 'agent', role: 'agent', policy_ids: [policy.policy_id], active: change !== 'revocation' });
    assert.throws(() => executor.consumeApproval({ decision_id: record.decision_id, ...proposal }), error => ['AUTHORITY_CHANGED', 'QUOTE_CHANGED', 'FORBIDDEN'].includes(error.code));
  }
});

test('stale/future facts, currency mismatch, expired policy and expired decisions never allow action', t => {
  let now = NOW;
  const { service, owner, agent, executor } = setup({ clock: () => now }); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  now += 30_000;
  assert.equal(agent.checkDiscount(proposal).expires_at_ms, record.expires_at_ms);
  assert.throws(() => executor.consumeApproval({ decision_id: record.decision_id, ...proposal }), { code: 'DECISION_EXPIRED' });
  now = NOW - 1;
  assert.throws(() => agent.checkDiscount({ ...proposal, request_id: 'request-rollback' }), { code: 'POLICY_NOT_EFFECTIVE' });
  now = NOW + 60_000;
  assert.throws(() => agent.checkDiscount(proposal), { code: 'FACTS_NOT_CURRENT' });
  now = NOW;
  owner.putQuote({ ...quote, captured_at_ms: NOW + 1 });
  assert.throws(() => agent.checkDiscount(proposal), { code: 'FACTS_NOT_CURRENT' });
  owner.putQuote({ ...quote, currency: 'EUR' });
  assert.throws(() => agent.checkDiscount(proposal), { code: 'CURRENCY_MISMATCH' });
  owner.putQuote({ ...quote, captured_at_ms: NOW + 600_000 }); now = NOW + 600_000;
  assert.throws(() => agent.checkDiscount(proposal), { code: 'POLICY_NOT_EFFECTIVE' });
});

test('workspace and per-policy grants prevent record and quote enumeration', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  service.provisionPrincipal({ workspace_id: 'workspace-b', principal_id: 'agent', role: 'agent', policy_ids: [policy.policy_id], active: true });
  const otherWorkspace = service.client({ workspace_id: 'workspace-b', principal_id: 'agent' });
  assert.throws(() => otherWorkspace.checkDiscount(proposal), { code: 'NOT_FOUND' });
  assert.throws(() => otherWorkspace.getDecision({ decision_id: record.decision_id }), { code: 'NOT_FOUND' });
  service.provisionPrincipal({ workspace_id: 'workspace-a', principal_id: 'restricted', role: 'agent', policy_ids: [], active: true });
  const restricted = service.client({ workspace_id: 'workspace-a', principal_id: 'restricted' });
  assert.throws(() => restricted.checkDiscount(proposal), { code: 'NOT_FOUND' });
  assert.throws(() => restricted.getDecision({ decision_id: record.decision_id }), { code: 'NOT_FOUND' });
  assert.throws(() => service.client({ workspace_id: 'workspace-a', principal_id: 'unknown' }).getDecision({ decision_id: record.decision_id }), { code: 'UNAUTHENTICATED' });
});

test('saved decisions, membership and one-time claims survive a local store restart', t => {
  // Leave the tiny task-owned database as local test evidence; no cleanup approved.
  const filename = join(mkdtempSync(join(tmpdir(), 'decide-quote-durability-')), 'store.sqlite');
  const original = setup({ filename });
  const record = original.agent.checkDiscount(proposal);
  const first = original.executor.consumeApproval({ decision_id: record.decision_id, ...proposal });
  original.service.close();
  const service = createQuoteDiscountService({ enabled: true, filename, clock: () => NOW }); t.after(() => service.close());
  const client = principal_id => service.client({ workspace_id: 'workspace-a', principal_id });
  assert.deepEqual(client('agent').getDecision({ decision_id: record.decision_id }), record);
  assert.deepEqual(client('agent').checkDiscount(proposal), record);
  const retry = client('executor').consumeApproval({ decision_id: record.decision_id, ...proposal });
  assert.equal(retry.claim_id, first.claim_id);
  assert.equal(retry.newly_claimed, false);
});

test('returned objects are copies, and a closed store returns a safe failure', t => {
  const { service, agent, executor } = setup();
  const record = agent.checkDiscount({ ...proposal, discount_bps: 1700 });
  record.verdict = 'yes'; record.runtime.action = 'approve_discount';
  assert.equal(agent.getDecision({ decision_id: record.decision_id }).verdict, 'review');
  assert.throws(() => executor.consumeApproval({ decision_id: record.decision_id, ...proposal, discount_bps: 1700 }), { code: 'DECISION_NOT_ALLOWING' });
  service.close();
  assert.throws(() => agent.getDecision({ decision_id: record.decision_id }), { code: 'STORE_UNAVAILABLE' });
});

test('a fresh request ID does not create another claim for the same quote revision or another discount', t => {
  const { service, agent, executor } = setup(); t.after(() => service.close());
  const first = agent.checkDiscount(proposal);
  const claim = executor.consumeApproval({ decision_id: first.decision_id, ...proposal });
  const repeated = { ...proposal, request_id: 'request-repeat-business-action' };
  const second = agent.checkDiscount(repeated);
  const already = executor.consumeApproval({ decision_id: second.decision_id, ...repeated });
  assert.equal(already.claim_id, claim.claim_id);
  assert.equal(already.newly_claimed, false);
  const changed = { ...proposal, discount_bps: 1000, request_id: 'request-different-discount' };
  const changedDecision = agent.checkDiscount(changed);
  assert.throws(() => executor.consumeApproval({ decision_id: changedDecision.decision_id, ...changed }), { code: 'EXECUTION_CONFLICT' });
});

test('reactivation does not revive an older policy epoch decision', t => {
  const { service, owner, agent, executor } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  owner.suspendPolicy({ policy_id: policy.policy_id }); owner.approvePolicy(policy);
  assert.throws(() => executor.consumeApproval({ decision_id: record.decision_id, ...proposal }), { code: 'AUTHORITY_CHANGED' });
});
