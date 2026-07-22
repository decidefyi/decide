import { timingSafeEqual } from "node:crypto";

import { buildPseudonymousCallerId } from "./privacy-identifiers.js";

const EXTERNAL_TRAFFIC_CLASS = "external_or_unknown";
const INTERNAL_PROBE_TRAFFIC_CLASS = "internal_probe";

function classifyClientValue(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("smithery")) return "smithery";
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("cursor")) return "cursor";
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("visual studio code") || normalized.includes("vscode")) return "vscode";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("chatgpt") || normalized.includes("openai")) return "chatgpt";
  if (normalized.includes("mcp inspector") || normalized.includes("model context protocol inspector")) return "inspector";
  if (normalized.includes("glama")) return "glama";
  return "other";
}

function classifyClient(userAgent = "", clientName = "") {
  const declaredClient = classifyClientValue(clientName);
  return declaredClient === "other" ? classifyClientValue(userAgent) : declaredClient;
}

function enabled(value = "") {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function trafficClass(headers = {}, internalProbeToken = "") {
  const candidate = String(headers?.["x-decide-internal-probe"] || "").trim();
  const expected = String(internalProbeToken || "").trim();
  if (!candidate || !expected) return EXTERNAL_TRAFFIC_CLASS;

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return EXTERNAL_TRAFFIC_CLASS;
  return timingSafeEqual(candidateBuffer, expectedBuffer)
    ? INTERNAL_PROBE_TRAFFIC_CLASS
    : EXTERNAL_TRAFFIC_CLASS;
}

function persistedEvent(event = {}) {
  return {
    timestamp: String(event.timestamp || ""),
    surface: String(event.surface || ""),
    host: String(event.host || ""),
    method: String(event.method || ""),
    tool: String(event.tool || ""),
    result: String(event.result || ""),
    verdict: String(event.verdict || ""),
    code: String(event.code || ""),
    latency_ms: Math.max(0, Math.round(Number(event.latency_ms) || 0)),
    client: String(event.client || "other"),
    caller_id: String(event.caller_id || ""),
    traffic_class: String(event.traffic_class || EXTERNAL_TRAFFIC_CLASS),
  };
}

export function buildMcpTelemetryEvent({
  headers = {},
  clientIp = "",
  salt = "",
  surface = "",
  method = "",
  tool = "",
  result = "",
  verdict = "",
  code = "",
  latencyMs = 0,
  clientName = "",
  internalProbeToken = "",
  now = () => new Date(),
} = {}) {
  const rawHost = String(headers?.host || headers?.["x-forwarded-host"] || "").trim().toLowerCase();
  return {
    timestamp: now().toISOString(),
    surface: String(surface || ""),
    host: rawHost.replace(/:\d+$/, ""),
    method: String(method || ""),
    tool: String(tool || ""),
    result: String(result || ""),
    verdict: String(verdict || ""),
    code: String(code || ""),
    latency_ms: Math.max(0, Math.round(Number(latencyMs) || 0)),
    client: classifyClient(headers?.["user-agent"], clientName),
    caller_id: buildPseudonymousCallerId(clientIp, salt),
    traffic_class: trafficClass(headers, internalProbeToken),
  };
}

export async function persistMcpTelemetryEvent(event = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 2000,
} = {}) {
  if (!enabled(env?.MCP_TELEMETRY_SUPABASE_ENABLED)) return { status: "disabled" };

  const baseUrl = String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey || typeof fetchImpl !== "function") return { status: "not_configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 2000));
  try {
    const response = await fetchImpl(`${baseUrl}/rest/v1/mcp_usage_events`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(persistedEvent(event)),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MCP telemetry persistence failed with status ${response.status}`);
    return { status: "persisted" };
  } finally {
    clearTimeout(timeout);
  }
}
