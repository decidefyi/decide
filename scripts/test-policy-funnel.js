#!/usr/bin/env node

import assert from "node:assert/strict";

import trackHandler from "../api/track.js";
import {
  buildPolicyFunnelReport,
  POLICY_FUNNEL_EVENT_COLUMNS,
} from "../lib/policy-funnel-report.js";
import {
  buildPolicyFunnelEvent,
  persistPolicyFunnelEvent,
} from "../lib/policy-funnel-telemetry.js";

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(value = "") {
      this.body = String(value || "");
    },
  };
}

function buildsMinimalAllowlistedEvent() {
  const event = buildPolicyFunnelEvent({
    event: "demo_policy_notaries_cursor_install",
    props: {
      page: "/resources/policy-notaries?secret=must-not-persist",
      discovery_source: "Smithery / listing",
      discovery_medium: "Marketplace",
      discovery_campaign: "Summer Launch",
      referrer_host: "smithery.ai",
      href: "https://example.test/private?email=user@example.test",
      tool: "unknown_tool",
    },
    clientIp: "203.0.113.42",
    salt: "test-secret",
    now: () => new Date("2026-07-22T12:00:00.000Z"),
  });

  assert.equal(event.event, "demo_policy_notaries_cursor_install");
  assert.equal(event.page, "/resources/policy-notaries");
  assert.equal(event.source, "smithery-listing");
  assert.equal(event.medium, "marketplace");
  assert.equal(event.campaign, "summer-launch");
  assert.equal(event.target, "cursor");
  assert.equal(event.tool, "");
  assert.match(event.caller_id, /^[a-f0-9]{24}$/);
  const serialized = JSON.stringify(event);
  assert.ok(!serialized.includes("203.0.113.42"));
  assert.ok(!serialized.includes("user@example.test"));
  assert.equal(buildPolicyFunnelEvent({ event: "demo_run", props: { page: "/resources/policy-notaries" } }), null);
  assert.equal(buildPolicyFunnelEvent({ event: "demo_policy_notary_view", props: { page: "/pricing" } }), null);
}

async function persistsOnlyMinimalFields() {
  const event = buildPolicyFunnelEvent({
    event: "demo_policy_notary_result",
    props: {
      page: "/resources/policy-notaries",
      discovery_source: "direct",
      tool: "refund_eligibility",
      verdict: "allowed",
      automation_safe: true,
    },
    clientIp: "203.0.113.42",
    salt: "test-secret",
    now: () => new Date("2026-07-22T12:00:00.000Z"),
  });
  event.private_payload = "must-not-persist";
  let capturedUrl = "";
  let capturedOptions = {};

  const result = await persistPolicyFunnelEvent(event, {
    env: {
      POLICY_FUNNEL_SUPABASE_ENABLED: "1",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    },
    fetchImpl: async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return { ok: true, status: 201 };
    },
  });

  assert.equal(result.status, "persisted");
  assert.equal(capturedUrl, "https://example.supabase.co/rest/v1/policy_funnel_events");
  const persisted = JSON.parse(capturedOptions.body);
  assert.deepEqual(Object.keys(persisted), [
    "timestamp",
    "event",
    "page",
    "source",
    "medium",
    "campaign",
    "referrer_host",
    "tool",
    "target",
    "verdict",
    "automation_safe",
    "caller_id",
  ]);
  assert.equal(persisted.tool, "refund_eligibility");
  assert.equal(persisted.verdict, "ALLOWED");
  assert.ok(!Object.hasOwn(persisted, "private_payload"));
}

