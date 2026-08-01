const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function run() {
  const decision = await decide.decide(
    {
      question: 'Approve billing discount before subscription mutation?',
      mode: 'single',
      context: {
        workflow: 'billing_discount_gate',
        source_record_id: 'sub_outcome_demo',
        requested_action: 'apply_discount',
        target_system: 'billing',
        target_object_id: 'sub_outcome_demo',
        mutation: 'discount.create',
        margin_floor: 'passed',
        owner_rule: 'verified'
      }
    },
    {
      idempotencyKey: 'sub_outcome_demo:discount:decision',
      responseView: 'standard'
    }
  );

  if (decision.verdict !== 'yes') {
    console.log(JSON.stringify({ route: 'review', decision }, null, 2));
    return;
  }

  const billingResult = {
    billing_id: 'bill_demo_1042',
    status: 'succeeded',
    margin_after_discount: 0.182
  };

  const outcome = await decide.recordOutcome(
    decision.decision_id,
    {
      outcome_status: billingResult.status,
      action_taken: 'apply_discount',
      action_executed: true,
      target_system: 'billing',
      target_object_id: 'sub_outcome_demo',
      mutation: 'discount.create',
      external_ref: billingResult.billing_id,
      decision_record_hash: decision.record_hash,
      decision_receipt_hash: decision.receipt_hash,
      observed_metrics: {
        margin_after_discount: billingResult.margin_after_discount
      },
      evidence_refs: [
        {
          id: billingResult.billing_id,
          type: 'billing_mutation',
          hash: 'billing_mutation_snapshot_hash'
        }
      ]
    },
    {
      idempotencyKey: 'sub_outcome_demo:discount:outcome'
    }
  );

  console.log(JSON.stringify({ decision_id: decision.decision_id, outcome }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
