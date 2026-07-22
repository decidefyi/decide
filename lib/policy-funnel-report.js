import { classifyMcpAdoptionEvent } from "./mcp-adoption-report.js";

export const POLICY_FUNNEL_EVENT_COLUMNS = [
  "timestamp",
  "event",
  "source",
  "medium",
  "campaign",
  "referrer_host",
  "tool",
  "target",
  "verdict",
  "automation_safe",
  "caller_id",
];

export const POLICY_FUNNEL_STAGE_EVENTS = {
  guide_views: new Set(["demo_policy_notary_view"]),
  proof_intents: new Set(["demo_policy_notaries_proof_cta"]),
  connection_intents: new Set([
    "demo_policy_notary_copy",
    "demo_policy_notaries_cursor_install",
    "demo_policy_notaries_vscode_install",
    "demo_policy_notaries_other_clients",
  ]),
  live_proof_runs: new Set(["demo_policy_notary_run"]),
  live_proof_results: new Set(["demo_policy_notary_result"]),
  workflow_handoffs: new Set([
    "demo_policy_notaries_workflow_cta",
    "demo_policy_notaries_sprint_cta",
  ]),
};

const STAGE_NAMES = Object.keys(POLICY_FUNNEL_STAGE_EVENTS);
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value = "") {
  return String(value || "").trim();
}

function stageForEvent(eventName = "") {
  for (const [stage, eventNames] of Object.entries(POLICY_FUNNEL_STAGE_EVENTS)) {
    if (eventNames.has(eventName)) return stage;
  }
  return "other";
}

function latestTimestamp(left = "", right = "") {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? right : "";
  if (!Number.isFinite(rightTime)) return left;
  return rightTime > leftTime ? right : left;
}

function emptyStage() {
  return { events: 0, known_visitor_groups: 0 };
}

function stageMap() {
  return Object.fromEntries(STAGE_NAMES.map((stage) => [stage, emptyStage()]));
}

function percentage(numerator, denominator) {
  const safeNumerator = Number(numerator) || 0;
  const safeDenominator = Number(denominator) || 0;
  if (safeDenominator <= 0) return null;
  return Math.round((safeNumerator / safeDenominator) * 1000) / 10;
}

function evaluatorCallerIds(mcpEvents = []) {
  const ids = new Set();
  for (const event of Array.isArray(mcpEvents) ? mcpEvents : []) {
    if (text(event?.traffic_class) === "internal_probe") continue;
    if (classifyMcpAdoptionEvent(event) !== "evaluation") continue;
    const callerId = text(event?.caller_id);
    if (callerId) ids.add(callerId);
  }
  return ids;
}

function sourceSummary(source = "direct") {
  return {
    source,
    events: 0,
    guide_views: 0,
    connection_intents: 0,
    live_proof_results: 0,
    workflow_handoffs: 0,
    known_visitor_groups: 0,
  };
}

function summarizePeriod(events = [], mcpEvents = [], { evaluatorDataAvailable = true } = {}) {
  const eventList = Array.isArray(events) ? events : [];
  const stages = stageMap();
  const callersByStage = new Map(STAGE_NAMES.map((stage) => [stage, new Set()]));
  const allCallers = new Set();
  const guideCallers = new Set();
  const sources = new Map();
  const callersBySource = new Map();
  let latestEventAt = "";
  let errors = 0;

  for (const event of eventList) {
    const eventName = text(event?.event);
    const stage = stageForEvent(eventName);
    const callerId = text(event?.caller_id);
    const source = text(event?.source).toLowerCase() || "direct";
    latestEventAt = latestTimestamp(latestEventAt, text(event?.timestamp));
    if (eventName === "demo_policy_notary_error") errors += 1;
    if (callerId) allCallers.add(callerId);

    const sourceRow = sources.get(source) || sourceSummary(source);
    sourceRow.events += 1;
    const sourceCallers = callersBySource.get(source) || new Set();
    if (callerId) sourceCallers.add(callerId);
    callersBySource.set(source, sourceCallers);

    if (stage !== "other") {
      stages[stage].events += 1;
      if (callerId) callersByStage.get(stage).add(callerId);
      if (Object.hasOwn(sourceRow, stage)) sourceRow[stage] += 1;
      if (stage === "guide_views" && callerId) guideCallers.add(callerId);
    }
    sources.set(source, sourceRow);
  }

  for (const stage of STAGE_NAMES) {
    stages[stage].known_visitor_groups = callersByStage.get(stage).size;
  }
  for (const [source, row] of sources.entries()) {
    row.known_visitor_groups = callersBySource.get(source)?.size || 0;
  }

  const evaluatorCallers = evaluatorDataAvailable ? evaluatorCallerIds(mcpEvents) : new Set();
  const overlappingCallers = evaluatorDataAvailable
    ? [...guideCallers].filter((callerId) => evaluatorCallers.has(callerId)).length
    : 0;

  return {
    totals: {
      events: eventList.length,
      errors,
      known_visitor_groups: allCallers.size,
    },
    stages,
    sources: [...sources.values()].sort((left, right) =>
      right.guide_views - left.guide_views ||
      right.events - left.events ||
      left.source.localeCompare(right.source)
    ),
    correlation: {
      evaluator_data_available: evaluatorDataAvailable,
      known_guide_groups: guideCallers.size,
      known_evaluator_groups: evaluatorCallers.size,
      guide_to_evaluator_groups: overlappingCallers,
      guide_to_evaluator_rate_pct: evaluatorDataAvailable
        ? percentage(overlappingCallers, guideCallers.size)
        : null,
    },
    latest_event_at: latestEventAt || null,
  };
}

