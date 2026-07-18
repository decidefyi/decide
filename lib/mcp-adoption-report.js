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

export function buildMcpAdoptionReport({ events = [], generatedAt = new Date().toISOString() } = {}) {
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
  const evaluationCallerDays = new Map();
  let unknownCallerEvaluations = 0;
  let latestEventAt = "";

  for (const rawEvent of Array.isArray(events) ? events : []) {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    const classification = classifyMcpAdoptionEvent(event);
    const tool = text(event.tool);
    const result = text(event.result).toLowerCase();
    const callerId = text(event.caller_id);

    totals.events += 1;
    latestEventAt = latestTimestamp(latestEventAt, text(event.timestamp));
    recordBreakdown(surfaces, "surface", event.surface, classification);
    recordBreakdown(clients, "client", event.client, classification);
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
      }
    }
    if (classification === "invalid_evaluation") summary.invalid_evaluations += 1;
  }

  const knownEvaluationCallers = new Set(evaluationCallerDays.keys());
  const repeatEvaluationCallers = [...evaluationCallerDays.values()].filter((days) => days.size > 1).length;
  const callersByTool = new Map(MCP_ADOPTION_TOOL_NAMES.map((tool) => [tool, new Set()]));
  for (const rawEvent of Array.isArray(events) ? events : []) {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    const tool = text(event.tool);
    const callerId = text(event.caller_id);
    if (classifyMcpAdoptionEvent(event) === "evaluation" && callerId && callersByTool.has(tool)) {
      callersByTool.get(tool).add(callerId);
    }
  }
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
    tools: MCP_ADOPTION_TOOL_NAMES.map((tool) => tools.get(tool)),
    surfaces: sortedBreakdowns(surfaces, "surface"),
    clients: sortedBreakdowns(clients, "client"),
    latest_event_at: latestEventAt || null,
    interpretation: {
      completed_evaluations:
        "A known Policy Notaries tool accepted a valid call and returned success or review_required; this is not proof of a paying customer or referral source.",
      discovery_events:
        "Client initialization and tool-list traffic; this measures remote-server discovery, not installation or adoption.",
      probe_events:
        "Unknown, generic, or non-tool traffic. Do not count these as integrations.",
    },
  };
}
