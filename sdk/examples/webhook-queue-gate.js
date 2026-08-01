const { createDecideClient } = require('../decide');

function routeFromRecord(record) {
  if (record?.verdict === 'yes' || record?.c === 'yes' || record?.v === 'approved') return 'proceed';
  if (record?.verdict === 'no' || record?.c === 'no' || record?.v === 'denied') return 'block';
  return 'review';
}

async function handleQueuedAction(job, {
  decide = createDecideClient({ apiKey: process.env.DECIDE_API_KEY }),
  saveDecisionRecord,
  performSideEffect,
  sendToReview
} = {}) {
  if (!saveDecisionRecord || !performSideEffect || !sendToReview) {
    throw new Error('handleQueuedAction requires saveDecisionRecord, performSideEffect, and sendToReview callbacks');
  }

  const input = {
    question: 'Approve queued action before worker side effect?',
    mode: 'single',
    context: {
      workflow: 'queue_worker_gate',
      source_record_id: job.id,
      requested_action: job.action,
      target_system: job.targetSystem,
      target_object_id: job.targetObjectId,
      mutation: job.mutation,
      queue_name: job.queueName,
      attempt: job.attempt
    }
  };

  let record;
  try {
    record = await decide.decide(input, {
      idempotencyKey: `queue:${job.queueName}:${job.id}:${job.action}`,
      responseView: 'standard'
    });
  } catch (error) {
    await sendToReview(job, { reason: 'decide_unavailable', status: error.status, body: error.body });
    return { route: 'review', reason: 'decide_unavailable' };
  }

  await saveDecisionRecord(job.id, record, input);

  const route = routeFromRecord(record);
  if (route === 'proceed') {
    await performSideEffect(job, {
      decide_decision_id: record.decision_id,
      decide_record_hash: record.record_hash,
      decide_verify_url: record.verify_url
    });
    return { route, record };
  }

  await sendToReview(job, { route, record });
  return { route, record };
}

module.exports = { handleQueuedAction };
