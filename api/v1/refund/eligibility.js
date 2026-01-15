import { compute, getRulesVersion } from "../../../lib/refund-compute.js";

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (payload !== null) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  } else {
    res.end();
  }
}

function rid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// detect whether the caller is probably you
function isProbablyYou(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  return ua.includes("curl") || ua.includes("postman") || ua.includes("insomnia");
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return json(res, 204, null);
  }

  try {
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service: "refund.decide.fyi",
        request_id,
        message: "Use POST with JSON body.",
        endpoint: "/api/v1/refund/eligibility",
        rules_version: getRulesVersion(),
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        request_id,
        error: "METHOD_NOT_ALLOWED",
        allowed: ["GET", "POST"],
      });
    }

    let body;
    try {
      body = await readJson(req);
    } catch (parseError) {
      return json(res, 400, {
        ok: false,
        request_id,
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      });
    }

    const payload = compute(body);

    // 🔍 external usage detector (this is the new part)
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    if (!isProbablyYou(req)) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "external_call_candidate",
          request_id,
          method: req.method,
          path: req.url,
          vendor: body?.vendor ?? null,
          ua,
          ip,
        })
      );
    }

    // normal structured log
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        method: req.method,
        path: req.url,
        vendor: body?.vendor ?? null,
        verdict: payload?.verdict ?? null,
        code: payload?.code ?? null,
        ua,
      })
    );

    return json(res, 200, payload);
  } catch (e) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        error: String(e?.message || e),
        stack: e?.stack,
        ua,
      })
    );
    return json(res, 500, {
      ok: false,
      request_id,
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred while processing your request",
    });
  }
}
