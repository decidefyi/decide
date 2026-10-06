import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { proposal } from './fixtures.js';

test('the fictional stdio server speaks MCP with structured output and never accepts execution tools', () => {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'acceptance-client', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'decide_check_quote_discount', arguments: proposal } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'execute_discount', arguments: {} } },
  ];
  const child = spawnSync(process.execPath, [new URL('./stdio-demo.js', import.meta.url).pathname], { input: messages.map(message => JSON.stringify(message)).join('\n') + '\n', encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0, child.stderr);
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses.map(response => response.id), [1, 2, 3, 4]);
  assert.equal(responses[1].result.tools.length, 2);
  assert.equal(responses[2].result.structuredContent.decision.verdict, 'yes');
  assert.equal(responses[3].result.isError, true);
  assert.equal(responses[3].result.structuredContent.error.code, 'UNKNOWN_TOOL');
});

test('stdio framing rejects oversized/invalid input and recovers for the next valid message', () => {
  const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { padding: 'x'.repeat(20_000) } }) + '\nnot json\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) + '\n';
  const child = spawnSync(process.execPath, [new URL('./stdio-demo.js', import.meta.url).pathname], { input, encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0, child.stderr);
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(responses[0].error.code, -32600);
  assert.equal(responses[1].error.code, -32700);
  assert.deepEqual(responses[2], { jsonrpc: '2.0', id: 2, result: {} });
});

test('evaluation mode keeps its ten questions off stdout and exposes only saved-record reads', () => {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'read-only-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'decide_check_quote_discount', arguments: proposal } },
  ];
  const child = spawnSync(process.execPath, [new URL('./stdio-demo.js', import.meta.url).pathname, '--evaluation'], { input: messages.map(message => JSON.stringify(message)).join('\n') + '\n', encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0);
  assert.equal((child.stderr.match(/<qa_pair>/g) || []).length, 10);
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses[1].result.tools.map(tool => tool.name), ['decide_get_quote_discount_decision']);
  assert.equal(responses[2].result.isError, true);
});
