import refundEligibilityHandler from "../../policies/refund-eligibility.js";
import { createZendeskWorkflowHandler } from "./workflow-common.js";

function buildAction({ decisionClass, policy }) {
  if (decisionClass === "tie") {
    return { type: "escalate_policy_owner", reason: "Classifier returned tie; manual policy owner review required." };
  }

  if (decisionClass === "no") {
    return { type: "deny_refund", reason: "Classifier returned no; case does not proceed to automated refund execution." };
  }

  if (!policy) {
    return { type: "escalate_policy_owner", reason: "Policy service unavailable; manual review required." };
  }

  if (policy.verdict === "ALLOWED") {
    return { type: "approve_refund", reason: "Policy verdict ALLOWED within vendor rules." };
  }

  if (policy.verdict === "DENIED") {
    return { type: "deny_refund", reason: "Policy verdict DENIED under vendor rules." };
  }

  return { type: "escalate_policy_owner", reason: "Policy verdict UNKNOWN; manual review required." };
}

export default createZendeskWorkflowHandler({
  workflowType: "refund",
  workflowVersion: "zendesk_refund_v1",
  logEventName: "workflow_zendesk_refund",
  policyHandler: refundEligibilityHandler,
  policyEndpoint: "/api/v1/refund/eligibility",
  policyFailureCode: "REFUND_POLICY_CHECK_FAILED",
  policyFailureMessage: "Unable to evaluate refund policy",
  requireDaysSincePurchase: true,
  defaultQuestion: (vendor) => `Should this ${vendor} refund request proceed under policy?`,
  buildPolicyBody: ({ vendor, daysSincePurchase, region, plan }) => ({
    vendor,
    days_since_purchase: daysSincePurchase,
    region,
    plan,
  }),
  buildAction,
  policyTagPrefix: "refund",
  includeWorkflowTypeTag: false,
  includeWorkflowTypeInPrivateNote: false,
});
