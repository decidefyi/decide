class QuoteDiscountError extends Error {
  constructor(code) { super(code); this.name = 'QuoteDiscountError'; this.code = code; }
}
const fail = code => { throw new QuoteDiscountError(code); };

function exact(value, keys) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(entry => !Object.hasOwn(entry, 'value'))) fail('INVALID_REQUEST');
}
function ref(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value)) fail('INVALID_REQUEST');
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_REQUEST');
}
function validateProposal(request) {
  exact(request, ['quote_id', 'quote_revision', 'discount_bps', 'request_id']);
  for (const key of ['quote_id', 'quote_revision', 'request_id']) ref(request[key]);
  if (request.request_id.length < 8) fail('INVALID_REQUEST');
  integer(request.discount_bps, 0, 10_000);
}
function validatePolicy(policy) {
  exact(policy, ['policy_id', 'version', 'currency', 'max_discount_bps', 'max_discount_minor', 'min_margin_bps', 'valid_from_ms', 'valid_until_ms', 'max_fact_age_ms', 'decision_ttl_ms']);
  ref(policy.policy_id); ref(policy.version);
  if (typeof policy.currency !== 'string' || !/^[A-Z]{3}$/.test(policy.currency)) fail('INVALID_REQUEST');
  integer(policy.max_discount_bps, 0, 10_000); integer(policy.min_margin_bps, 0, 10_000);
  integer(policy.max_discount_minor); integer(policy.valid_from_ms); integer(policy.valid_until_ms);
  integer(policy.max_fact_age_ms, 1, 600_000); integer(policy.decision_ttl_ms, 1, 600_000);
  if (policy.valid_until_ms <= policy.valid_from_ms) fail('INVALID_REQUEST');
}
function validateQuote(quote) {
  exact(quote, ['quote_id', 'revision', 'policy_id', 'currency', 'list_amount_minor', 'cost_minor', 'captured_at_ms', 'status']);
  for (const key of ['quote_id', 'revision', 'policy_id']) ref(quote[key]);
  if (typeof quote.currency !== 'string' || !/^[A-Z]{3}$/.test(quote.currency) || !['draft', 'sent', 'cancelled'].includes(quote.status)) fail('INVALID_REQUEST');
  integer(quote.list_amount_minor, 1); integer(quote.captured_at_ms);
  if (quote.cost_minor !== null) integer(quote.cost_minor);
}

function rulebook(policy) {
  const outcome = (decision, verdict, action, reason_code) => ({ decision, verdict, action, reason_code });
  return {
    schema_version: 'rulebook_v1', rulebook_id: 'quote_discount_approval', version: policy.version,
    input_schema: {
      required: ['discount_bps', 'discount_minor', 'net_positive', 'margin_bps'],
      properties: { discount_bps: { type: 'integer' }, discount_minor: { type: 'integer' }, net_positive: { type: 'boolean' }, margin_bps: { type: 'integer' } },
    },
    rules: [
      { rule_id: 'block_zero_net', priority: 300, condition: { field: 'net_positive', operator: 'eq', value: false }, outcome: outcome('no', 'BLOCK_DISCOUNT', 'reject_discount', 'INVALID_NET_AMOUNT') },
      { rule_id: 'block_margin', priority: 200, condition: { field: 'margin_bps', operator: 'lt', value: policy.min_margin_bps }, outcome: outcome('no', 'BLOCK_DISCOUNT', 'reject_discount', 'MARGIN_FLOOR_BREACH') },
      { rule_id: 'allow_standard', priority: 100, condition: { all: [
        { field: 'discount_bps', operator: 'lte', value: policy.max_discount_bps },
        { field: 'discount_minor', operator: 'lte', value: policy.max_discount_minor },
      ] }, outcome: outcome('yes', 'APPROVE_DISCOUNT', 'approve_discount', 'STANDARD_DISCOUNT_APPROVED') },
    ],
    default_outcome: outcome('review', 'REVIEW_DISCOUNT', 'route_to_customer_review', 'DISCOUNT_EXCEPTION'),
  };
}

function amounts(quote, discountBps) {
  const discount = Number(BigInt(quote.list_amount_minor) * BigInt(discountBps) / 10_000n);
  const net = quote.list_amount_minor - discount;
  let margin = null;
  if (quote.cost_minor !== null && net > 0) {
    const numerator = BigInt(net - quote.cost_minor) * 10_000n, denominator = BigInt(net);
    // BigInt division truncates toward zero; floor negative margins too.
    const value = numerator / denominator - (numerator < 0n && numerator % denominator !== 0n ? 1n : 0n);
    margin = Number(value);
    if (!Number.isSafeInteger(margin)) fail('MONEY_RANGE_UNSUPPORTED');
  } else if (net === 0) margin = 0;
  return { discount_minor: discount, net_amount_minor: net, margin_bps: margin };
}


function buildQuoteDiscountInput({ policy, quote, proposal }) {
  validatePolicy(policy); validateQuote(quote); validateProposal(proposal);
  if (quote.quote_id !== proposal.quote_id || quote.revision !== proposal.quote_revision) fail('QUOTE_CHANGED');
  if (quote.policy_id !== policy.policy_id) fail('POLICY_INACTIVE');
  if (quote.currency !== policy.currency) fail('CURRENCY_MISMATCH');
  if (quote.status !== 'draft') fail('QUOTE_NOT_DRAFT');
  const values = amounts(quote, proposal.discount_bps);
  const inputs = { quote_id: quote.quote_id, quote_revision: quote.revision,
    currency: quote.currency, list_amount_minor: quote.list_amount_minor, cost_minor: quote.cost_minor,
    discount_bps: proposal.discount_bps, discount_minor: values.discount_minor,
    net_positive: values.net_amount_minor > 0 };
  if (values.margin_bps !== null) inputs.margin_bps = values.margin_bps;
  return { input: { mode: 'rulebook', binding_mode: 'direct_declarative_rulebook',
    rulebook: rulebook(policy), context: { inputs } }, amounts: values };
}

module.exports = { QuoteDiscountError, exact, ref, integer, validateProposal,
  validatePolicy, validateQuote, buildQuoteDiscountInput };
