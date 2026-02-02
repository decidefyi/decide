import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_trial.json"), "utf8")
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
 * Computes free trial availability and terms for a vendor
 * @param {object} params - {vendor, region, plan}
 * @returns {object} Trial terms result
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

  if (!v.trial_available) {
    return {
      verdict: "NO_TRIAL",
      code: "TRIAL_NOT_AVAILABLE",
      message: `${vendor} does not offer a free trial. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      trial_available: false,
      trial_days: 0,
      card_required: v.card_required,
      auto_converts: v.auto_converts,
    };
  }

  return {
    verdict: "TRIAL_AVAILABLE",
    code: v.auto_converts ? "AUTO_CONVERTS" : "NO_AUTO_CONVERT",
    message: `${vendor} offers a ${v.trial_days}-day free trial. ${v.card_required ? "Credit card required." : "No credit card required."} ${v.auto_converts ? "Auto-converts to paid plan." : "Does not auto-convert."} ${v.notes}`,
    rules_version: rules.rules_version,
    vendor,
    trial_available: true,
    trial_days: v.trial_days,
    card_required: v.card_required,
    auto_converts: v.auto_converts,
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
