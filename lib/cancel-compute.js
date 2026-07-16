import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSourceHash, withLineage } from "./lineage.js";
import { evaluateCancelPolicyRulebook } from "./cancel-rulebook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_cancel.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "cancel-policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const BILLING_CADENCE_REQUIRED_VENDORS = new Set(["adobe", "shutterstock"]);
const SOURCE_HASH = buildSourceHash({
  policy: "cancel",
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
export function validateInput({ vendor, region, plan, billing_cadence }) {
  if (typeof vendor !== "string" || !vendor.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_VENDOR",
      message: "vendor is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof region !== "string" || !region.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_REGION",
      message: "region is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof plan !== "string" || !plan.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_PLAN",
      message: "plan is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (
    billing_cadence !== undefined &&
    billing_cadence !== null &&
    !["monthly", "annual"].includes(billing_cadence)
  ) {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_BILLING_CADENCE",
      message: "billing_cadence must be 'monthly' or 'annual' when provided",
      rules_version: rules.rules_version,
    };
  }

  return null;
}

/**
 * Computes cancellation penalty status based on vendor rules
 * @param {object} params - {vendor, region, plan}
 * @returns {object} Cancellation penalty result
 */
export function compute({ vendor, region, plan, billing_cadence }, { requireCompleteContext = false } = {}) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;
  billing_cadence = typeof billing_cadence === "string"
    ? billing_cadence.toLowerCase().trim()
    : billing_cadence;

  const validationError = validateInput({ vendor, region, plan, billing_cadence });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  const v = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const requiresBillingCadence = BILLING_CADENCE_REQUIRED_VENDORS.has(vendor);
  const contextComplete = !requireCompleteContext || !requiresBillingCadence || Boolean(billing_cadence);
  const effectivePolicy = requiresBillingCadence && billing_cadence === "monthly"
    ? "free_cancel"
    : (typeof v?.policy === "string" ? v.policy : "");
  const effectivePenalty = requiresBillingCadence && billing_cadence === "monthly"
    ? "none"
    : (typeof v?.penalty === "string" ? v.penalty : "");
  const rulebookResult = evaluateCancelPolicyRulebook({
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(v),
    context_complete: contextComplete,
    missing_context: contextComplete ? "" : "billing_cadence",
    billing_cadence: billing_cadence || "",
    policy: effectivePolicy,
    notice_days: Number.isInteger(v?.notice_days) ? v.notice_days : 0,
    penalty: effectivePenalty,
    vendor,
    region,
    plan,
    policy_rules_version: POLICY_VERSION,
    policy_source_url: policySource?.url || "",
    policy_source_notes: policySource?.notes || "",
  });

  if (rulebookResult.reason_code === "NON_US_REGION") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NON_INDIVIDUAL_PLAN") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "UNSUPPORTED_VENDOR") {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withRulebook({
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
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `${vendor} has different monthly and annual cancellation terms. Provide billing_cadence before acting.`,
      rules_version: rules.rules_version,
      vendor,
      billing_cadence: billing_cadence || null,
      required_context: ["billing_cadence"],
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NO_PENALTY") {
    return withRulebook({
      verdict: "FREE_CANCEL",
      code: rulebookResult.reason_code,
      message: `${vendor} can be cancelled without penalty. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: effectivePolicy,
      penalty: effectivePenalty,
      notice_days: v.notice_days,
      billing_cadence: billing_cadence || null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "EARLY_TERMINATION_FEE") {
    return withRulebook({
      verdict: "PENALTY",
      code: rulebookResult.reason_code,
      message: `${vendor} charges an early termination fee: ${v.penalty}. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: effectivePolicy,
      penalty: effectivePenalty,
      notice_days: v.notice_days,
      billing_cadence: billing_cadence || null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "CONTRACT_LOCKED") {
    return withRulebook({
      verdict: "LOCKED",
      code: rulebookResult.reason_code,
      message: `${vendor} does not allow mid-contract cancellation. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: effectivePolicy,
      penalty: effectivePenalty,
      notice_days: v.notice_days,
      billing_cadence: billing_cadence || null,
    }, vendor, rulebookResult);
  }

  // Fallback
  return withRulebook({
    verdict: "UNKNOWN",
    code: rulebookResult.reason_code,
    message: `Unable to determine cancellation policy for ${vendor}.`,
    rules_version: rules.rules_version,
    vendor,
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
