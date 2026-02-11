import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_return.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "return-policy-sources.json"), "utf8")
);

function withSource(result, vendor) {
  const source = vendor ? policySources.vendors?.[vendor] : null;
  return {
    ...result,
    policy_source_url: source?.url || null,
    policy_source_notes: source?.notes || null,
    policy_last_checked: policySources.last_checked || null,
    policy_last_verified_utc: policySources.last_verified_utc || null,
  };
}

/**
 * Validates input parameters
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateInput({ vendor, days_since_purchase, region, plan }) {
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

  return null;
}

/**
 * Computes return eligibility based on vendor rules
 * @param {object} params - {vendor, days_since_purchase, region, plan}
 * @returns {object} Return eligibility result
 */
export function compute({ vendor, days_since_purchase, region, plan }) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  const validationError = validateInput({ vendor, days_since_purchase, region, plan });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  if (region !== "US") {
    return withSource({
      returnable: null,
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor);
  }

  if (plan !== "individual") {
    return withSource({
      returnable: null,
      verdict: "UNKNOWN",
      code: "NON_INDIVIDUAL_PLAN",
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor);
  }

  const v = rules.vendors?.[vendor];
  if (!v) {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withSource({
      returnable: null,
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    }, vendor);
  }

  // Vendor does not accept returns
  if (v.return_window_days === 0 || v.return_type === "none") {
    return withSource({
      returnable: false,
      verdict: "NON_RETURNABLE",
      code: "NO_RETURNS",
      message: `${vendor} does not accept returns for individual plans. ${v.conditions}`,
      rules_version: rules.rules_version,
      vendor,
      return_window_days: v.return_window_days,
      return_type: v.return_type,
      method: v.method,
    }, vendor);
  }

  // Check if within return window
  const withinWindow = days_since_purchase <= v.return_window_days;

  if (withinWindow) {
    return withSource({
      returnable: true,
      verdict: "RETURNABLE",
      code: v.return_type === "prorated" ? "PRORATED_RETURN" : v.return_type === "credit" ? "CREDIT_RETURN" : "FULL_RETURN",
      message: `Return is available. Purchase is ${days_since_purchase} day(s) old, within ${v.return_window_days}-day window. ${v.conditions}`,
      rules_version: rules.rules_version,
      vendor,
      return_window_days: v.return_window_days,
      return_type: v.return_type,
      method: v.method,
      days_since_purchase,
    }, vendor);
  }

  return withSource({
    returnable: false,
    verdict: "EXPIRED",
    code: "OUTSIDE_WINDOW",
    message: `Return window expired. Purchase is ${days_since_purchase} day(s) old, exceeds ${v.return_window_days}-day window.`,
    rules_version: rules.rules_version,
    vendor,
    return_window_days: v.return_window_days,
    return_type: v.return_type,
    method: v.method,
    days_since_purchase,
  }, vendor);
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
  return rules.rules_version;
}
