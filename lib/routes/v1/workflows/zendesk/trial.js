import trialTermsHandler from "../../policies/trial-terms.js";
import { createZendeskWorkflowHandler } from "./workflow-common.js";

function buildAction({ decisionClass, policy }) {
  if (decisionClass === "tie") {
    return { type: "escalate_policy_owner", reason: "Classifier returned tie; manual policy owner review required." };
  }

  if (decisionClass === "no") {
    return { type: "deny_trial", reason: "Classifier returned no; do not proceed with automated trial handling." };
  }

  if (!policy) {
    return { type: "escalate_policy_owner", reason: "Policy service unavailable; manual review required." };
  }

  if (policy.verdict === "TRIAL_AVAILABLE") {
    return { type: "approve_trial", reason: "Policy verdict TRIAL_AVAILABLE; trial setup can proceed." };
  }

  if (policy.verdict === "NO_TRIAL") {
    return { type: "deny_trial", reason: "Policy verdict NO_TRIAL; vendor does not offer an eligible trial." };
  }

  return { type: "escalate_policy_owner", reason: "Policy verdict UNKNOWN; manual review required." };
}

export default createZendeskWorkflowHandler({
  workflowType: "trial",
  workflowVersion: "zendesk_trial_v1",
  logEventName: "workflow_zendesk_trial",
  policyHandler: trialTermsHandler,
  policyEndpoint: "/api/v1/trial/terms",
  policyFailureCode: "TRIAL_POLICY_CHECK_FAILED",
  policyFailureMessage: "Unable to evaluate trial policy",
  defaultQuestion: (vendor) => `Should this ${vendor} trial request proceed under policy?`,
  buildPolicyBody: ({ vendor, region, plan, input }) => ({
    vendor,
    region,
    plan,
    ...(typeof input.offer_confirmed === "boolean" ? { offer_confirmed: input.offer_confirmed } : {}),
    ...(Number.isInteger(input.observed_trial_days)
      ? { observed_trial_days: input.observed_trial_days }
      : {}),
    ...(typeof input.observed_card_required === "boolean"
      ? { observed_card_required: input.observed_card_required }
      : {}),
    ...(typeof input.observed_auto_converts === "boolean"
      ? { observed_auto_converts: input.observed_auto_converts }
      : {}),
  }),
  buildAction,
});
