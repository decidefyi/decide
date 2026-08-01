const { createDecideClient } = require('../decide');

async function main() {
  const decide = createDecideClient({
    apiKey: process.env.DECIDE_API_KEY,
    baseUrl: process.env.DECIDE_BASE_URL || 'https://www.decide.fyi'
  });

  const registry = await decide.policyPatterns({ tag: 'crm' });
  const pricing = await decide.policyPatterns({ patternId: 'pricing_exception' });
  const pattern = pricing.policy_pattern || registry.patterns?.[0];

  if (!pattern) {
    throw new Error('No policy pattern returned');
  }

  const decision = await decide.decide(
    {
      ...pattern.decision_request_template,
      context: {
        ...pattern.decision_request_template?.context,
        source_record_id: 'deal_1042',
        requested_action: 'approve_discount'
      }
    },
    {
      idempotencyKey: `pattern_${pattern.pattern_id}_deal_1042`,
      responseView: 'full'
    }
  );

  console.log({
    pattern_id: pattern.pattern_id,
    pattern_hash: pattern.pattern_hash,
    decision_id: decision.decision_id,
    registry_count: registry.count
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
