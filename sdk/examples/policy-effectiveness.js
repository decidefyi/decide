const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function run() {
  const effectiveness = await decide.policyEffectiveness('pricing_exception', {
    policyVersion: 'v3',
    limit: 1000,
    minSample: 10
  });

  console.log(
    JSON.stringify(
      {
        policy_id: effectiveness.policy_id,
        policy_version: effectiveness.policy_version,
        status: effectiveness.status,
        recommendation: effectiveness.recommendation,
        decisions_analyzed: effectiveness.decisions_analyzed,
        effectiveness_score: effectiveness.effectiveness_score,
        confidence: effectiveness.confidence,
        metrics: effectiveness.metrics,
        proxy_quality: effectiveness.proxy_quality
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
