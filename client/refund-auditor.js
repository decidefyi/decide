// client/refund-auditor.js
// Usage: node refund-auditor.js adobe 12
// Env optional: REFUND_BASE=https://refund.decide.fyi

const base = process.env.REFUND_BASE || "https://refund.decide.fyi";

const vendor = process.argv[2] || "adobe";
const days_since_purchase = Number(process.argv[3] || 12);

async function main() {
  const body = {
    vendor,
    days_since_purchase,
    region: "US",
    plan: "individual",
  };

  const res = await fetch(`${base}/api/v1/refund/eligibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("status:", res.status);
  console.log(text);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});
