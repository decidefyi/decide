import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSourceHash, withLineage } from "./lineage.js";
import { evaluateTrialPolicyRulebook } from "./trial-rulebook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_trial.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "trial-policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const VARIABLE_OFFER_VENDORS = new Set([
  "amazon_music_unlimited",
  "apple_arcade",
  "discord_nitro",
  "doordash_dashpass",
  "espn_plus",
  "google_one",
  "hinge",
  "hulu",
  "kindle_unlimited",
  "noom",
  "patreon",
  "ring_protect",
  "siriusxm",
  "sling_tv",
  "soundcloud_go",
  "uber_one",
  "weightwatchers",
  "xbox_game_pass",
  "youtube_tv",
  "fitbit_premium",
  "myfitnesspal_premium",
  "ea_play",
  "ubisoft_plus",
  "nfl_plus",
  "mlb_tv",
  "new_york_times",
  "wall_street_journal",
  "washington_post",
  "snapchat_plus",
  "x_premium",
  "reddit_premium",
  "discovery_plus",
  "starz",
  "britbox",
  "amc_plus",
]);
const SOURCE_HASH = buildSourceHash({
  policy: "trial",
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
export function validateInput({ vendor, region, plan, offer_confirmed, observed_trial_days }) {
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

  if (offer_confirmed !== undefined && typeof offer_confirmed !== "boolean") {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OFFER_CONFIRMATION",
      message: "offer_confirmed must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  if (
    observed_trial_days !== undefined &&
    (!Number.isInteger(observed_trial_days) || observed_trial_days < 0 || observed_trial_days > 365)
  ) {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OBSERVED_TRIAL_DAYS",
      message: "observed_trial_days must be an integer from 0 to 365 when provided",
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
export function compute(
  { vendor, region, plan, offer_confirmed, observed_trial_days },
  { requireCompleteContext = false } = {}
) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  const validationError = validateInput({ vendor, region, plan, offer_confirmed, observed_trial_days });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  const v = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const hasVariableOffer = VARIABLE_OFFER_VENDORS.has(vendor);
  const missingContext = [];
  if (requireCompleteContext && hasVariableOffer && offer_confirmed === undefined) {
    missingContext.push("offer_confirmed", "observed_trial_days");
  } else if (
    requireCompleteContext &&
    hasVariableOffer &&
    offer_confirmed === true &&
    observed_trial_days === undefined
  ) {
    missingContext.push("observed_trial_days");
  }
  const contextComplete = missingContext.length === 0;
  const effectiveTrialAvailable = hasVariableOffer && offer_confirmed !== undefined
    ? offer_confirmed
    : Boolean(v?.trial_available);
  const effectiveTrialDays = hasVariableOffer && offer_confirmed === true
    ? observed_trial_days
    : (effectiveTrialAvailable && Number.isInteger(v?.trial_days) ? v.trial_days : 0);
  const rulebookResult = evaluateTrialPolicyRulebook({
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(v),
    context_complete: contextComplete,
    missing_context: missingContext.join(","),
    offer_confirmed: offer_confirmed === true,
    observed_trial_days: Number.isInteger(observed_trial_days) ? observed_trial_days : 0,
    trial_available: effectiveTrialAvailable,
    auto_converts: Boolean(v?.auto_converts),
    trial_days: Number.isInteger(effectiveTrialDays) ? effectiveTrialDays : 0,
    card_required: Boolean(v?.card_required),
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
      message: `${vendor} trial availability or duration varies by account or promotion. Confirm the live offer before acting.`,
      rules_version: rules.rules_version,
      vendor,
      required_context: missingContext,
      offer_confirmed: offer_confirmed ?? null,
      observed_trial_days: observed_trial_days ?? null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "TRIAL_NOT_AVAILABLE") {
    return withRulebook({
      verdict: "NO_TRIAL",
      code: rulebookResult.reason_code,
      message: `${vendor} does not offer a free trial. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      trial_available: false,
      trial_days: 0,
      card_required: v.card_required,
      auto_converts: v.auto_converts,
    }, vendor, rulebookResult);
  }

  return withRulebook({
    verdict: "TRIAL_AVAILABLE",
    code: rulebookResult.reason_code,
    message: `${vendor} offers a ${effectiveTrialDays}-day free trial. ${v.card_required ? "Credit card required." : "No credit card required."} ${v.auto_converts ? "Auto-converts to paid plan." : "Does not auto-convert."} ${v.notes}`,
    rules_version: rules.rules_version,
    vendor,
    trial_available: true,
    trial_days: effectiveTrialDays,
    card_required: v.card_required,
    auto_converts: v.auto_converts,
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