function buildsConservativeAggregateReport() {
  const events = [
    { timestamp: "2026-07-10T12:00:00.000Z", event: "demo_policy_notary_view", source: "smithery", caller_id: "prior-group" },
    { timestamp: "2026-07-10T12:01:00.000Z", event: "demo_policy_notary_result", source: "smithery", caller_id: "prior-group" },
    { timestamp: "2026-07-20T12:00:00.000Z", event: "demo_policy_notary_view", source: "google", caller_id: "current-group" },
    { timestamp: "2026-07-20T12:01:00.000Z", event: "demo_policy_notaries_cursor_install", source: "google", caller_id: "current-group" },
    { timestamp: "2026-07-21T12:00:00.000Z", event: "demo_policy_notary_result", source: "google", caller_id: "current-group" },
    { timestamp: "2026-07-21T12:01:00.000Z", event: "demo_policy_notaries_workflow_cta", source: "google", caller_id: "current-group" },
    { timestamp: "2026-07-21T12:02:00.000Z", event: "demo_policy_notary_error", source: "direct", caller_id: "error-group" },
  ];
  const mcpEvents = [
    { timestamp: "2026-07-10T13:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "prior-group" },
    { timestamp: "2026-07-21T13:00:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "current-group" },
    { timestamp: "2026-07-21T13:01:00.000Z", surface: "policy_mcp_request", method: "tools/call", tool: "refund_eligibility", result: "success", caller_id: "internal-group", traffic_class: "internal_probe" },
  ];

  const report = buildPolicyFunnelReport({
    events,
    mcpEvents,
    generatedAt: "2026-07-22T12:00:00.000Z",
  });

  assert.ok(POLICY_FUNNEL_EVENT_COLUMNS.includes("caller_id"));
  assert.equal(report.totals.events, 7);
  assert.equal(report.totals.errors, 1);
  assert.equal(report.stages.connection_intents.events, 1);
  assert.equal(report.stages.live_proof_results.events, 2);
  assert.equal(report.correlation.known_guide_groups, 2);
  assert.equal(report.correlation.known_evaluator_groups, 2);
  assert.equal(report.correlation.guide_to_evaluator_groups, 2);
  assert.equal(report.correlation.guide_to_evaluator_rate_pct, 100);
  assert.equal(report.trend.current.stages.workflow_handoffs.events, 1);
  assert.equal(report.trend.previous.stages.workflow_handoffs.events, 0);
  assert.equal(report.trend.deltas.live_proof_results, 0);
  assert.equal(report.trend.comparison.status, "available");
  assert.equal(report.sources[0].source, "google");
}

async function trackRoutePersistsBeforeResponding() {
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalEnv = {
    POLICY_FUNNEL_SUPABASE_ENABLED: process.env.POLICY_FUNNEL_SUPABASE_ENABLED,
    MCP_TELEMETRY_SALT: process.env.MCP_TELEMETRY_SALT,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AXIOM_DATASET: process.env.AXIOM_DATASET,
    AXIOM_TOKEN: process.env.AXIOM_TOKEN,
  };
  let capturedBody = "";

  try {
    process.env.POLICY_FUNNEL_SUPABASE_ENABLED = "1";
    process.env.MCP_TELEMETRY_SALT = "test-secret";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    delete process.env.AXIOM_DATASET;
    delete process.env.AXIOM_TOKEN;
    console.log = () => {};
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /policy_funnel_events$/);
      capturedBody = String(options.body || "");
      return { ok: true, status: 201 };
    };

    const response = createResponse();
    await trackHandler({
      method: "POST",
      headers: {
        origin: "https://decide.fyi",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.42",
      },
      socket: { remoteAddress: "203.0.113.42" },
      body: {
        event: "demo_policy_notary_view",
        props: {
          page: "/resources/policy-notaries",
          discovery_source: "google",
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);
    assert.match(capturedBody, /demo_policy_notary_view/);
    assert.ok(!capturedBody.includes("203.0.113.42"));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

buildsMinimalAllowlistedEvent();
console.log("PASS policy funnel accepts only minimal allowlisted guide events");
await persistsOnlyMinimalFields();
console.log("PASS policy funnel persists only the service-side contract");
buildsConservativeAggregateReport();
console.log("PASS policy funnel reports stages and directional network-group overlap");
await trackRoutePersistsBeforeResponding();
console.log("PASS track route settles durable funnel persistence before responding");
console.log("Policy funnel tests passed: 4/4");
