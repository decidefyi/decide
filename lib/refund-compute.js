import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSourceHash, withLineage } from "./lineage.js";
import { evaluateRefundPolicyRulebook } from "./refund-rulebook.js";
import { resolveQualifyingConditionContext } from "./policy-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const CONDITION_WINDOW_OVERRIDES = new Map([
  ["deezer", 14],
]);
const CONDITION_ONLY_VENDORS = new Set(["midjourney"]);
const SOURCE_HASH = buildSourceHash({
  policy: "refund",
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
  // Validate required fields
  if (typeof vendor !== "string" || !vendor.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_VENDOR",
      message: "vendor is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof days_since_purchase !== "number") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isFinite(days_since_purchase) || days_since_purchase < 0) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a non-negative finite number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isInteger(days_since_purchase)) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be an integer (whole number)",
      rules_version: rules.rules_version,
    };
  }

  if (typeof region !== "string" || !region.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_REGION",
      message: "region is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof plan !== "string" || !plan.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_PLAN",
      message: "plan is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (qualifying_conditions_met !== undefined && typeof qualifying_conditions_met !== "boolean") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_QUALIFYING_CONDITIONS",
      message: "qualifying_conditions_met must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  return null; // Valid
}

/**
 * Computes refund eligibility based on vendor rules
 * @param {object} params - {vendor, days_since_purchase, region, plan}
 * @returns {object} Refund eligibility result
 */
export function compute(
  { vendor, days_since_purchase, region, plan, qualifying_conditions_met },
  { requireCompleteContext = false } = {}
) {
  // Normalize vendor name to lowercase
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  // Validate input first
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

  const vendorRule = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const { hasConditionalPolicy, contextComplete, conditionsSatisfied } =
    resolveQualifyingConditionContext({
      vendor,
      qualifyingConditionsMet: qualifying_conditions_met,
      requireCompleteContext,
    });
  const baseWindowDays = Number.isInteger(vendorRule?.window_days) ? vendorRule.window_days : -1;
  const windowDays = qualifying_conditions_met === true && CONDITION_WINDOW_OVERRIDES.has(vendor)
    ? CONDITION_WINDOW_OVERRIDES.get(vendor)
    : baseWindowDays;
  const conditionsAllowRefund = conditionsSatisfied;
  const conditionOnlyEligibility = CONDITION_ONLY_VENDORS.has(vendor) && conditionsAllowRefund;
  const refundsSupported = Boolean(
    vendorRule && conditionsAllowRefund && (windowDays > 0 || conditionOnlyEligibility)
  );
  const withinWindow = Boolean(
    refundsSupported && (conditionOnlyEligibility || days_since_purchase <= windowDays)
  );
  const rulebookResult = evaluateRefundPolicyRulebook({
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(vendorRule),
    context_complete: contextComplete,
    missing_context: contextComplete ? "" : "qualifying_conditions_met",
    qualifying_conditions_met: qualifying_conditions_met === true,
    refunds_supported: refundsSupported,
    within_window: withinWindow,
    days_since_purchase,
    window_days: windowDays,
    vendor,
    region,
    plan,
    policy_rules_version: POLICY_VERSION,
    policy_source_url: policySource?.url || "",
    policy_source_notes: policySource?.notes || "",
  });

  if (rulebookResult.reason_code === "NON_US_REGION") {
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NON_INDIVIDUAL_PLAN") {
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "UNSUPPORTED_VENDOR") {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "MISSING_REQUIRED_CONTEXT") {
    return withRulebook({
      refundable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `${vendor} refund eligibility depends on source-specific conditions. Confirm those conditions before acting.`,
      rules_version: rules.rules_version,
      vendor,
      required_context: ["qualifying_conditions_met"],
      qualifying_conditions_met: qualifying_conditions_met ?? null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NO_REFUNDS") {
    return withRulebook({
      refundable: false,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `${vendor} does not offer refunds for individual plans`,
      rules_version: rules.rules_version,
      vendor,
      window_days: windowDays,
    }, vendor, rulebookResult);
  }

  const allowed = rulebookResult.application_verdict === "ALLOWED";
  return withRulebook({
    refundable: allowed,
    verdict: rulebookResult.application_verdict,
    code: rulebookResult.reason_code,
    message: allowed
      ? (conditionOnlyEligibility
          ? `Refund is allowed because the vendor-specific qualifying conditions were confirmed.`
          : `Refund is allowed. Purchase is ${days_since_purchase} day(s) old, within ${windowDays} day window.`)
      : `Refund window expired. Purchase is ${days_since_purchase} day(s) old, exceeds ${windowDays} day window.`,
    rules_version: rules.rules_version,
    vendor,
    window_days: windowDays,
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
