#!/usr/bin/env node
/**
 * Refund Eligibility Notary - CLI Client
 *
 * Check if a subscription purchase is eligible for a refund.
 * Returns: ALLOWED, DENIED, or UNKNOWN
 *
 * USAGE:
 *   node refund-auditor.js <vendor> <days_since_purchase>
 *
 * EXAMPLES:
 *   node refund-auditor.js adobe 12          # Within 14-day window -> ALLOWED
 *   node refund-auditor.js spotify 1         # No refunds -> DENIED
 *   node refund-auditor.js microsoft_365 25  # Within 30-day window -> ALLOWED
 *   node refund-auditor.js notion 5          # Outside 3-day window -> DENIED
 *
 * SUPPORTED VENDORS:
 *   adobe, spotify, apple_app_store, google_play, microsoft_365,
 *   netflix, canva, dropbox_us, notion
 *
 * REQUIREMENTS:
 *   Node.js 18+ (for native fetch)
 */

const ENDPOINT = process.env.REFUND_BASE || "https://refund.decide.fyi";

async function checkRefundEligibility(vendor, daysSincePurchase) {
  const response = await fetch(`${ENDPOINT}/api/v1/refund/eligibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendor,
      days_since_purchase: daysSincePurchase,
      region: "US",
      plan: "individual"
    })
  });

  return response.json();
}

// Parse CLI arguments
const vendor = process.argv[2];
const days = parseInt(process.argv[3], 10);

// Validate input
if (!vendor || isNaN(days)) {
  console.error("❌ Usage: node refund-auditor.js <vendor> <days_since_purchase>");
  console.error("   Example: node refund-auditor.js adobe 12");
  process.exit(1);
}

// Execute check
checkRefundEligibility(vendor, days)
  .then(result => {
    // Pretty print result
    const icon = result.verdict === "ALLOWED" ? "✅" :
                 result.verdict === "DENIED" ? "❌" : "❓";

    console.log(`\n${icon} ${result.verdict}`);
    console.log(`   ${result.message}`);

    if (result.window_days !== undefined) {
      console.log(`   Window: ${result.window_days} days`);
    }
    console.log(`   Rules version: ${result.rules_version}\n`);
  })
  .catch(error => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
