const POLICY_MCP_TOOLS = new Set([
  "refund_eligibility",
  "cancellation_penalty",
  "return_eligibility",
  "trial_terms",
]);

const DISCOVERY_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
]);

export const POLICY_MCP_TELEMETRY_SURFACES = [
  "policy_mcp_request",
  "mcp_request",
  "cancel_mcp_request",
  "return_mcp_request",
  "trial_mcp_request",
];

export const MCP_ADOPTION_EVENT_COLUMNS = [
  "timestamp",
  "surface",
  "method",
  "tool",
  "result",
  "verdict",
  "code",
  "latency_ms",
  "client",
  "caller_id",
  "traffic_class",
];

function text(value = "") {
  return String(value || "").trim();
}

function dayFromTimestamp(value = "") {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function latestTimestamp(left = "", right = "") {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime)) return Number.isNaN(rightTime) ? "" : right;
  if (Number.isNaN(rightTime)) return left;
  return rightTime > leftTime ? right : left;
}

function normalizedClient(value = "") {
  const normalized = text(value).toLowerCase();
  return normalized && normalized !== "unknown" ? normalized : "other";
}

function clientAttributionKey(event = {}) {
  const callerId = text(event.caller_id);
  const surface = text(event.surface);
  return callerId && surface ? `${callerId}\u0000${surface}` : "";
}

function buildClientHints(events = []) {
  const hints = new Map();
  for (const event of events) {
    const client = normalizedClient(event?.client);
    const key = clientAttributionKey(event);
    if (!key || client === "other") continue;
    const clients = hints.get(key) || new Set();
    clients.add(client);
    hints.set(key, clients);
  }
  return hints;
}

function resolveClient(event = {}, clientHints = new Map()) {
  const explicitClient = normalizedClient(event.client);
  if (explicitClient !== "other") {
    return { client: explicitClient, attribution: "explicit" };
  }
  const candidates = clientHints.get(clientAttributionKey(event));
  if (candidates?.size === 1) {
    return { client: [...candidates][0], attribution: "inferred" };
  }
  return { client: "other", attribution: "unattributed" };
}

export const MCP_ADOPTION_TOOL_NAMES = [...POLICY_MCP_TOOLS];

export function classifyMcpAdoptionEvent(event = {}) {
  const method = text(event.method);
  const tool = text(event.tool);
  const result = text(event.result).toLowerCase();
  const code = text(event.code).toUpperCase();

  if (DISCOVERY_METHODS.has(method)) return "discovery";
  if (method !== "tools/call") return "probe";
  if (!POLICY_MCP_TOOLS.has(tool)) return "probe";
  if (result === "success" || result === "review_required") return "evaluation";
  if (code === "UNKNOWN_TOOL") return "probe";
  return "invalid_evaluation";
}

function toolSummary(tool) {
  return {
    tool,
    calls: 0,
    completed_evaluations: 0,
    review_required: 0,
    invalid_evaluations: 0,
    known_evaluation_callers: 0,
  };
}

function breakdownSummary(field, value) {
  return {
    [field]: value,
    events: 0,
    discovery_events: 0,
    probe_events: 0,
    completed_evaluations: 0,
    invalid_evaluations: 0,
  };
}

function recordBreakdown(map, field, rawValue, classification) {
  const value = text(rawValue) || "unknown";
  const summary = map.get(value) || breakdownSummary(field, value);
  summary.events += 1;
  if (classification === "discovery") summary.discovery_events += 1;
  if (classification === "probe") summary.probe_events += 1;
  if (classification === "evaluation") summary.completed_evaluations += 1;
  if (classification === "invalid_evaluation") summary.invalid_evaluations += 1;
  map.set(value, summary);
}

function sortedBreakdowns(map, field) {
  return [...map.values()].sort((left, right) =>
    right.completed_evaluations - left.completed_evaluations ||
    right.events - left.events ||
    left[field].localeCompare(right[field])
  );
}

