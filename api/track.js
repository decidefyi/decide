import { createRateLimiter, getClientIp, addRateLimitHeaders } from "../lib/rate-limit.js";
import { persistLog } from "../lib/log.js";
import { recordClientEvent } from "../lib/metrics-store.js";

const rateLimiter = createRateLimiter(300, 60000);
const DEFAULT_ALLOWED_HOSTS = new Set([
  "decide.fyi",
  "www.decide.fyi",
  "refund.decide.fyi",
  "cancel.decide.fyi",
  "return.decide.fyi",
  "trial.decide.fyi",
  "localhost",
  "127.0.0.1",
]);

const KNOWN_EVENTS = new Set([
  "playground_run",
  "trust_suite_run",
  "signin_click",
  "nav_connect_click",
  "nav_playground_click",
  "nav_pricing_click",
  "install_badge_click",
  "demo_mode_entered",
  "demo_flow_run",
  "pricing_starter_cta",
  "pricing_pro_cta",
  "pricing_enterprise_cta",
  "smoke_event",
]);

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

function getAllowedOriginsFromEnv() {
  const raw = String(process.env.TRACK_ALLOWED_ORIGINS || "").trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function parseOrigin(rawOrigin) {
  if (!rawOrigin) return null;
  try {
    return new URL(String(rawOrigin));
  } catch {
    return null;
  }
}

function isAllowedOrigin(rawOrigin) {
  const parsed = parseOrigin(rawOrigin);
  if (!parsed) return false;

  const envOrigins = getAllowedOriginsFromEnv();
  if (envOrigins) return envOrigins.has(parsed.origin);

  const host = parsed.hostname.toLowerCase();
  if (DEFAULT_ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

function isAllowedEvent(event) {
  if (KNOWN_EVENTS.has(event)) return true;
  if (/^(pricing|nav|demo)_[a-z0-9_]+$/.test(event)) return true;
  return false;
}

function sanitizeProps(rawProps) {
  if (!rawProps || typeof rawProps !== "object" || Array.isArray(rawProps)) return {};
  const entries = Object.entries(rawProps).slice(0, 20);
  const output = {};
  for (const [key, value] of entries) {
    const safeKey = String(key || "").slice(0, 48);
    if (!safeKey) continue;
    if (value == null) {
      output[safeKey] = value;
      continue;
    }
    if (typeof value === "string") {
      output[safeKey] = value.slice(0, 240);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      output[safeKey] = value;
      continue;
    }
    output[safeKey] = JSON.stringify(value).slice(0, 240);
  }
  return output;
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  const allowOrigin = isAllowedOrigin(origin) ? origin : "https://decide.fyi";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

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
    if (origin && !isAllowedOrigin(origin)) {
      return send(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
    }

    const body = await readJson(req);
    const event = typeof body?.event === "string" ? body.event.slice(0, 64) : "";
    if (!event) return send(res, 400, { ok: false, error: "INVALID_EVENT" });
    if (!isAllowedEvent(event)) return send(res, 400, { ok: false, error: "EVENT_NOT_ALLOWED" });

    const props = sanitizeProps(body?.props);
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
    recordClientEvent(event, Date.now());
    await persistLog("client_event", data);
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 200, { ok: false, error: "TRACK_FAILED", message: String(error?.message || error) });
  }
}
