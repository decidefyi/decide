import { createRateLimiter, getClientIp, addRateLimitHeaders } from "./rate-limit.js";
import { persistLog } from "./log.js";

const SERVER_PROTOCOLS = ["2025-11-25", "2024-11-05"];

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

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function err(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function defaultIsError(payload) {
  return payload?.verdict === "UNKNOWN" && payload?.code !== "NON_US_REGION" && payload?.code !== "NON_INDIVIDUAL_PLAN";
}

export function createMcpHandler(config) {
  const {
    compute,
    tool,
    documentationUrl,
    serverInfo,
    instructions,
    logPrefix = "MCP Request",
    logEventName = "mcp_request",
    formatTextMessage,
    buildCallLog,
    rateLimitRequests = 100,
    rateLimitWindowMs = 60000,
  } = config;

  const rateLimiter = createRateLimiter(rateLimitRequests, rateLimitWindowMs);

  return async function mcpHandler(req, res) {
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
        documentation: documentationUrl,
        mcp_version: SERVER_PROTOCOLS[0],
        method_required: "POST",
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
        message: `Too many requests. Try again in ${rateLimitResult.retryAfter} seconds.`,
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
      } catch {
        return send(res, 200, err(null, -32700, "Parse error", { message: "Invalid JSON" }));
      }

      const { id = null, method, params } = msg || {};

      if (method !== "tools/call") {
        const reqLog = { method, ip: clientIp };
        console.log(`[${logPrefix}]`, JSON.stringify(reqLog));
        persistLog(logEventName, reqLog);
      }

      if (!method) {
        return send(res, 200, err(id, -32600, "Invalid Request", { message: "method field is required" }));
      }

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
            serverInfo,
            instructions,
          })
        );
      }

      if (method === "notifications/initialized") {
        return send(res, 200, { jsonrpc: "2.0", result: {} });
      }

      if (method === "tools/list") {
        return send(res, 200, ok(id, { tools: [tool] }));
      }

      if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        if (name !== tool.name) {
          return send(res, 200, err(id, -32602, "Invalid params", { message: `Unknown tool: ${name}` }));
        }

        const payload = compute(args);
        const textMessage = formatTextMessage(payload, args);

        send(
          res,
          200,
          ok(id, {
            content: [{ type: "text", text: textMessage }],
            isError: defaultIsError(payload),
          })
        );

        const fullLog = buildCallLog
          ? buildCallLog({ method, clientIp, args, payload })
          : {
              method,
              ip: clientIp,
              ...args,
              verdict: payload?.verdict,
              code: payload?.code,
            };

        console.log(`[${logPrefix}]`, JSON.stringify(fullLog));
        await persistLog(logEventName, fullLog);
        return;
      }

      return send(res, 200, err(id, -32601, "Method not found", { method }));
    } catch (error) {
      return send(res, 200, err(null, -32603, "Internal error", { message: String(error?.message || error) }));
    }
  };
}
