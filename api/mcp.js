import { compute, getSupportedVendors } from "../lib/refund-compute.js";

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

// --- Minimal MCP (JSON-RPC 2.0 over HTTP POST) ---
const SERVER_PROTOCOLS = ["2025-11-25", "2024-11-05"];

// Dynamic vendor list
const supportedVendors = getSupportedVendors();
const vendorList = supportedVendors.join(", ");

const TOOL = {
  name: "refund_eligibility",
  description:
    `Deterministic refund eligibility notary for US consumer subscriptions. Returns ALLOWED / DENIED / UNKNOWN. Supported vendors: ${vendorList}. US region and individual plans only.`,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        description: `Vendor identifier (lowercase, underscore-separated). Supported: ${vendorList}`
      },
      days_since_purchase: {
        type: "number",
        description: "Number of days since the subscription was purchased. Must be a non-negative number.",
        minimum: 0
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
  // CORS headers for browser clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    // MCP is POST for requests (SSE is optional; we're doing simplest viable)
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

    if (!method) return send(res, 200, err(id, -32600, "Invalid Request", { message: "method field is required" }));

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
      if (name !== TOOL.name) {
        return send(res, 200, err(id, -32602, "Invalid params", { message: `Unknown tool: ${name}` }));
      }

      const payload = compute(args);

      // Format a human-readable message for text content
      const textMessage = `Refund Eligibility: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\n${payload.message || ""}`;

      return send(
        res,
        200,
        ok(id, {
          content: [
            { type: "text", text: textMessage }
          ],
          isError: payload.verdict === "UNKNOWN" && payload.code !== "NON_US_REGION" && payload.code !== "NON_INDIVIDUAL_PLAN",
        })
      );
    }

    // default
    return send(res, 200, err(id, -32601, "Method not found", { method }));
  } catch (e) {
    return send(res, 200, err(null, -32603, "Internal error", { message: String(e?.message || e) }));
  }
}
