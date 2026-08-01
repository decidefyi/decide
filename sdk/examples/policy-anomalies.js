const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function run() {
  const report = await decide.policyAnomalies('pricing_exception', {
    policyVersion: 'v3',
    limit: 1000,
    minSample: 10,
    threshold: 0.35,
    maxItems: 10
  });

  console.log(
    JSON.stringify(
      {
        policy_id: report.policy_id,
        policy_version: report.policy_version,
        status: report.status,
        recommendation: report.recommendation,
        decisions_analyzed: report.decisions_analyzed,
        summary: report.summary,
        baseline: report.baseline,
        anomalies: report.anomalies
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
