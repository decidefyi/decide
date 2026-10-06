import { createQuoteDiscountService } from './service.js';

export const NOW = Date.parse('2026-10-06T12:00:00Z');
export const policy = {
  policy_id: 'standard-discounts', version: 'v1', currency: 'USD',
  max_discount_bps: 1500, max_discount_minor: 20_000, min_margin_bps: 2000,
  valid_from_ms: NOW, valid_until_ms: NOW + 600_000,
  max_fact_age_ms: 60_000, decision_ttl_ms: 30_000,
};
export const quote = {
  quote_id: 'quote-100', revision: 'v1', policy_id: policy.policy_id,
  currency: 'USD', list_amount_minor: 100_000, cost_minor: 60_000,
  captured_at_ms: NOW, status: 'draft',
};
export const proposal = { quote_id: quote.quote_id, quote_revision: 'v1', discount_bps: 1500, request_id: 'request-100' };

/** Fictional bootstrap only. Never grant these identities to a public route. */
export function setup(options = {}) {
  const service = createQuoteDiscountService({ enabled: true, clock: () => NOW, ...options });
  for (const [principal_id, role] of [['owner', 'owner'], ['agent', 'agent'], ['executor', 'executor']]) {
    service.provisionPrincipal({ workspace_id: 'workspace-a', principal_id, role, policy_ids: [policy.policy_id], active: true });
  }
  const client = principal_id => service.client({ workspace_id: 'workspace-a', principal_id });
  const owner = client('owner');
  owner.approvePolicy(policy);
  owner.putQuote(quote);
  return { service, owner, agent: client('agent'), executor: client('executor') };
}