function observed(period) {
  return Number(period?.totals?.events || 0) > 0;
}

function comparison(current, previous) {
  const currentObserved = observed(current);
  const previousObserved = observed(previous);
  let reasonCode = "COMPLETE_WINDOWS";
  if (!currentObserved && !previousObserved) reasonCode = "BOTH_WINDOWS_UNOBSERVED";
  else if (!previousObserved) reasonCode = "PRIOR_WINDOW_UNOBSERVED";
  else if (!currentObserved) reasonCode = "CURRENT_WINDOW_UNOBSERVED";
  return {
    status: currentObserved && previousObserved ? "available" : "baseline_pending",
    current_window_observed: currentObserved,
    previous_window_observed: previousObserved,
    reason_code: reasonCode,
  };
}

function stageDeltas(current, previous) {
  return Object.fromEntries(STAGE_NAMES.map((stage) => [
    stage,
    Number(current?.stages?.[stage]?.events || 0) - Number(previous?.stages?.[stage]?.events || 0),
  ]));
}

function eventsInWindow(events, sinceTime, untilTime) {
  return (Array.isArray(events) ? events : []).filter((event) => {
    const timestamp = Date.parse(text(event?.timestamp));
    return Number.isFinite(timestamp) && timestamp >= sinceTime && timestamp < untilTime;
  });
}

export function buildPolicyFunnelReport({
  events = [],
  mcpEvents = [],
  evaluatorDataAvailable = true,
  generatedAt = new Date().toISOString(),
  trendDays = 7,
} = {}) {
  const generatedTime = Date.parse(generatedAt);
  const untilTime = Number.isFinite(generatedTime) ? generatedTime : Date.now();
  const until = new Date(untilTime).toISOString();
  const parsedTrendDays = Number.parseInt(String(trendDays || ""), 10);
  const days = Number.isFinite(parsedTrendDays) && parsedTrendDays > 0 ? parsedTrendDays : 7;
  const currentSinceTime = untilTime - days * DAY_MS;
  const previousSinceTime = currentSinceTime - days * DAY_MS;
  const currentEvents = eventsInWindow(events, currentSinceTime, untilTime);
  const previousEvents = eventsInWindow(events, previousSinceTime, currentSinceTime);
  const currentMcpEvents = eventsInWindow(mcpEvents, currentSinceTime, untilTime);
  const previousMcpEvents = eventsInWindow(mcpEvents, previousSinceTime, currentSinceTime);
  const current = summarizePeriod(currentEvents, currentMcpEvents, { evaluatorDataAvailable });
  const previous = summarizePeriod(previousEvents, previousMcpEvents, { evaluatorDataAvailable });
  current.window = { since: new Date(currentSinceTime).toISOString(), until, days };
  previous.window = { since: new Date(previousSinceTime).toISOString(), until: current.window.since, days };

  return {
    schema_version: "policy_funnel_report_v1",
    generated_at: until,
    ...summarizePeriod(events, mcpEvents, { evaluatorDataAvailable }),
    trend: {
      schema_version: "policy_funnel_trend_v1",
      generated_at: until,
      current,
      previous,
      comparison: comparison(current, previous),
      deltas: stageDeltas(current, previous),
    },
    interpretation: {
      connection_intents:
        "MCP URL copies and client-install clicks. These are intent signals, not verified installations.",
      live_proof_results:
        "Completed public REST proof responses on the Policy Notaries guide; these are not MCP evaluations.",
      workflow_handoffs:
        "Clicks from the guide into a Krafthaus workflow or sprint path; these are not sales or paid customers.",
      guide_to_evaluator_groups:
        "Salted network-group overlap between guide views and completed MCP evaluations. Shared networks and changing addresses mean this is directional, not person-level attribution.",
    },
  };
}
