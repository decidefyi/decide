const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function run() {
  const decision = await decide.decide(
    {
      question: 'Approve 15% annual-plan discount exception before billing changes?',
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
      idempotencyKey: 'deal_1042_discount_15:decision',
      responseView: 'full'
    }
  );

  if (decision.verdict !== 'yes') {
    return {
      route: 'review',
      decision_id: decision.decision_id,
      verdict: decision.verdict,
      record_hash: decision.record_hash,
      reason: 'Decision did not authorize the mutation.'
    };
  }

  const mutationResult = {
    execution_id: 'billing_run_1042',
    external_ref: 'bill_1042',
    state_before_hash: 'sha256:subscription_before_1042',
    state_after_hash: 'sha256:subscription_after_1042',
    margin_after_discount: 0.182
  };

  const execution = await decide.recordExecution(
    decision.decision_id,
    {
      execution_status: 'executed',
      action_taken: 'approve_discount',
      target_system: 'billing',
      target_object_id: 'sub_1042',
      mutation: 'discount.create',
      execution_id: mutationResult.execution_id,
      external_ref: mutationResult.external_ref,
      decision_record_hash: decision.record_hash,
      decision_receipt_hash: decision.receipt_hash,
      action_binding: decision.action_binding,
      state_before_hash: mutationResult.state_before_hash,
      state_after_hash: mutationResult.state_after_hash,
      executor: {
        type: 'service',
        id: 'billing-worker'
      }
    },
    {
      idempotencyKey: 'deal_1042_discount_15:execution'
    }
  );

  const outcome = await decide.recordOutcome(
    decision.decision_id,
    {
      outcome_status: 'succeeded',
      action_taken: 'approve_discount',
      action_executed: true,
      target_system: 'billing',
      target_object_id: 'sub_1042',
      mutation: 'discount.create',
      external_ref: mutationResult.external_ref,
      decision_record_hash: decision.record_hash,
      decision_receipt_hash: decision.receipt_hash,
      execution_receipt_id: execution.execution?.execution_receipt_id,
      execution_hash: execution.execution?.execution_hash,
      observed_metrics: {
        margin_after_discount: mutationResult.margin_after_discount
      }
    },
    {
      idempotencyKey: 'deal_1042_discount_15:outcome'
    }
  );

  const [effectiveness, anomalies] = await Promise.all([
    decide.policyEffectiveness('pricing_exception', {
      policyVersion: 'v3',
      limit: 1000,
      minSample: 10
    }),
    decide.policyAnomalies('pricing_exception', {
      policyVersion: 'v3',
      limit: 1000,
      minSample: 10,
      threshold: 0.35,
      maxItems: 5
    })
  ]);

  return {
    lifecycle: 'decision_to_execution_to_outcome_to_intelligence',
    decision_record: {
      decision_id: decision.decision_id,
      verdict: decision.verdict,
      record_hash: decision.record_hash,
      receipt_hash: decision.receipt_hash,
      verify_url: decision.verify_url,
      replay_url: decision.replay_url
    },
    execution_receipt: {
      execution_receipt_id: execution.execution?.execution_receipt_id,
      execution_hash: execution.execution?.execution_hash,
      action_binding_match: execution.execution?.action_binding_match
    },
    outcome_record: {
      outcome_id: outcome.outcome?.outcome_id,
      outcome_hash: outcome.outcome?.outcome_hash,
      outcome_status: outcome.outcome?.outcome_status
    },
    policy_intelligence: {
      effectiveness_score: effectiveness.effectiveness_score,
      effectiveness_recommendation: effectiveness.recommendation,
      anomaly_status: anomalies.status,
      anomaly_recommendation: anomalies.recommendation,
      anomaly_count: anomalies.anomalies?.length || 0
    }
  };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
