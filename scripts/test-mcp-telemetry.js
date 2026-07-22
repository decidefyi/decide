#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildMcpTelemetryEvent, persistMcpTelemetryEvent } from "../lib/mcp-telemetry.js";

function testBuildsPrivacyMinimalStableCallerTelemetry() {
  const event = buildMcpTelemetryEvent({
    headers: {
      host: "policy.decide.fyi",
      "user-agent": "smithery-client/2.0",
    },
    clientIp: "203.0.113.42",
    salt: "test-secret",
    surface: "policy_mcp_request",
    method: "tools/call",
    tool: "refund_eligibility",
    result: "success",
    verdict: "ALLOWED",
    code: "WITHIN_WINDOW",
    latencyMs: 18,
    now: () => new Date("2026-07-15T17:30:00.000Z"),
  });
  event.payload = "must-not-persist";

  assert.equal(event.host, "policy.decide.fyi");
  assert.equal(event.client, "smithery");
  assert.equal(event.surface, "policy_mcp_request");
  assert.equal(event.tool, "refund_eligibility");
  assert.equal(event.latency_ms, 18);
  assert.equal(event.timestamp, "2026-07-15T17:30:00.000Z");
  assert.match(event.caller_id, /^[a-f0-9]{24}$/);
  assert.ok(!JSON.stringify(event).includes("203.0.113.42"));
}

function testOmitsCallerIdentityWithoutSalt() {
  const event = buildMcpTelemetryEvent({ clientIp: "203.0.113.42", salt: "", method: "tools/list" });
  assert.equal(event.caller_id, "");
}

function testPrefersDeclaredMcpClientName() {
  const cursorEvent = buildMcpTelemetryEvent({
    headers: { "user-agent": "undici" },
    clientName: "Cursor",
    method: "initialize",
  });
  const codexEvent = buildMcpTelemetryEvent({
    headers: { "user-agent": "OpenAI client" },
    clientName: "OpenAI Codex",
    method: "initialize",
  });

  assert.equal(cursorEvent.client, "cursor");
  assert.equal(codexEvent.client, "codex");
}

function testClassifiesOnlyAuthenticatedInternalProbes() {
  const internalProbe = buildMcpTelemetryEvent({
    headers: { "x-decide-internal-probe": "probe-secret" },
    internalProbeToken: "probe-secret",
    method: "tools/list",
  });
  const wrongToken = buildMcpTelemetryEvent({
    headers: { "x-decide-internal-probe": "wrong-secret" },
    internalProbeToken: "probe-secret",
    method: "tools/list",
  });
  const unconfigured = buildMcpTelemetryEvent({
    headers: { "x-decide-internal-probe": "probe-secret" },
    internalProbeToken: "",
    method: "tools/list",
  });

  assert.equal(internalProbe.traffic_class, "internal_probe");
  assert.equal(wrongToken.traffic_class, "external_or_unknown");
  assert.equal(unconfigured.traffic_class, "external_or_unknown");
}

async function testPersistsMinimalTelemetryToSupabase() {
  let capturedUrl = "";
  let capturedOptions = {};
  const event = buildMcpTelemetryEvent({
    headers: { "x-decide-internal-probe": "probe-secret" },
    internalProbeToken: "probe-secret",
    surface: "policy_mcp_request",
    method: "tools/call",
    tool: "refund_eligibility",
    result: "success",
    now: () => new Date("2026-07-15T17:30:00.000Z"),
  });

  const result = await persistMcpTelemetryEvent(event, {
    env: {
      MCP_TELEMETRY_SUPABASE_ENABLED: "1",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    },
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, status: 201 };
    },
  });

  assert.equal(result.status, "persisted");
  assert.equal(capturedUrl, "https://example.supabase.co/rest/v1/mcp_usage_events");
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers.apikey, "test-service-key");
  const persisted = JSON.parse(capturedOptions.body);
  assert.equal(persisted.tool, "refund_eligibility");
  assert.equal(persisted.timestamp, "2026-07-15T17:30:00.000Z");
  assert.equal(persisted.traffic_class, "internal_probe");
  assert.ok(!capturedOptions.body.includes("probe-secret"));
  assert.ok(!Object.hasOwn(persisted, "client_ip"));
  assert.ok(!Object.hasOwn(persisted, "payload"));
}

async function testSkipsSupabaseWhenDisabled() {
  let called = false;
  const result = await persistMcpTelemetryEvent({}, {
    env: {},
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    },
  });
  assert.equal(result.status, "disabled");
  assert.equal(called, false);
}

testBuildsPrivacyMinimalStableCallerTelemetry();
console.log("PASS MCP telemetry is privacy-minimal and attributable");
testOmitsCallerIdentityWithoutSalt();
console.log("PASS MCP telemetry omits unstable caller identity without salt");
testPrefersDeclaredMcpClientName();
console.log("PASS MCP telemetry prefers declared initialize clientInfo over generic user agents");
testClassifiesOnlyAuthenticatedInternalProbes();
console.log("PASS MCP telemetry marks only authenticated internal probes");
await testPersistsMinimalTelemetryToSupabase();
console.log("PASS MCP telemetry persists privacy-minimal events to Supabase");
await testSkipsSupabaseWhenDisabled();
console.log("PASS MCP telemetry skips Supabase when disabled");
console.log("MCP telemetry tests passed: 6/6");
