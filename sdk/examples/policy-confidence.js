const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function main() {
  const confidence = await decide.policyConfidence('pricing_exception', {
    policyVersion: 'v3',
    verdict: 'yes',
    action: 'approve_discount',
    limit: 1000,
    minSample: 10
  });

  console.log({
    score: confidence.score,
    level: confidence.level,
    based_on: confidence.based_on,
    similar_decisions: confidence.similar_decisions,
    policy_stability: confidence.policy_stability,
    recommendation: confidence.recommendation,
    confidence_hash: confidence.confidence_hash
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