function classificationSummary(events = []) {
  const summary = {
    events: 0,
    discovery_events: 0,
    probe_events: 0,
    completed_evaluations: 0,
    invalid_evaluations: 0,
    latest_event_at: null,
  };
  let latestEventAt = "";

  for (const event of events) {
    const classification = classifyMcpAdoptionEvent(event);
    summary.events += 1;
    if (classification === "discovery") summary.discovery_events += 1;
    if (classification === "probe") summary.probe_events += 1;
    if (classification === "evaluation") summary.completed_evaluations += 1;
    if (classification === "invalid_evaluation") summary.invalid_evaluations += 1;
    latestEventAt = latestTimestamp(latestEventAt, text(event?.timestamp));
  }

  summary.latest_event_at = latestEventAt || null;
  return summary;
}

export function buildMcpAdoptionReport({ events = [], generatedAt = new Date().toISOString() } = {}) {
  const rawEventList = Array.isArray(events) ? events : [];
  const internalProbeEvents = rawEventList.filter((event) => text(event?.traffic_class) === "internal_probe");
  const eventList = rawEventList.filter((event) => text(event?.traffic_class) !== "internal_probe");
  const clientHints = buildClientHints(eventList);
  const totals = {
    events: 0,
    discovery_events: 0,
    probe_events: 0,
    completed_evaluations: 0,
    invalid_evaluations: 0,
  };
  const tools = new Map(MCP_ADOPTION_TOOL_NAMES.map((tool) => [tool, toolSummary(tool)]));
  const surfaces = new Map();
  const clients = new Map();
  const attribution = {
    explicit_client_events: 0,
    inferred_client_events: 0,
    unattributed_client_events: 0,
  };
  const evaluationCallerDays = new Map();
  const callersByTool = new Map(MCP_ADOPTION_TOOL_NAMES.map((tool) => [tool, new Set()]));
  let unknownCallerEvaluations = 0;
  let latestEventAt = "";

  for (const rawEvent of eventList) {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    const classification = classifyMcpAdoptionEvent(event);
    const tool = text(event.tool);
    const result = text(event.result).toLowerCase();
    const callerId = text(event.caller_id);
    const clientResolution = resolveClient(event, clientHints);

    totals.events += 1;
    latestEventAt = latestTimestamp(latestEventAt, text(event.timestamp));
    recordBreakdown(surfaces, "surface", event.surface, classification);
    recordBreakdown(clients, "client", clientResolution.client, classification);
    attribution[`${clientResolution.attribution}_client_events`] += 1;
    if (classification === "discovery") totals.discovery_events += 1;
    if (classification === "probe") totals.probe_events += 1;
    if (classification === "evaluation") totals.completed_evaluations += 1;
    if (classification === "invalid_evaluation") totals.invalid_evaluations += 1;

    const summary = tools.get(tool);
    if (!summary || text(event.method) !== "tools/call") continue;

    summary.calls += 1;
    if (classification === "evaluation") {
      summary.completed_evaluations += 1;
      if (result === "review_required") summary.review_required += 1;
      if (!callerId) {
        unknownCallerEvaluations += 1;
      } else {
        const days = evaluationCallerDays.get(callerId) || new Set();
        const day = dayFromTimestamp(event.timestamp);
        if (day) days.add(day);
        evaluationCallerDays.set(callerId, days);
        callersByTool.get(tool).add(callerId);
      }
    }
    if (classification === "invalid_evaluation") summary.invalid_evaluations += 1;
  }

  const knownEvaluationCallers = new Set(evaluationCallerDays.keys());
  const repeatEvaluationCallers = [...evaluationCallerDays.values()].filter((days) => days.size > 1).length;
  for (const [tool, callerIds] of callersByTool.entries()) {
    tools.get(tool).known_evaluation_callers = callerIds.size;
  }

  return {
    schema_version: "mcp_adoption_report_v1",
    generated_at: generatedAt,
    totals,
    callers: {
      known_evaluation_callers: knownEvaluationCallers.size,
      repeat_evaluation_callers: repeatEvaluationCallers,
      evaluations_without_caller_identifier: unknownCallerEvaluations,
    },
    attribution,
    tools: MCP_ADOPTION_TOOL_NAMES.map((tool) => tools.get(tool)),
    surfaces: sortedBreakdowns(surfaces, "surface"),
    clients: sortedBreakdowns(clients, "client"),
    latest_event_at: latestEventAt || null,
    internal_probes: classificationSummary(internalProbeEvents),
    interpretation: {
      completed_evaluations:
        "A known Policy Notaries tool accepted a valid call and returned success or review_required; this is not proof of a paying customer or referral source.",
      discovery_events:
        "Client initialization and tool-list traffic; this measures remote-server discovery, not installation or adoption.",
      probe_events:
        "Unknown, generic, or non-tool traffic. Do not count these as integrations.",
      client_attribution:
        "Declared MCP initialize client names are explicit. Same-caller, same-surface events are inferred only when exactly one declared client exists; ambiguous traffic stays other.",
      internal_probes:
        "Requests authenticated with the internal probe token are reported separately and excluded from adoption, caller, tool, surface, and client totals.",
    },
  };
}

