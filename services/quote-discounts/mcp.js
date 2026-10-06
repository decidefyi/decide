import { QuoteDiscountError } from './service.js';
import { CHECK_INPUT_SCHEMA, READ_INPUT_SCHEMA, TOOL_OUTPUT_SCHEMA } from './schemas.js';

const messages = {
  INVALID_REQUEST: 'Use only the documented arguments. Do not supply facts, rules, ownership or approval overrides.',
  UNAUTHENTICATED: 'Connect an authenticated application identity before checking or reading decisions.',
  FORBIDDEN: 'This connection does not have permission for the requested operation.',
  NOT_FOUND: 'No accessible quote or decision was found for this connection.',
  POLICY_INACTIVE: 'The application must activate an approved policy before checks can proceed.',
  POLICY_NOT_EFFECTIVE: 'The approved policy is not currently effective. Do not execute.',
  QUOTE_CHANGED: 'Refresh the application quote reference and revision, then submit a new request.',
  QUOTE_NOT_DRAFT: 'Only a draft quote can be checked. Do not change a sent or cancelled quote.',
  CURRENCY_MISMATCH: 'The quote and approved policy must use the same currency. No conversion is performed.',
  FACTS_NOT_CURRENT: 'The application must refresh its trusted quote snapshot. Do not invent missing facts.',
  IDEMPOTENCY_CONFLICT: 'This request ID was already used for a different proposal. Keep retries identical.',
  RECORD_LIMIT_REACHED: 'The local record limit is reached. Retries and reads do not allocate another record.',
  CLOCK_INVALID: 'The service clock is unavailable. Do not execute.',
  MONEY_RANGE_UNSUPPORTED: 'The quote calculation exceeds the supported exact integer range. Do not execute.',
  RUNTIME_REJECTED: 'The Runtime rejected the configured policy. Do not execute.',
  STORE_UNAVAILABLE: 'The decision store is unavailable. Retry later; errors never authorize an action.',
  UNKNOWN_TOOL: 'Use decide_check_quote_discount or decide_get_quote_discount_decision. Execution and policy setup are not agent tools.',
};
const definitions = [
  {
    name: 'decide_check_quote_discount', title: 'Check quote discount',
    description: 'Check a proposed quote discount against the connected application\'s approved limits and trusted quote snapshot. Save a yes/no/review record. Local reference integration only; no production access, billing, CRM mutation or policy activation. An application must enforce the saved decision before acting; an agent cannot invent margins, costs or rules.',
    inputSchema: CHECK_INPUT_SCHEMA, outputSchema: TOOL_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'decide_get_quote_discount_decision', title: 'Read saved quote discount decision',
    description: 'Read a saved local quote discount decision accessible to the connected account and policy grant. Reading or replaying a yes does not renew validity or authorize execution. No production access or external actions.',
    inputSchema: READ_INPUT_SCHEMA, outputSchema: TOOL_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

/** Bind only a client obtained by trusted authenticated host code, never by tool arguments. */
export function createQuoteDiscountMcpAdapter(client, { readOnly = false } = {}) {
  if (typeof client?.checkDiscount !== 'function' || typeof client?.getDecision !== 'function') throw new QuoteDiscountError('INVALID_CONFIGURATION');
  let session = 'created';
  const adapter = {
    listTools() { return structuredClone(readOnly ? [definitions[1]] : definitions); },
    callTool(name, args) {
      let payload;
      try {
        if (readOnly && name !== definitions[1].name) throw new QuoteDiscountError('UNKNOWN_TOOL');
        let decision;
        if (name === definitions[0].name) decision = client.checkDiscount(args);
        else if (name === definitions[1].name) decision = client.getDecision(args);
        else throw new QuoteDiscountError('UNKNOWN_TOOL');
        payload = { ok: true, decision, error: null };
      } catch (error) {
        const code = error instanceof QuoteDiscountError && Object.hasOwn(messages, error.code) ? error.code : 'STORE_UNAVAILABLE';
        payload = { ok: false, decision: null, error: { code, message: messages[code] } };
      }
      return { isError: !payload.ok, content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
    },
    dispatch(message) {
      const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
      const response = result => ({ jsonrpc: '2.0', id: message.id, result });
      const error = (code, text, id = message?.id ?? null) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
      if (!plain(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
          Object.keys(message).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key)) ||
          (Object.hasOwn(message, 'id') && !(typeof message.id === 'string' && message.id.length <= 120 || Number.isSafeInteger(message.id)))) return error(-32600, 'Invalid request', null);
      try { if (Buffer.byteLength(JSON.stringify(message), 'utf8') > 16_384) return error(-32600, 'Request exceeds the local size limit', null); }
      catch { return error(-32600, 'Invalid JSON request', null); }
      if (!Object.hasOwn(message, 'id')) {
        if (message.method === 'notifications/initialized' && session === 'initializing') session = 'ready';
        return null; // Notifications never perform tools/call or return responses.
      }
      if (message.method === 'ping') return response({});
      const params = message.params ?? {};
      if (!plain(params)) return error(-32602, 'Invalid parameters');
      if (message.method === 'initialize') {
        if (session !== 'created') return error(-32600, 'Session already initialized');
        if (typeof params.protocolVersion !== 'string' || !plain(params.capabilities) || !plain(params.clientInfo) ||
            typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return error(-32602, 'Invalid initialization parameters');
        const protocols = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
        session = 'initializing';
        return response({
          protocolVersion: protocols.includes(params.protocolVersion) ? params.protocolVersion : protocols[0],
          capabilities: { tools: {} }, serverInfo: { name: 'decide-quote-discounts-mcp-server', version: '0.1.0-local' },
          instructions: 'Fictional local reference integration only. Check/read approved quote discounts. No production access, billing or CRM execution. Facts and policies are controlled by the application, not tool arguments. Review/no/errors cannot authorize execution; saved yes records expire and require an application-only consume gate.',
        });
      }
      if (session !== 'ready') return error(-32000, 'Initialize this local session before calling tools');
      if (message.method === 'tools/list') {
        if (Object.keys(params).length) return error(-32602, 'This bounded tool list takes no cursor or filters');
        return response({ tools: adapter.listTools() });
      }
      if (message.method === 'tools/call') {
        if (Object.keys(params).some(key => !['name', 'arguments'].includes(key)) || typeof params.name !== 'string' || !plain(params.arguments)) return error(-32602, 'Use a tool name and arguments object');
        return response(adapter.callTool(params.name, params.arguments));
      }
      return error(-32601, 'Method not found');
    },
  };
  return adapter;
}
