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

async function testPersistsMinimalTelemetryToSupabase() {
  let capturedUrl = "";
  let capturedOptions = {};
  const event = buildMcpTelemetryEvent({
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
await testPersistsMinimalTelemetryToSupabase();
console.log("PASS MCP telemetry persists privacy-minimal events to Supabase");
await testSkipsSupabaseWhenDisabled();
console.log("PASS MCP telemetry skips Supabase when disabled");
console.log("MCP telemetry tests passed: 4/4");
