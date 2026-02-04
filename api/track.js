import { createRateLimiter, getClientIp, addRateLimitHeaders } from "../lib/rate-limit.js";
import { persistLog } from "../lib/log.js";

const rateLimiter = createRateLimiter(300, 60000);

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["POST"] });
  }

  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimiter(clientIp);
  if (!rateLimitResult.allowed) {
    res.setHeader("X-RateLimit-Limit", String(rateLimitResult.limit));
    res.setHeader("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    res.setHeader("X-RateLimit-Reset", String(rateLimitResult.reset));
    res.setHeader("Retry-After", String(rateLimitResult.retryAfter));
    return send(res, 429, { ok: false, error: "RATE_LIMIT_EXCEEDED" });
  }
  addRateLimitHeaders(res, rateLimitResult);

  try {
    const body = await readJson(req);
    const event = typeof body?.event === "string" ? body.event.slice(0, 64) : "";
    if (!event) return send(res, 400, { ok: false, error: "INVALID_EVENT" });

    const props = body?.props && typeof body.props === "object" ? body.props : {};
    const ua = req.headers["user-agent"] || "";
    const referrer = req.headers["referer"] || req.headers["referrer"] || "";

    const data = {
      event_name: event,
      props,
      ip: clientIp,
      ua: String(ua).slice(0, 180),
      referrer: String(referrer).slice(0, 240),
      ts: new Date().toISOString(),
    };

    console.log("[Client Event]", JSON.stringify(data));
    await persistLog("client_event", data);
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 200, { ok: false, error: "TRACK_FAILED", message: String(error?.message || error) });
  }
}

