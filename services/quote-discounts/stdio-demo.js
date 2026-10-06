// Local fictional stdio only. No HTTP listener, provider credential or production identity.
import { setup } from './fixtures.js';
import { createQuoteDiscountMcpAdapter } from './mcp.js';
import { createReadOnlyEvaluationFixture } from './evaluations.js';

const fixture = process.argv.includes('--evaluation') ? createReadOnlyEvaluationFixture() : setup({ max_records_per_workspace: 10 });
const { service, agent } = fixture;
const adapter = fixture.adapter || createQuoteDiscountMcpAdapter(agent);
if (fixture.xml) process.stderr.write(fixture.xml); // Read-only questions/answers; stdout remains MCP only.
const write = value => { if (value !== null) process.stdout.write(`${JSON.stringify(value)}\n`); };
let buffer = '', dropping = false;
function line(text) {
  if (!text.trim()) return;
  let message;
  try { message = JSON.parse(text); }
  catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
  write(adapter.dispatch(message));
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  for (const part of chunk.split(/(\n)/)) {
    if (part === '\n') {
      if (!dropping) line(buffer);
      buffer = ''; dropping = false;
    } else if (!dropping) {
      buffer += part;
      if (Buffer.byteLength(buffer, 'utf8') > 16_384) {
        buffer = ''; dropping = true;
        write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request exceeds the local size limit' } });
      }
    }
  }
});
process.stdin.on('end', () => {
  if (!dropping && buffer) line(buffer);
  service.close();
});
