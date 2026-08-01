const { createDecideClient } = require('../decide');

async function main() {
  const decide = createDecideClient({
    apiKey: process.env.DECIDE_API_KEY,
    baseUrl: process.env.DECIDE_BASE_URL || 'https://www.decide.fyi'
  });

  const benchmarks = await decide.policyBenchmarks('pricing_exception', {
    policyVersion: 'v3',
    limit: 5000,
    minCohortScopes: 3,
    minCohortDecisions: 30
  });

  console.log({
    status: benchmarks.cross_customer?.status,
    recommendation: benchmarks.recommendation,
    your_success_rate: benchmarks.your_metrics?.success_rate,
    cohort_success_p50: benchmarks.cross_customer?.percentiles?.success_rate?.p50,
    success_rate_delta_vs_p50: benchmarks.comparison?.success_rate_delta_vs_p50,
    benchmark_hash: benchmarks.benchmark_hash
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
