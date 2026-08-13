import { randomUUID } from "node:crypto";

export const GEMINI_USAGE_HARD_CAPS = Object.freeze({
  daily: 10,
  monthly: 100,
  lifetime: 500,
  concurrency: 1,
});

const BUDGET_PREFIX = "decide:gemini:budget:v1";
const STORE_TIMEOUT_MS = 1000;
const CONCURRENCY_TTL_SECONDS = 30;

const RESERVE_SCRIPT = `
local daily = tonumber(redis.call("GET", KEYS[1]) or "0")
local monthly = tonumber(redis.call("GET", KEYS[2]) or "0")
local lifetime = tonumber(redis.call("GET", KEYS[3]) or "0")

if daily >= tonumber(ARGV[1]) then
  return {0, "daily", daily, monthly, lifetime}
end
if monthly >= tonumber(ARGV[2]) then
  return {0, "monthly", daily, monthly, lifetime}
end
if lifetime >= tonumber(ARGV[3]) then
  return {0, "lifetime", daily, monthly, lifetime}
end
if redis.call("EXISTS", KEYS[4]) == 1 then
  return {0, "concurrency", daily, monthly, lifetime}
end

local locked = redis.call("SET", KEYS[4], ARGV[8], "EX", ARGV[7], "NX")
if not locked then
  return {0, "concurrency", daily, monthly, lifetime}
end

daily = redis.call("INCR", KEYS[1])
monthly = redis.call("INCR", KEYS[2])
lifetime = redis.call("INCR", KEYS[3])
redis.call("EXPIRE", KEYS[1], ARGV[5])
redis.call("EXPIRE", KEYS[2], ARGV[6])

return {1, "allowed", daily, monthly, lifetime}
`;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function asLowerOnlyCap(value, hardCap) {
  if (value === undefined || value === null || String(value).trim() === "") return hardCap;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return hardCap;
  return Math.min(Math.max(parsed, 0), hardCap);
}

function periodKeys(now) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  const dayKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const nextDay = Date.UTC(year, monthIndex, day + 1);
  const nextMonth = Date.UTC(year, monthIndex + 1, 1);
  return {
    dayKey,
    monthKey,
    dayTtlSeconds: Math.max(Math.ceil((nextDay - now) / 1000) + 60, 60),
    monthTtlSeconds: Math.max(Math.ceil((nextMonth - now) / 1000) + 60, 60),
  };
}

function normalizeStoreUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function resolveGeminiUsageBudgetConfig({ env = process.env, now = Date.now() } = {}) {
  const dedicatedUrl = normalizeStoreUrl(env.DECIDE_GEMINI_BUDGET_KV_REST_API_URL);
  const dedicatedToken = String(env.DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN || "").trim();
  const dedicatedConfigured = Boolean(dedicatedUrl || dedicatedToken);
  const url = dedicatedConfigured
    ? dedicatedUrl
    : normalizeStoreUrl(env.DECIDE_KV_REST_API_URL || env.KV_REST_API_URL);
  const token = dedicatedConfigured
    ? dedicatedToken
    : String(env.DECIDE_KV_REST_API_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  const period = periodKeys(now);
  return {
    url,
    token,
    configured: Boolean(url && token),
    dailyCap: asLowerOnlyCap(env.DECIDE_GEMINI_DAILY_CALL_CAP, GEMINI_USAGE_HARD_CAPS.daily),
    monthlyCap: asLowerOnlyCap(env.DECIDE_GEMINI_MONTHLY_CALL_CAP, GEMINI_USAGE_HARD_CAPS.monthly),
    lifetimeCap: asLowerOnlyCap(env.DECIDE_GEMINI_LIFETIME_CALL_CAP, GEMINI_USAGE_HARD_CAPS.lifetime),
    concurrencyCap: GEMINI_USAGE_HARD_CAPS.concurrency,
    dayTtlSeconds: period.dayTtlSeconds,
    monthTtlSeconds: period.monthTtlSeconds,
    concurrencyTtlSeconds: CONCURRENCY_TTL_SECONDS,
    keys: {
      daily: `${BUDGET_PREFIX}:day:${period.dayKey}`,
      monthly: `${BUDGET_PREFIX}:month:${period.monthKey}`,
      lifetime: `${BUDGET_PREFIX}:lifetime`,
      concurrency: `${BUDGET_PREFIX}:concurrency`,
    },
  };
}

async function runEval({ config, script, keys, args, fetchImpl = globalThis.fetch }) {
  if (!config?.configured || typeof fetchImpl !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([["EVAL", script, keys.length, ...keys, ...args]]),
      signal: controller.signal,
    });
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    const first = Array.isArray(payload) ? payload[0] : null;
    if (!first || first.error) return null;
    return first.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function usageFromResult(result) {
  return {
    daily: Number(result?.[2] || 0),
    monthly: Number(result?.[3] || 0),
    lifetime: Number(result?.[4] || 0),
  };
}

function denialReason(value) {
  if (value === "daily") return "daily_cap_reached";
  if (value === "monthly") return "monthly_cap_reached";
  if (value === "lifetime") return "lifetime_cap_reached";
  if (value === "concurrency") return "concurrency_cap_reached";
  return "budget_store_unavailable";
}

export async function reserveGeminiUsage({
  env = process.env,
  now = Date.now(),
  requestId = "",
  reservationId = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = resolveGeminiUsageBudgetConfig({ env, now });
  if (!config.configured) {
    return { allowed: false, reason: "budget_store_unavailable", usage: null };
  }

  const token = String(reservationId || `${requestId || "request"}:${randomUUID()}`);
  const result = await runEval({
    config,
    script: RESERVE_SCRIPT,
    keys: [config.keys.daily, config.keys.monthly, config.keys.lifetime, config.keys.concurrency],
    args: [
      config.dailyCap,
      config.monthlyCap,
      config.lifetimeCap,
      config.concurrencyCap,
      config.dayTtlSeconds,
      config.monthTtlSeconds,
      config.concurrencyTtlSeconds,
      token,
    ],
    fetchImpl,
  });

  if (!Array.isArray(result) || result.length < 5) {
    return { allowed: false, reason: "budget_store_unavailable", usage: null };
  }

  const usage = usageFromResult(result);
  if (Number(result[0]) !== 1) {
    return { allowed: false, reason: denialReason(String(result[1] || "")), usage };
  }

  return {
    allowed: true,
    reason: "allowed",
    reservationId: token,
    lockKey: config.keys.concurrency,
    usage,
  };
}

export async function releaseGeminiUsage(reservation, {
  env = process.env,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!reservation?.allowed || !reservation.reservationId || !reservation.lockKey) return false;
  const config = resolveGeminiUsageBudgetConfig({ env, now });
  if (!config.configured) return false;
  const result = await runEval({
    config,
    script: RELEASE_SCRIPT,
    keys: [reservation.lockKey],
    args: [reservation.reservationId],
    fetchImpl,
  });
  return Number(result) === 1;
}
