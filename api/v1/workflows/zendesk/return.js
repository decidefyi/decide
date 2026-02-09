import returnEligibilityHandler from "../../return/eligibility.js";
import { createZendeskWorkflowHandler } from "./_workflow-common.js";

function buildAction({ decisionClass, policy }) {
  if (decisionClass === "tie") {
    return { type: "escalate_policy_owner", reason: "Classifier returned tie; manual policy owner review required." };
  }

  if (decisionClass === "no") {
    return { type: "deny_return", reason: "Classifier returned no; do not proceed with automated return handling." };
  }

  if (!policy) {
    return { type: "escalate_policy_owner", reason: "Policy service unavailable; manual review required." };
  }

  if (policy.verdict === "RETURNABLE") {
    return { type: "approve_return", reason: "Policy verdict RETURNABLE; return can proceed under vendor rules." };
  }

  if (policy.verdict === "EXPIRED" || policy.verdict === "NON_RETURNABLE") {
    return { type: "deny_return", reason: `Policy verdict ${policy.verdict}; return does not qualify.` };
  }

  return { type: "escalate_policy_owner", reason: "Policy verdict UNKNOWN; manual review required." };
}

export default createZendeskWorkflowHandler({
  workflowType: "return",
  workflowVersion: "zendesk_return_v1",
  logEventName: "workflow_zendesk_return",
  policyHandler: returnEligibilityHandler,
  policyEndpoint: "/api/v1/return/eligibility",
  policyFailureCode: "RETURN_POLICY_CHECK_FAILED",
  policyFailureMessage: "Unable to evaluate return policy",
  requireDaysSincePurchase: true,
  defaultQuestion: (vendor) => `Should this ${vendor} return request proceed under policy?`,
  buildPolicyBody: ({ vendor, daysSincePurchase, region, plan }) => ({
    vendor,
    days_since_purchase: daysSincePurchase,
    region,
    plan,
  }),
  buildAction,
});
