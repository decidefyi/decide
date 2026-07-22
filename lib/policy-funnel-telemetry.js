import { buildPseudonymousCallerId } from "./privacy-identifiers.js";

export const POLICY_FUNNEL_EVENTS = new Set([
  "demo_policy_notary_view",
  "demo_policy_notary_run",
  "demo_policy_notary_result",
  "demo_policy_notary_error",
  "demo_policy_notary_copy",
  "demo_policy_notaries_proof_cta",
  "demo_policy_notaries_cursor_install",
  "demo_policy_notaries_vscode_install",
  "demo_policy_notaries_other_clients",
  "demo_policy_notaries_workflow_cta",
  "demo_policy_notaries_sprint_cta",
]);

const POLICY_NOTARY_TOOLS = new Set([
  "refund_eligibility",
  "cancellation_penalty",
  "return_eligibility",
  "trial_terms",
]);

const DEFAULT_TARGETS = new Map([
  ["demo_policy_notaries_proof_cta", "live_proof"],
  ["demo_policy_notaries_cursor_install", "cursor"],
  ["demo_policy_notaries_vscode_install", "vscode"],
  ["demo_policy_notaries_other_clients", "other_clients"],
  ["demo_policy_notaries_workflow_cta", "support_policy_gate"],
  ["demo_policy_notaries_sprint_cta", "workflow_app_sprint"],
]);

function enabled(value = "") {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function token(value = "", maxLength = 80) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function pagePath(value = "") {
  const normalized = String(value || "").trim().split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return normalized === "/resources/policy-notaries" ? normalized : "";
}

function verdict(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .slice(0, 48);
}

function persistedEvent(event = {}) {
  return {
    timestamp: String(event.timestamp || ""),
    event: String(event.event || ""),
    page: String(event.page || ""),
    source: String(event.source || "direct"),
    medium: String(event.medium || ""),
    campaign: String(event.campaign || ""),
    referrer_host: String(event.referrer_host || ""),
    tool: String(event.tool || ""),
    target: String(event.target || ""),
    verdict: String(event.verdict || ""),
    automation_safe: typeof event.automation_safe === "boolean" ? event.automation_safe : null,
    caller_id: String(event.caller_id || ""),
  };
}

export function isPolicyFunnelEvent(event = "") {
  return POLICY_FUNNEL_EVENTS.has(String(event || ""));
}

export function buildPolicyFunnelEvent({
  event = "",
  props = {},
  clientIp = "",
  salt = "",
  now = () => new Date(),
} = {}) {
  const eventName = String(event || "");
  if (!isPolicyFunnelEvent(eventName)) return null;

  const page = pagePath(props?.page || props?.landing_path);
  if (!page) return null;

  const rawTool = String(props?.tool || "").trim();
  const tool = POLICY_NOTARY_TOOLS.has(rawTool) ? rawTool : "";
  const explicitTarget = token(props?.target, 64);

  return {
    timestamp: now().toISOString(),
    event: eventName,
    page,
    source: token(props?.discovery_source, 80) || "direct",
    medium: token(props?.discovery_medium, 80),
    campaign: token(props?.discovery_campaign, 100),
    referrer_host: token(props?.referrer_host, 120),
    tool,
    target: explicitTarget || DEFAULT_TARGETS.get(eventName) || "",
    verdict: verdict(props?.verdict),
    automation_safe: typeof props?.automation_safe === "boolean" ? props.automation_safe : null,
    caller_id: buildPseudonymousCallerId(clientIp, salt),
  };
}

export async function persistPolicyFunnelEvent(event, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 2000,
} = {}) {
  if (!event) return { status: "ignored" };
  if (!enabled(env?.POLICY_FUNNEL_SUPABASE_ENABLED)) return { status: "disabled" };

  const baseUrl = String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey || typeof fetchImpl !== "function") return { status: "not_configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 2000));
  try {
    const response = await fetchImpl(`${baseUrl}/rest/v1/policy_funnel_events`, {
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
    if (!response.ok) throw new Error(`Policy funnel persistence failed with status ${response.status}`);
    return { status: "persisted" };
  } finally {
    clearTimeout(timeout);
  }
}
