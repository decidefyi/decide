#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildMcpAdoptionReport,
  buildMcpAdoptionTrend,
  classifyMcpAdoptionEvent,
  MCP_ADOPTION_EVENT_COLUMNS,
  POLICY_MCP_TELEMETRY_SURFACES,
} from "../lib/mcp-adoption-report.js";

const events = [
  { timestamp: "2026-07-16T10:00:00.000Z", surface: "policy_mcp_request", client: "smithery", method: "initialize", result: "success", caller_id: "caller-a" },
  { timestamp: "2026-07-16T10:01:00.000Z", surface: "policy_mcp_request", client: "other", method: "tools/list", result: "success", caller_id: "caller-a" },
  {
    timestamp: "2026-07-16T10:02:00.000Z",
    surface: "policy_mcp_request",
    client: "other",
    method: "tools/call",
    tool: "refund_eligibility",
    result: "success",
    caller_id: "caller-a",
  },
  {
    timestamp: "2026-07-17T10:02:00.000Z",
    surface: "policy_mcp_request",
    client: "smithery",
    method: "tools/call",
    tool: "refund_eligibility",
    result: "invalid_params",
    code: "SCHEMA_VALIDATION_FAILED",
    caller_id: "caller-a",
  },
  {
    timestamp: "2026-07-17T10:03:00.000Z",
    surface: "return_mcp_request",
    client: "claude",
    method: "tools/call",
    tool: "return_eligibility",
    result: "review_required",
    caller_id: "caller-b",
  },
  {
    timestamp: "2026-07-17T10:04:00.000Z",
    surface: "policy_mcp_request",
    client: "other",
    method: "tools/call",
    tool: "VerifyMCP",
    result: "invalid_params",
    code: "UNKNOWN_TOOL",
  },
  { timestamp: "2026-07-17T10:05:00.000Z", surface: "policy_mcp_request", client: "other", method: "ping", result: "success" },
  {
    timestamp: "2026-07-17T10:06:00.000Z",
    surface: "policy_mcp_request",
    client: "codex",
    method: "tools/call",
    tool: "refund_eligibility",
    result: "success",
    caller_id: "internal-caller",
    traffic_class: "internal_probe",
  },
];

assert.equal(classifyMcpAdoptionEvent(events[0]), "discovery");
assert.equal(classifyMcpAdoptionEvent(events[2]), "evaluation");
assert.equal(classifyMcpAdoptionEvent(events[3]), "invalid_evaluation");
assert.equal(classifyMcpAdoptionEvent(events[5]), "probe");
assert.ok(MCP_ADOPTION_EVENT_COLUMNS.includes("surface"));
assert.ok(MCP_ADOPTION_EVENT_COLUMNS.includes("traffic_class"));
assert.ok(POLICY_MCP_TELEMETRY_SURFACES.includes("policy_mcp_request"));
console.log("PASS MCP adoption classifies discovery, evaluations, and probes");

const report = buildMcpAdoptionReport({
  events,
  generatedAt: "2026-07-18T10:00:00.000Z",
});

assert.equal(report.totals.events, 7);
assert.equal(report.totals.discovery_events, 2);
assert.equal(report.totals.probe_events, 2);
assert.equal(report.totals.completed_evaluations, 2);
assert.equal(report.totals.invalid_evaluations, 1);
assert.equal(report.callers.known_evaluation_callers, 2);
assert.equal(report.callers.repeat_evaluation_callers, 0);
assert.deepEqual(report.attribution, {
  explicit_client_events: 3,
  inferred_client_events: 2,
  unattributed_client_events: 2,
});
assert.equal(report.tools[0].tool, "refund_eligibility");
assert.equal(report.tools[0].calls, 2);
assert.equal(report.tools[0].completed_evaluations, 1);
assert.equal(report.tools[0].invalid_evaluations, 1);
assert.equal(report.tools[2].review_required, 1);
assert.equal(report.surfaces[0].surface, "policy_mcp_request");
assert.equal(report.surfaces[0].completed_evaluations, 1);
assert.equal(report.clients[0].client, "smithery");
assert.equal(report.clients[0].completed_evaluations, 1);
assert.equal(report.latest_event_at, "2026-07-17T10:05:00.000Z");
assert.deepEqual(report.internal_probes, {
  events: 1,
  discovery_events: 0,
  probe_events: 0,
  completed_evaluations: 1,
  invalid_evaluations: 0,
  latest_event_at: "2026-07-17T10:06:00.000Z",
});
console.log("PASS MCP adoption report aggregates only privacy-minimal operational fields");

const ambiguousReport = buildMcpAdoptionReport({
  events: [
    { surface: "policy_mcp_request", client: "cursor", caller_id: "shared", method: "initialize" },
    { surface: "policy_mcp_request", client: "vscode", caller_id: "shared", method: "initialize" },
    { surface: "policy_mcp_request", client: "other", caller_id: "shared", method: "tools/list" },
  ],
});
assert.equal(ambiguousReport.clients.find((entry) => entry.client === "other")?.events, 1);
assert.equal(ambiguousReport.attribution.inferred_client_events, 0);
console.log("PASS MCP adoption leaves ambiguous shared-caller traffic unattributed");

const trend = buildMcpAdoptionTrend({
  events: [
    { timestamp: "2026-07-10T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "previous-caller" },
    { timestamp: "2026-07-11T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/list", result: "success", caller_id: "previous-caller" },
    { timestamp: "2026-07-18T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "current-caller" },
    { timestamp: "2026-07-20T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "current-caller" },
    { timestamp: "2026-07-21T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/list", result: "success", caller_id: "current-caller" },
    { timestamp: "2026-07-21T13:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "internal-caller", traffic_class: "internal_probe" },
    { timestamp: "2026-07-23T12:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "future-caller" },
  ],
  generatedAt: "2026-07-22T12:00:00.000Z",
  days: 7,
});
assert.equal(trend.schema_version, "mcp_adoption_trend_v1");
assert.deepEqual(trend.current.window, {
  since: "2026-07-15T12:00:00.000Z",
  until: "2026-07-22T12:00:00.000Z",
  days: 7,
});
assert.deepEqual(trend.previous.window, {
  since: "2026-07-08T12:00:00.000Z",
  until: "2026-07-15T12:00:00.000Z",
  days: 7,
});
assert.equal(trend.current.totals.completed_evaluations, 2);
assert.equal(trend.previous.totals.completed_evaluations, 1);
assert.equal(trend.current.callers.repeat_evaluation_callers, 1);
assert.equal(trend.previous.callers.repeat_evaluation_callers, 0);
assert.deepEqual(trend.deltas, {
  completed_evaluations: 1,
  discovery_events: 0,
  invalid_evaluations: 0,
  known_evaluation_callers: 0,
  repeat_evaluation_callers: 1,
});
assert.equal(trend.current.tools[0].completed_evaluations, 2);
assert.equal(trend.previous.tools[0].completed_evaluations, 1);
console.log("PASS MCP adoption trend compares rolling windows without probes or future events");
console.log("MCP adoption report tests passed: 4/4");
