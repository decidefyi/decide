import rules from "../../../rules/v1_us_individual.json" assert { type: "json" };

function respond(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function unknown(res, code, extra = {}) {
  return respond(res, 200, {
    refundable: null,
    verdict: "UNKNOWN",
    code,
    rules_version: rules.rules_version,
    ...extra
  });
}

export default function handler(req, res) {
  // Only POST
  if (req.method !== "POST") {
    return respond(res, 405, {
      refundable: null,
      verdict: "UNKNOWN",
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST",
      rules_version: rules.rules_version
    });
  }

  const { vendor, days_since_purchase, region, plan } = req.body || {};

  // Strict input validation
  if (!vendor || typeof vendor !== "string") {
    return respond(res, 400, {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_VENDOR",
      message: "vendor must be a string",
      rules_version: rules.rules_version
    });
  }

  if (
    typeof days_since_purchase !== "number" ||
    !Number.isFinite(days_since_purchase) ||
    days_since_purchase < 0
  ) {
    return respond(res, 400, {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS",
      message: "days_since_purchase must be a non-negative number",
      rules_version: rules.rules_version
    });
  }

  if (region !== "US") return unknown(res, "UNSUPPORTED_REGION", { vendor });
  if (plan !== "individual") return unknown(res, "UNSUPPORTED_PLAN", { vendor });

  const v = rules.vendors[vendor];
  if (!v) return unknown(res, "UNKNOWN_VENDOR", { vendor });

  if (v.mode === "requires_usage_verification") {
    return unknown(res, "REQUIRES_USAGE_VERIFICATION", { vendor });
  }

  if (v.window_days === 0 || v.mode === "no_refunds") {
    return respond(res, 200, {
      refundable: false,
      verdict: "DENIED",
      code: "NO_REFUNDS",
      rules_version: rules.rules_version,
      vendor
    });
  }

  const ok = days_since_purchase <= v.window_days;

  return respond(res, 200, {
    refundable: ok,
    verdict: ok ? "ALLOWED" : "DENIED",
    code: ok ? "WITHIN_WINDOW" : "OUT_OF_WINDOW",
    rules_version: rules.rules_version,
    vendor,
    window_days: v.window_days
  });
}
