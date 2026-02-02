import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_cancel.json"), "utf8")
);

/**
 * Validates input parameters
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateInput({ vendor, region, plan }) {
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

  return null;
}

/**
 * Computes cancellation penalty status based on vendor rules
 * @param {object} params - {vendor, region, plan}
 * @returns {object} Cancellation penalty result
 */
export function compute({ vendor, region, plan }) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  const validationError = validateInput({ vendor, region, plan });
  if (validationError) {
    return validationError;
  }

  if (region !== "US") {
    return {
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    };
  }

  if (plan !== "individual") {
    return {
      verdict: "UNKNOWN",
      code: "NON_INDIVIDUAL_PLAN",
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    };
  }

  const v = rules.vendors?.[vendor];
  if (!v) {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return {
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    };
  }

  if (v.policy === "free_cancel") {
    return {
      verdict: "FREE_CANCEL",
      code: "NO_PENALTY",
      message: `${vendor} can be cancelled without penalty. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: v.policy,
      penalty: v.penalty,
      notice_days: v.notice_days,
    };
  }

  if (v.policy === "etf") {
    return {
      verdict: "PENALTY",
      code: "EARLY_TERMINATION_FEE",
      message: `${vendor} charges an early termination fee: ${v.penalty}. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: v.policy,
      penalty: v.penalty,
      notice_days: v.notice_days,
    };
  }

  if (v.policy === "locked") {
    return {
      verdict: "LOCKED",
      code: "CONTRACT_LOCKED",
      message: `${vendor} does not allow mid-contract cancellation. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      policy: v.policy,
      penalty: v.penalty,
      notice_days: v.notice_days,
    };
  }

  // Fallback
  return {
    verdict: "UNKNOWN",
    code: "UNKNOWN_POLICY",
    message: `Unable to determine cancellation policy for ${vendor}.`,
    rules_version: rules.rules_version,
    vendor,
  };
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
