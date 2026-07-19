#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildMcpAdoptionReport,
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
];

assert.equal(classifyMcpAdoptionEvent(events[0]), "discovery");
assert.equal(classifyMcpAdoptionEvent(events[2]), "evaluation");
assert.equal(classifyMcpAdoptionEvent(events[3]), "invalid_evaluation");
assert.equal(classifyMcpAdoptionEvent(events[5]), "probe");
assert.ok(MCP_ADOPTION_EVENT_COLUMNS.includes("surface"));
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
console.log("MCP adoption report tests passed: 3/3");
