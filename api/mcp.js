import rules from "../rules/v1_us_individual.json";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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

// --- Your existing refund logic (kept deterministic / stateless) ---
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

// --- Minimal MCP (JSON-RPC 2.0 over HTTP POST) ---
const SERVER_PROTOCOLS = ["2025-11-25", "2024-11-05"];

const TOOL = {
  name: "refund_eligibility",
  description:
    "Deterministic refund eligibility notary for US consumer subscriptions. Returns ALLOWED / DENIED / UNKNOWN.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: { type: "string", description: "e.g. adobe, spotify, netflix" },
      days_since_purchase: { type: "number" },
      region: { type: "string", enum: ["US"] },
      plan: { type: "string", enum: ["individual"] },
    },
    required: ["vendor", "days_since_purchase", "region", "plan"],
  },
};

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export default async function handler(req, res) {
  try {
    // MCP is POST for requests (SSE is optional; we’re doing simplest viable)
    if (req.method !== "POST") {
      return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["POST"] });
    }

    // Basic origin guard (optional but good hygiene)
    const origin = req.headers.origin;
    if (origin && origin !== "https://refund.decide.fyi" && origin !== "https://decide.fyi") {
      return send(res, 403, { ok: false, error: "FORBIDDEN_ORIGIN" });
    }

    const msg = await readJson(req);
    const { id = null, method, params } = msg || {};

    if (!method) return send(res, 200, err(id, -32600, "Invalid Request"));

    // initialize
    if (method === "initialize") {
      const requested = params?.protocolVersion;
      const chosen = SERVER_PROTOCOLS.includes(requested) ? requested : SERVER_PROTOCOLS[0];

      return send(
        res,
        200,
        ok(id, {
          protocolVersion: chosen,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "refund.decide.fyi",
            title: "RefundDecide Notary",
            version: "1.0.0",
            description: "Deterministic refund eligibility notary (stateless).",
            websiteUrl: "https://refund.decide.fyi",
          },
          instructions: "Call tools/list, then tools/call with refund_eligibility.",
        })
      );
    }

    // notifications/initialized
    if (method === "notifications/initialized") {
      return send(res, 200, { jsonrpc: "2.0", result: {} });
    }

    // tools/list
    if (method === "tools/list") {
      return send(res, 200, ok(id, { tools: [TOOL] }));
    }

    // tools/call
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name !== TOOL.name) return send(res, 200, err(id, -32602, "Unknown tool", { name }));

      const payload = compute(args);

      return send(
        res,
        200,
        ok(id, {
          content: [
            { type: "text", text: JSON.stringify(payload) }
          ],
          // many clients like structured output; harmless to include
          structuredContent: payload,
          isError: false,
        })
      );
    }

    // default
    return send(res, 200, err(id, -32601, "Method not found", { method }));
  } catch (e) {
    return send(res, 200, err(null, -32603, "Internal error", { message: String(e?.message || e) }));
  }
}
