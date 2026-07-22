#!/usr/bin/env node

import assert from "node:assert/strict";

import handler, { resetMcpAdoptionCacheForTests } from "../api/metrics.js";

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

const originalFetch = globalThis.fetch;
const recentEventAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const originalEnv = {
  METRICS_ADMIN_TOKEN: process.env.METRICS_ADMIN_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AXIOM_DATASET: process.env.AXIOM_DATASET,
  AXIOM_TOKEN: process.env.AXIOM_TOKEN,
};

try {
  process.env.METRICS_ADMIN_TOKEN = "test-metrics-token";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  delete process.env.AXIOM_DATASET;
  delete process.env.AXIOM_TOKEN;
  resetMcpAdoptionCacheForTests();

  let supabaseRequests = 0;
  globalThis.fetch = async (url) => {
    supabaseRequests += 1;
    if (String(url).includes("/rest/v1/policy_funnel_events")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          {
            timestamp: recentEventAt,
            event: "demo_policy_notary_view",
            source: "google",
            caller_id: "caller-a",
          },
          {
            timestamp: recentEventAt,
            event: "demo_policy_notary_result",
            source: "google",
            caller_id: "caller-a",
          },
        ]),
      };
    }
    assert.match(String(url), /\/rest\/v1\/mcp_usage_events/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([
        {
          timestamp: recentEventAt,
          surface: "policy_mcp_request",
          client: "cursor",
          caller_id: "caller-a",
          method: "initialize",
          result: "success",
        },
        {
          timestamp: recentEventAt,
          surface: "policy_mcp_request",
          client: "other",
          caller_id: "caller-a",
          method: "tools/call",
          tool: "refund_eligibility",
          result: "success",
        },
      ]),
    };
  };

  const authorizedResponse = createResponse();
  await handler({
    method: "GET",
    headers: {
      "x-metrics-token": "test-metrics-token",
      "x-forwarded-for": "203.0.113.10",
    },
  }, authorizedResponse);
  const authorizedPayload = JSON.parse(authorizedResponse.body);
  assert.equal(authorizedResponse.statusCode, 200);
  assert.equal(authorizedPayload.mcp_adoption_available, true);
  assert.equal(authorizedPayload.mcp_adoption.totals.completed_evaluations, 1);
  assert.equal(authorizedPayload.mcp_adoption.clients[0].client, "cursor");
  assert.equal(authorizedPayload.mcp_adoption.attribution.inferred_client_events, 1);
  assert.equal(authorizedPayload.mcp_adoption.trend.schema_version, "mcp_adoption_trend_v1");
  assert.equal(authorizedPayload.mcp_adoption.trend.current.totals.completed_evaluations, 1);
  assert.equal(authorizedPayload.mcp_adoption.trend.previous.totals.completed_evaluations, 0);
  assert.equal(authorizedPayload.mcp_adoption.trend.comparison.status, "baseline_pending");
  assert.equal(authorizedPayload.mcp_adoption.trend.comparison.previous_window_observed, false);
  assert.equal(authorizedPayload.policy_funnel_available, true);
  assert.equal(authorizedPayload.policy_funnel.trend.current.stages.guide_views.events, 1);
  assert.equal(authorizedPayload.policy_funnel.trend.current.stages.live_proof_results.events, 1);
  assert.equal(authorizedPayload.policy_funnel.correlation.guide_to_evaluator_groups, 1);
  assert.ok(!authorizedResponse.body.includes("caller-a"));
  assert.equal(supabaseRequests, 2);
  console.log("PASS authorized metrics include aggregate private MCP and guide-funnel reports");

  const publicResponse = createResponse();
  await handler({
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.11" },
  }, publicResponse);
  const publicPayload = JSON.parse(publicResponse.body);
  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicPayload.limited, true);
  assert.ok(!Object.hasOwn(publicPayload, "mcp_adoption"));
  assert.ok(!Object.hasOwn(publicPayload, "policy_funnel"));
  assert.equal(supabaseRequests, 2);
  console.log("PASS public metrics omit private growth data and do not query Supabase");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetMcpAdoptionCacheForTests();
}

console.log("Policy growth metrics API tests passed: 2/2");
