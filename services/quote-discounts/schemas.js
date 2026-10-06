const reference = { type: 'string', minLength: 1, maxLength: 120, pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const text = { type: 'string' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const CHECK_INPUT_SCHEMA = object({
  quote_id: { ...reference, description: 'Reference from the connected application. Not a URL or customer data.' },
  quote_revision: { ...reference, description: 'The exact current resource revision supplied by the application.' },
  discount_bps: { type: 'integer', minimum: 0, maximum: 10_000, description: 'Proposed discount in basis points: 1500 is 15%. No cost, margin or approval overrides.' },
  request_id: { ...reference, minLength: 8, description: 'Stable retry identity for this proposal. Same request returns the same record; changed arguments conflict.' },
});
export const READ_INPUT_SCHEMA = object({ decision_id: { ...reference, description: 'Saved quote discount decision reference, scoped to the connected account and allowed policy.' } });

export const DECISION_SCHEMA = object({
  schema_version: { const: 'quote_discount_decision_v1' },
  decision_id: reference, quote_id: reference, quote_revision: reference, request_id: reference,
  discount_bps: { type: 'integer', minimum: 0, maximum: 10_000 },
  currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  discount_minor: integer, net_amount_minor: integer,
  margin_bps: { anyOf: [{ type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: 10_000 }, { type: 'null' }] },
  policy_id: reference, policy_version: reference, policy_hash: digest, input_hash: digest,
  verdict: { enum: ['yes', 'no', 'review'] }, reason_code: text,
  checked_at_ms: integer, expires_at_ms: integer, execution_authority: { const: 'none' },
  runtime: object({
    status: { enum: ['ok', 'needs_input'] }, engine: text, evaluator_version: text,
    rulebook_contract: object({ schema_version: text, schema_url: text, schema_hash: digest, evaluator_version: text }),
    runtime_binding: object({ production_core: { const: 'hybrid_declarative_rulebook_with_trusted_adapters' }, binding_mode: { const: 'direct_declarative_rulebook' }, verdict_authority: { const: 'declarative_rulebook' }, customer_supplied_code: { const: 'rejected' } }),
    verdict: { enum: ['yes', 'no', 'review'] }, application_verdict: text, action: text, reason_code: text,
    matched_rule_id: { anyOf: [text, { type: 'null' }] }, policy_hash: digest, input_hash: digest,
  }),
});
export const TOOL_OUTPUT_SCHEMA = {
  ...object({
    ok: { type: 'boolean' },
    decision: { anyOf: [DECISION_SCHEMA, { type: 'null' }] },
    error: { anyOf: [object({ code: text, message: text }), { type: 'null' }] },
  }),
  oneOf: [
    { properties: { ok: { const: true }, decision: { type: 'object' }, error: { type: 'null' } } },
    { properties: { ok: { const: false }, decision: { type: 'null' }, error: { type: 'object' } } },
  ],
};
