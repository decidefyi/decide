const { createDecideClient } = require('../decide');

async function main() {
  const decide = createDecideClient({ apiKey: process.env.DECIDE_API_KEY });

  const original = await decide.decide(
    {
      question: 'Approve 15% annual-plan discount exception?',
      mode: 'single',
      context: {
        workflow: 'pricing_exception',
        source_record_id: 'deal_1042',
        requested_action: 'approve_discount',
        target_system: 'billing',
        target_object_id: 'sub_1042',
        mutation: 'discount.create',
        discount_percent: 15,
        margin_floor: 'passed',
        owner_rule: 'verified'
      }
    },
    {
      idempotencyKey: 'deal_1042_discount_15',
      responseView: 'full'
    }
  );

  const report = await decide.counterfactuals(original.decision_id, {
    response_view: 'standard',
    // Counterfactuals are simulation-only and do not authorize downstream mutation.
    scenarios: [
      {
        scenario_id: 'discount_10_percent',
        label: '10% discount',
        context_patch: {
          discount_percent: 10,
          requested_action: 'approve_discount'
        }
      },
      {
        scenario_id: 'discount_25_percent',
        label: '25% discount',
        context_patch: {
          discount_percent: 25,
          requested_action: 'approve_discount',
          margin_floor: 'review_required'
        }
      }
    ]
  });

  for (const scenario of report.scenarios) {
    console.log(
      scenario.scenario_id,
      scenario.verdict,
      scenario.action,
      scenario.changed,
      scenario.recommendation
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
