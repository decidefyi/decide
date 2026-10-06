import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, proposal, quote } from './fixtures.js';
import { createQuoteDiscountMcpAdapter } from './mcp.js';
import Ajv from 'ajv/dist/2020.js';

test('an agent discovers two focused tools, checks a quote and retrieves the same saved result', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const adapter = createQuoteDiscountMcpAdapter(agent);
  const definitions = adapter.listTools();
  assert.deepEqual(definitions.map(tool => tool.name), ['decide_check_quote_discount', 'decide_get_quote_discount_decision']);
  assert.equal(definitions[0].annotations.readOnlyHint, false);
  assert.equal(definitions[1].annotations.readOnlyHint, true);
  const checked = adapter.callTool(definitions[0].name, proposal);
  assert.equal(checked.isError, false);
  assert.equal(checked.structuredContent.decision.verdict, 'yes');
  assert.deepEqual(JSON.parse(checked.content[0].text), checked.structuredContent);
  assert.deepEqual(adapter.callTool(definitions[1].name, { decision_id: checked.structuredContent.decision.decision_id }).structuredContent, checked.structuredContent);
});

test('strict typed outputs cover yes/no/review and failures without marking business decisions as tool errors', t => {
  const { service, owner, agent } = setup(); t.after(() => service.close());
  const adapter = createQuoteDiscountMcpAdapter(agent);
  const ajv = new Ajv({ strict: true, allErrors: true });
  const tools = adapter.listTools();
  const validate = ajv.compile(tools[0].outputSchema);
  const cases = [
    adapter.callTool(tools[0].name, proposal),
    adapter.callTool(tools[0].name, { ...proposal, discount_bps: 1800, request_id: 'request-review' }),
    adapter.callTool(tools[0].name, { ...proposal, discount_bps: 10_000, request_id: 'request-deny' }),
    adapter.callTool(tools[0].name, { ...proposal, workspace_id: 'workspace-b' }),
    adapter.callTool(tools[1].name, { decision_id: 'unknown-record' }),
    adapter.callTool('approve_policy', {}),
  ];
  owner.putQuote({ ...quote, cost_minor: null });
  cases.push(adapter.callTool(tools[0].name, { ...proposal, request_id: 'request-missing-cost' }));
  for (const result of cases) {
    assert.equal(validate(result.structuredContent), true, JSON.stringify(validate.errors));
    assert.equal(result.isError, !result.structuredContent.ok);
    assert.equal(JSON.stringify(result.structuredContent).includes('workspace-a'), false);
  }
  assert.deepEqual(cases.slice(0, 3).map(result => result.structuredContent.decision.verdict), ['yes', 'review', 'no']);
});

test('MCP definitions cannot be mutated and unknown or malformed arguments never expose internal errors', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const adapter = createQuoteDiscountMcpAdapter(agent);
  const tools = adapter.listTools(); tools[0].name = 'execute_discount';
  assert.equal(adapter.listTools()[0].name, 'decide_check_quote_discount');
  const result = adapter.callTool('execute_discount', {});
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.decision, null);
  const broken = createQuoteDiscountMcpAdapter({ checkDiscount() { throw new Error('/private/database.sqlite raw secret'); }, getDecision() { throw new Error('raw sql'); } });
  assert.equal(broken.callTool('decide_check_quote_discount', proposal).structuredContent.error.code, 'STORE_UNAVAILABLE');
  assert.equal(broken.callTool('decide_check_quote_discount', proposal).content[0].text.includes('secret'), false);
});

test('the local JSON-RPC session initializes, lists tools and returns structured decisions', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const adapter = createQuoteDiscountMcpAdapter(agent);
  assert.equal(adapter.dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'local-test', version: '1' } } }).result.protocolVersion, '2025-11-25');
  assert.equal(adapter.dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(adapter.dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }).result.tools.length, 2);
  assert.equal(adapter.dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'decide_check_quote_discount', arguments: proposal } }).result.structuredContent.decision.verdict, 'yes');
});

test('uninitialized requests, notification tool calls, batches and oversized messages cannot allocate records', t => {
  const { service, agent } = setup({ max_records_per_workspace: 1 }); t.after(() => service.close());
  const adapter = createQuoteDiscountMcpAdapter(agent);
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'decide_check_quote_discount', arguments: proposal } };
  assert.equal(adapter.dispatch(call).error.code, -32000);
  assert.equal(adapter.dispatch([]).error.code, -32600);
  assert.equal(adapter.dispatch({ ...call, id: null }).error.code, -32600);
  assert.equal(adapter.dispatch({ ...call, params: { padding: 'x'.repeat(20_000) } }).error.code, -32600);
  assert.equal(adapter.dispatch({ jsonrpc: '2.0', method: 'tools/call', params: call.params }), null);
  assert.equal(agent.checkDiscount({ ...proposal, request_id: 'request-real' }).verdict, 'yes');
});

test('the read-only evaluation adapter cannot allocate new records', t => {
  const { service, agent } = setup(); t.after(() => service.close());
  const record = agent.checkDiscount(proposal);
  const adapter = createQuoteDiscountMcpAdapter(agent, { readOnly: true });
  assert.deepEqual(adapter.listTools().map(tool => tool.name), ['decide_get_quote_discount_decision']);
  assert.equal(adapter.callTool('decide_check_quote_discount', proposal).isError, true);
  assert.equal(adapter.callTool('decide_get_quote_discount_decision', { decision_id: record.decision_id }).structuredContent.decision.verdict, 'yes');
});
