import { compute, getSupportedVendors } from "../lib/trial-compute.js";
import { createRateLimiter, getClientIp, addRateLimitHeaders } from "../lib/rate-limit.js";
import { persistLog } from "../lib/log.js";

const rateLimiter = createRateLimiter(100, 60000);

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

const SERVER_PROTOCOLS = ["2025-11-25", "2024-11-05"];

const supportedVendors = getSupportedVendors();

const TOOL = {
  name: "trial_terms",
  description:
    "Check free trial availability and terms for a US consumer subscription. Returns TRIAL_AVAILABLE or NO_TRIAL with trial length, card requirement, and auto-conversion status.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        enum: supportedVendors,
        description: "Vendor identifier (lowercase, underscore-separated)."
      },
      region: {
        type: "string",
        enum: ["US"],
        description: "Region code. Currently only 'US' is supported."
      },
      plan: {
        type: "string",
        enum: ["individual"],
        description: "Plan type. Currently only 'individual' plans are supported."
      },
    },
    required: ["vendor", "region", "plan"],
  },
};

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      message: "This is an MCP (Model Context Protocol) endpoint. Use POST for JSON-RPC 2.0 requests.",
      documentation: "https://trial.decide.fyi",
      mcp_version: "2025-11-25",
      method_required: "POST"
    }));
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimiter(clientIp);

  if (!rateLimitResult.allowed) {
    res.setHeader("X-RateLimit-Limit", String(rateLimitResult.limit));
    res.setHeader("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    res.setHeader("X-RateLimit-Reset", String(rateLimitResult.reset));
    res.setHeader("Retry-After", String(rateLimitResult.retryAfter));
    return send(res, 429, err(null, -32000, "Rate limit exceeded", {
      retry_after: rateLimitResult.retryAfter,
      message: `Too many requests. Try again in ${rateLimitResult.retryAfter} seconds.`
    }));
  }

  addRateLimitHeaders(res, rateLimitResult);

  try {
    if (req.method !== "POST") {
      return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["POST"] });
    }

    let msg;
    try {
      msg = await readJson(req);
    } catch (parseError) {
      return send(res, 200, err(null, -32700, "Parse error", { message: "Invalid JSON" }));
    }

    const { id = null, method, params } = msg || {};

    if (method !== 'tools/call') {
      const reqLog = { method, ip: clientIp };
      console.log('[Trial MCP Request]', JSON.stringify(reqLog));
      persistLog('trial_mcp_request', reqLog);
    }

    if (!method) return send(res, 200, err(id, -32600, "Invalid Request", { message: "method field is required" }));

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
            name: "trial.decide.fyi",
            title: "TrialDecide Notary",
            version: "1.2.0",
            description: "Deterministic free trial terms checker (stateless).",
            websiteUrl: "https://trial.decide.fyi",
          },
          instructions: "Call tools/list, then tools/call with trial_terms.",
        })
      );
    }

    if (method === "notifications/initialized") {
      return send(res, 200, { jsonrpc: "2.0", result: {} });
    }

    if (method === "tools/list") {
      return send(res, 200, ok(id, { tools: [TOOL] }));
    }

    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name !== TOOL.name) {
        return send(res, 200, err(id, -32602, "Invalid params", { message: `Unknown tool: ${name}` }));
      }

      const payload = compute(args);

      const textMessage = `Trial Terms: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nTrial Days: ${payload.trial_days ?? "N/A"}\nCard Required: ${payload.card_required ?? "N/A"}\nAuto-Converts: ${payload.auto_converts ?? "N/A"}\n${payload.message || ""}`;

      send(
        res,
        200,
        ok(id, {
          content: [
            { type: "text", text: textMessage }
          ],
          isError: payload.verdict === "UNKNOWN" && payload.code !== "NON_US_REGION" && payload.code !== "NON_INDIVIDUAL_PLAN",
        })
      );

      const fullLog = {
        method,
        ip: clientIp,
        vendor: args.vendor,
        region: args.region,
        plan: args.plan,
        verdict: payload.verdict,
        code: payload.code
      };
      console.log('[Trial MCP Request]', JSON.stringify(fullLog));
      await persistLog('trial_mcp_request', fullLog);
      return;
    }

    return send(res, 200, err(id, -32601, "Method not found", { method }));
  } catch (e) {
    return send(res, 200, err(null, -32603, "Internal error", { message: String(e?.message || e) }));
  }
}
