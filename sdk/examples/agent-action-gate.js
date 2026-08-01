const { createDecideClient } = require('../decide');

function isAllowed(record) {
  return record?.verdict === 'yes' || record?.c === 'yes' || record?.v === 'approved';
}

async function authorizeAgentAction(proposal, {
  decide = createDecideClient({ apiKey: process.env.DECIDE_API_KEY }),
  saveDecisionRecord
} = {}) {
  if (!saveDecisionRecord) {
    throw new Error('authorizeAgentAction requires a saveDecisionRecord callback');
  }

  const input = {
    question: 'Authorize this agent action before execution?',
    mode: 'single',
    context: {
      workflow: 'agent_action_gate',
      source_record_id: proposal.runId,
      requested_action: proposal.action,
      actor: proposal.agentId,
      target_system: proposal.targetSystem,
      target_object_id: proposal.targetObjectId,
      mutation: proposal.mutation,
      risk_level: proposal.riskLevel,
      reason: proposal.reason
    }
  };

  const record = await decide.decide(input, {
    idempotencyKey: `agent:${proposal.agentId}:${proposal.runId}:${proposal.stepId}`,
    responseView: 'full'
  });

  await saveDecisionRecord(proposal.runId, record, input);

  return {
    allowed: isAllowed(record),
    route: isAllowed(record) ? 'execute' : 'review',
    actionBinding: record.action_binding,
    decisionId: record.decision_id,
    verifyUrl: record.verify_url,
    record
  };
}

module.exports = { authorizeAgentAction };
