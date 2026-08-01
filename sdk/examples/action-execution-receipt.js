const { createDecideClient } = require('@decide-fyi/sdk');

async function run() {
  const decide = createDecideClient({
    apiKey: process.env.DECIDE_API_KEY
  });

  const decision = await decide.decide(
    {
      question: 'Authorize this billing discount mutation before execution?',
      mode: 'single',
      context: {
        workflow: 'action_execution_receipt',
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

  if (decision.verdict !== 'yes') {
    return {
      executed: false,
      decision_id: decision.decision_id,
      verdict: decision.verdict,
      reason: 'Decision did not authorize the action.'
    };
  }

  // Replace this with the real mutation in billing, a queue worker, an agent tool, or another target system.
  const mutationResult = {
    execution_id: 'billing_run_1042',
    transaction_id: 'bill_1042',
    state_before_hash: 'sha256:subscription_before_1042',
    state_after_hash: 'sha256:subscription_after_1042'
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
      external_ref: mutationResult.transaction_id,
      state_before_hash: mutationResult.state_before_hash,
      state_after_hash: mutationResult.state_after_hash,
      decision_record_hash: decision.record_hash,
      decision_receipt_hash: decision.receipt_hash,
      action_binding: decision.action_binding,
      executor: {
        type: 'service',
        id: 'billing-worker'
      }
    },
    {
      idempotencyKey: 'deal_1042_discount_15_execution'
    }
  );

  return {
    decision_id: decision.decision_id,
    execution_receipt_id: execution.execution.execution_receipt_id,
    execution_hash: execution.execution.execution_hash
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
