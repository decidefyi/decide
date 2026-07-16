#!/usr/bin/env node
/**
 * Refund Eligibility Notary - CLI Client
 *
 * Check if a subscription purchase is eligible for a refund.
 * Returns: ALLOWED, DENIED, or UNKNOWN
 *
 * USAGE:
 *   node refund-auditor.js <vendor> <days_since_purchase> [conditions_met]
 *
 * EXAMPLES:
 *   node refund-auditor.js adobe 12 true     # Verified conditions + window -> ALLOWED
 *   node refund-auditor.js spotify 1         # Categorical no-refund policy -> DENIED
 *   node refund-auditor.js apple_music 5     # Approval-dependent policy -> UNKNOWN
 *
 * SUPPORTED VENDORS (100):
 *   See https://refund.decide.fyi or README.md for the full list.
 *   Includes: adobe, amazon_prime, apple_app_store, expressvpn,
 *   google_play, microsoft_365, netflix, spotify, and many more.
 *
 * REQUIREMENTS:
 *   Node.js 18+ (for native fetch)
 */

const ENDPOINT = process.env.REFUND_BASE || "https://refund.decide.fyi";

async function checkRefundEligibility(vendor, daysSincePurchase, qualifyingConditionsMet) {
  const response = await fetch(`${ENDPOINT}/api/v1/refund/eligibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendor,
      days_since_purchase: daysSincePurchase,
      region: "US",
      plan: "individual",
      ...(qualifyingConditionsMet === undefined
        ? {}
        : { qualifying_conditions_met: qualifyingConditionsMet })
    })
  });

  return response.json();
}

// Parse CLI arguments
const vendor = process.argv[2];
const days = parseInt(process.argv[3], 10);
const rawConditionsMet = process.argv[4];
const qualifyingConditionsMet = rawConditionsMet === undefined
  ? undefined
  : rawConditionsMet === "true"
    ? true
    : rawConditionsMet === "false"
      ? false
      : null;

// Validate input
if (!vendor || isNaN(days) || qualifyingConditionsMet === null) {
  console.error("Usage: node refund-auditor.js <vendor> <days_since_purchase> [conditions_met]");
  console.error("Example: node refund-auditor.js adobe 12 true");
  console.error("Only pass true after verifying the vendor-specific conditions in the source policy.");
  process.exit(1);
}

// Execute check
checkRefundEligibility(vendor, days, qualifyingConditionsMet)
  .then(result => {
    // Pretty print result
    const icon = result.verdict === "ALLOWED" ? "✅" :
                 result.verdict === "DENIED" ? "❌" : "❓";

    console.log(`\n${icon} ${result.verdict}`);
    console.log(`   ${result.message}`);

    if (result.window_days !== undefined) {
      console.log(`   Window: ${result.window_days} days`);
    }
    if (Array.isArray(result.required_context)) {
      console.log(`   Required context: ${result.required_context.join(", ")}`);
    }
    console.log(`   Rules version: ${result.rules_version}\n`);
  })
  .catch(error => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
