import rules from "../../../rules/v1_us_individual.json";

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function rid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

async function readJson(req) {
  // Works on Vercel Serverless + Next-style requests
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function compute({ vendor, days_since_purchase, region, plan }) {
  if (region !== "US") {
    return { refundable: null, verdict: "UNKNOWN", code: "NON_US_REGION", rules_version: rules.rules_version };
  }
  if (plan !== "individual") {
    return { refundable: null, verdict: "UNKNOWN", code: "NON_INDIVIDUAL_PLAN", rules_version: rules.rules_version };
  }

  const v = rules.vendors?.[vendor];
  if (!v) {
    return { refundable: null, verdict: "UNKNOWN", code: "UNSUPPORTED_VENDOR", rules_version: rules.rules_version, vendor };
  }

  // Special-cased unknowns
  if (vendor === "amazon_prime") {
    return { refundable: null, verdict: "UNKNOWN", code: "REQUIRES_BENEFITS_CHECK", rules_version: rules.rules_version, vendor, window_days: v.window_days };
  }

  if (v.window_days === 0) {
    return { refundable: false, verdict: "DENIED", code: "NO_REFUNDS", rules_version: rules.rules_version, vendor, window_days: v.window_days };
  }

  const d = Number(days_since_purchase);
  if (!Number.isFinite(d) || d < 0) {
    return { refundable: null, verdict: "UNKNOWN", code: "INVALID_DAYS_SINCE_PURCHASE", rules_version: rules.rules_version, vendor };
  }

  const allowed = d <= v.window_days;
  return {
    refundable: allowed,
    verdict: allowed ? "ALLOWED" : "DENIED",
    code: allowed ? "WITHIN_WINDOW" : "OUTSIDE_WINDOW",
    rules_version: rules.rules_version,
    vendor,
    window_days: v.window_days,
  };
}

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";

  try {
    // Make GET not noisy (helps scanners)
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service: "refund.decide.fyi",
        request_id,
        message: "Use POST with JSON body.",
        endpoint: "/api/v1/refund/eligibility",
        rules_version: rules.rules_version,
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, request_id, error: "METHOD_NOT_ALLOWED", allowed: ["GET", "POST"] });
    }

    const body = await readJson(req);
    const payload = compute(body);

    // lightweight structured log
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      request_id,
      method: req.method,
      path: req.url,
      vendor: body?.vendor ?? null,
      verdict: payload?.verdict ?? null,
      code: payload?.code ?? null,
      ua,
    }));

    return json(res, 200, payload);
  } catch (e) {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      request_id,
      error: String(e?.message || e),
      ua,
    }));
    return json(res, 500, { ok: false, request_id, error: "FUNCTION_INVOCATION_FAILED" });
  }
}
