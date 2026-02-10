import cancelPenaltyHandler from "../../policies/cancel-penalty.js";
import { createZendeskWorkflowHandler } from "./workflow-common.js";

function buildAction({ decisionClass, policy }) {
  if (decisionClass === "tie") {
    return { type: "escalate_policy_owner", reason: "Classifier returned tie; manual policy owner review required." };
  }

  if (decisionClass === "no") {
    return { type: "retain_subscription", reason: "Classifier returned no; do not proceed with automated cancellation." };
  }

  if (!policy) {
    return { type: "escalate_policy_owner", reason: "Policy service unavailable; manual review required." };
  }

  if (policy.verdict === "FREE_CANCEL") {
    return { type: "approve_cancel", reason: "Policy verdict FREE_CANCEL; cancellation can proceed without penalty." };
  }

  if (policy.verdict === "PENALTY") {
    return { type: "escalate_with_penalty_disclosure", reason: "Policy verdict PENALTY; disclose fee and route for confirmation." };
  }

  if (policy.verdict === "LOCKED") {
    return { type: "deny_cancel", reason: "Policy verdict LOCKED; account is not yet eligible for cancellation." };
  }

  return { type: "escalate_policy_owner", reason: "Policy verdict UNKNOWN; manual review required." };
}

export default createZendeskWorkflowHandler({
  workflowType: "cancel",
  workflowVersion: "zendesk_cancel_v1",
  logEventName: "workflow_zendesk_cancel",
  policyHandler: cancelPenaltyHandler,
  policyEndpoint: "/api/v1/cancel/penalty",
  policyFailureCode: "CANCEL_POLICY_CHECK_FAILED",
  policyFailureMessage: "Unable to evaluate cancellation policy",
  defaultQuestion: (vendor) => `Should this ${vendor} cancellation request proceed under policy?`,
  buildPolicyBody: ({ vendor, region, plan }) => ({
    vendor,
    region,
    plan,
  }),
  buildAction,
});
