import rules from "../rules/v1_us_individual.json";

/**
 * Validates input parameters
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateInput({ vendor, days_since_purchase, region, plan }) {
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

  return null; // Valid
}

/**
 * Computes refund eligibility based on vendor rules
 * @param {object} params - {vendor, days_since_purchase, region, plan}
 * @returns {object} Refund eligibility result
 */
export function compute({ vendor, days_since_purchase, region, plan }) {
  // Normalize vendor name to lowercase
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  // Validate input first
  const validationError = validateInput({ vendor, days_since_purchase, region, plan });
  if (validationError) {
    return validationError;
  }

  // Check region support
  if (region !== "US") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    };
  }

  // Check plan support
  if (plan !== "individual") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "NON_INDIVIDUAL_PLAN",
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    };
  }

  // Check vendor support
  const v = rules.vendors?.[vendor];
  if (!v) {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    };
  }

  // Check for vendors with no refund policy
  if (v.window_days === 0) {
    return {
      refundable: false,
      verdict: "DENIED",
      code: "NO_REFUNDS",
      message: `${vendor} does not offer refunds for individual plans`,
      rules_version: rules.rules_version,
      vendor,
      window_days: v.window_days,
    };
  }

  // Check if within refund window
  const allowed = days_since_purchase <= v.window_days;
  return {
    refundable: allowed,
    verdict: allowed ? "ALLOWED" : "DENIED",
    code: allowed ? "WITHIN_WINDOW" : "OUTSIDE_WINDOW",
    message: allowed
      ? `Refund is allowed. Purchase is ${days_since_purchase} day(s) old, within ${v.window_days} day window.`
      : `Refund window expired. Purchase is ${days_since_purchase} day(s) old, exceeds ${v.window_days} day window.`,
    rules_version: rules.rules_version,
    vendor,
    window_days: v.window_days,
    days_since_purchase,
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
