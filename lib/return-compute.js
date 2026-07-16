import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSourceHash, withLineage } from "./lineage.js";
import { evaluateReturnPolicyRulebook } from "./return-rulebook.js";
import { resolveQualifyingConditionContext } from "./policy-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_return.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "return-policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const CONDITION_RETURN_OVERRIDES = new Map([
  ["deezer", { return_window_days: 14, return_type: "full_refund", method: "contact_support" }],
  ["midjourney", { return_window_days: 0, return_type: "full_refund", method: "contact_support" }],
]);
const CONDITION_ONLY_VENDORS = new Set(["midjourney"]);
const SOURCE_HASH = buildSourceHash({
  policy: "return",
  policy_version: POLICY_VERSION,
  vendors: rules.vendors || {},
  source_last_checked: policySources.last_checked || "",
  source_last_verified_utc: policySources.last_verified_utc || "",
});

function withSource(result, vendor) {
  const source = vendor ? policySources.vendors?.[vendor] : null;
  return withLineage({
    ...result,
    policy_source_url: source?.url || null,
    policy_source_notes: source?.notes || null,
    policy_last_checked: policySources.last_checked || null,
    policy_last_verified_utc: policySources.last_verified_utc || null,
  }, { policyVersion: POLICY_VERSION, sourceHash: SOURCE_HASH });
}

function withRulebook(result, vendor, rulebookResult) {
  return withSource({
    ...result,
    rulebook_result: rulebookResult,
  }, vendor);
}

/**
 * Validates input parameters
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateInput({ vendor, days_since_purchase, region, plan, qualifying_conditions_met }) {
  if (typeof vendor !== "string" || !vendor.trim()) {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "MISSING_VENDOR",
      message: "vendor is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof days_since_purchase !== "number") {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isFinite(days_since_purchase) || days_since_purchase < 0) {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a non-negative finite number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isInteger(days_since_purchase)) {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be an integer (whole number)",
      rules_version: rules.rules_version,
    };
  }

  if (typeof region !== "string" || !region.trim()) {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "MISSING_REGION",
      message: "region is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof plan !== "string" || !plan.trim()) {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "MISSING_PLAN",
      message: "plan is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (qualifying_conditions_met !== undefined && typeof qualifying_conditions_met !== "boolean") {
    return {
      returnable: null,
      verdict: "UNKNOWN",
      code: "INVALID_QUALIFYING_CONDITIONS",
      message: "qualifying_conditions_met must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  return null;
}

/**
 * Computes return eligibility based on vendor rules
 * @param {object} params - {vendor, days_since_purchase, region, plan}
 * @returns {object} Return eligibility result
 */
export function compute(
  { vendor, days_since_purchase, region, plan, qualifying_conditions_met },
  { requireCompleteContext = false } = {}
) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  const validationError = validateInput({
    vendor,
    days_since_purchase,
    region,
    plan,
    qualifying_conditions_met,
  });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  const v = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const { hasConditionalPolicy, contextComplete, conditionsSatisfied } =
    resolveQualifyingConditionContext({
      vendor,
      qualifyingConditionsMet: qualifying_conditions_met,
      requireCompleteContext,
    });
  const conditionsAllowReturn = conditionsSatisfied;
  const override = qualifying_conditions_met === true ? CONDITION_RETURN_OVERRIDES.get(vendor) : null;
  const returnWindowDays = Number.isInteger(override?.return_window_days)
    ? override.return_window_days
    : (Number.isInteger(v?.return_window_days) ? v.return_window_days : -1);
  const returnType = typeof override?.return_type === "string"
    ? override.return_type
    : (typeof v?.return_type === "string" ? v.return_type : "");
  const returnMethod = typeof override?.method === "string"
    ? override.method
    : (typeof v?.method === "string" ? v.method : "");
  const conditionOnlyEligibility = CONDITION_ONLY_VENDORS.has(vendor) && conditionsAllowReturn;
  const returnSupported = Boolean(
    v && conditionsAllowReturn && returnType !== "none" && (returnWindowDays > 0 || conditionOnlyEligibility)
  );
  const rulebookResult = evaluateReturnPolicyRulebook({
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(v),
    context_complete: contextComplete,
    missing_context: contextComplete ? "" : "qualifying_conditions_met",
    qualifying_conditions_met: qualifying_conditions_met === true,
    return_supported: returnSupported,
    within_window: Boolean(
      returnSupported && (conditionOnlyEligibility || days_since_purchase <= returnWindowDays)
    ),
    days_since_purchase,
    return_window_days: returnWindowDays,
    return_type: returnType,
    method: returnMethod,
    conditions: typeof v?.conditions === "string" ? v.conditions : "",
    vendor,
    region,
    plan,
    policy_rules_version: POLICY_VERSION,
    policy_source_url: policySource?.url || "",
    policy_source_notes: policySource?.notes || "",
  });

  if (rulebookResult.reason_code === "NON_US_REGION") {
    return withRulebook({
      returnable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NON_INDIVIDUAL_PLAN") {
    return withRulebook({
      returnable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "UNSUPPORTED_VENDOR") {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withRulebook({
      returnable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "MISSING_REQUIRED_CONTEXT") {
    return withRulebook({
      returnable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `${vendor} return eligibility depends on source-specific conditions. Confirm those conditions before acting.`,
      rules_version: rules.rules_version,
      vendor,
      required_context: ["qualifying_conditions_met"],
      qualifying_conditions_met: qualifying_conditions_met ?? null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NO_RETURNS") {
    return withRulebook({
      returnable: false,
      verdict: "NON_RETURNABLE",
      code: rulebookResult.reason_code,
      message: `${vendor} does not accept returns for individual plans. ${v.conditions}`,
      rules_version: rules.rules_version,
      vendor,
      return_window_days: returnWindowDays,
      return_type: returnType,
      method: returnMethod,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.application_verdict === "RETURNABLE") {
    return withRulebook({
      returnable: true,
      verdict: "RETURNABLE",
      code: rulebookResult.reason_code,
      message: conditionOnlyEligibility
        ? `Return is available because the vendor-specific qualifying conditions were confirmed. ${v.conditions}`
        : `Return is available. Purchase is ${days_since_purchase} day(s) old, within ${returnWindowDays}-day window. ${v.conditions}`,
      rules_version: rules.rules_version,
      vendor,
      return_window_days: returnWindowDays,
      return_type: returnType,
      method: returnMethod,
      days_since_purchase,
      qualifying_conditions_met: hasConditionalPolicy ? qualifying_conditions_met : null,
    }, vendor, rulebookResult);
  }

  return withRulebook({
    returnable: false,
    verdict: "EXPIRED",
    code: rulebookResult.reason_code,
    message: `Return window expired. Purchase is ${days_since_purchase} day(s) old, exceeds ${returnWindowDays}-day window.`,
    rules_version: rules.rules_version,
    vendor,
    return_window_days: returnWindowDays,
    return_type: returnType,
    method: returnMethod,
    days_since_purchase,
    qualifying_conditions_met: hasConditionalPolicy ? qualifying_conditions_met : null,
  }, vendor, rulebookResult);
}

/**
 * Returns list of supported vendors
 */
export function getSupportedVendors() {
  return Object.keys(rules.vendors || {}).sort();
}

/**
 * Returns the rules version
 */
export function getRulesVersion() {
  return POLICY_VERSION;
}