function adoptionTrendPeriod(events, window, generatedAt) {
  const report = buildMcpAdoptionReport({ events, generatedAt });
  return {
    window,
    totals: report.totals,
    callers: report.callers,
    tools: report.tools,
    latest_event_at: report.latest_event_at,
  };
}

function adoptionDelta(current, previous, field) {
  return Number(current?.[field] || 0) - Number(previous?.[field] || 0);
}

export function buildMcpAdoptionTrend({
  events = [],
  generatedAt = new Date().toISOString(),
  days = 7,
} = {}) {
  const parsedGeneratedAt = Date.parse(generatedAt);
  const untilTime = Number.isFinite(parsedGeneratedAt) ? parsedGeneratedAt : Date.now();
  const until = new Date(untilTime).toISOString();
  const parsedDays = Number.parseInt(String(days || ""), 10);
  const windowDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
  const currentSinceTime = untilTime - windowDays * 24 * 60 * 60 * 1000;
  const previousSinceTime = currentSinceTime - windowDays * 24 * 60 * 60 * 1000;
  const currentWindow = {
    since: new Date(currentSinceTime).toISOString(),
    until,
    days: windowDays,
  };
  const previousWindow = {
    since: new Date(previousSinceTime).toISOString(),
    until: currentWindow.since,
    days: windowDays,
  };
  const eventList = Array.isArray(events) ? events : [];
  const inWindow = (event, sinceTime, endTime) => {
    const eventTime = Date.parse(text(event?.timestamp));
    return Number.isFinite(eventTime) && eventTime >= sinceTime && eventTime < endTime;
  };
  const current = adoptionTrendPeriod(
    eventList.filter((event) => inWindow(event, currentSinceTime, untilTime)),
    currentWindow,
    until,
  );
  const previous = adoptionTrendPeriod(
    eventList.filter((event) => inWindow(event, previousSinceTime, currentSinceTime)),
    previousWindow,
    until,
  );

  return {
    schema_version: "mcp_adoption_trend_v1",
    generated_at: until,
    current,
    previous,
    deltas: {
      completed_evaluations: adoptionDelta(current.totals, previous.totals, "completed_evaluations"),
      discovery_events: adoptionDelta(current.totals, previous.totals, "discovery_events"),
      invalid_evaluations: adoptionDelta(current.totals, previous.totals, "invalid_evaluations"),
      known_evaluation_callers: adoptionDelta(current.callers, previous.callers, "known_evaluation_callers"),
      repeat_evaluation_callers: adoptionDelta(current.callers, previous.callers, "repeat_evaluation_callers"),
    },
  };
}
