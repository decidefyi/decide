#!/usr/bin/env node

import assert from "node:assert/strict";

import handler, {
  applyPolicyEventReviews,
  attachPolicyEventDetails,
} from "../api/policy-alerts.js";

function createResponseRecorder() {
  const headers = new Map();
  let body = "";
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    end(value = "") {
      body = String(value || "");
    },
    read() {
      return {
        statusCode: this.statusCode,
        headers,
        body,
      };
    },
  };
}

async function invoke(query = {}, method = "GET") {
  const req = { method, query };
  const res = createResponseRecorder();
  await handler(req, res);
  const { statusCode, body } = res.read();
  let json = null;
  try {
    json = JSON.parse(body || "{}");
  } catch {
    json = null;
  }
  return { statusCode, json };
}

function assertCommonPayload(result, expectedState, expectedLimit, expectedIncludeZero = true) {
  assert.equal(result.statusCode, 200, "expected status 200");
  assert.ok(result.json && typeof result.json === "object", "expected JSON payload");
  assert.equal(result.json.ok, true, "ok should be true");
  assert.equal(result.json.schema_version, "policy_alerts_v2", "schema version mismatch");
  assert.equal(result.json.trust_model, "review_gated_change_claims_v1", "trust model mismatch");
  assert.equal(result.json.state, expectedState, "state mismatch");
  assert.equal(result.json.limit, expectedLimit, "limit mismatch");
  assert.equal(result.json.include_zero, expectedIncludeZero, "include_zero mismatch");
  assert.equal(typeof result.json.source, "string", "source must be string");
  assert.ok(Array.isArray(result.json.alerts), "alerts must be array");
}

function assertNoLegacySourceObject(result) {
  const source = result?.json?.source;
  assert.notEqual(typeof source, "object", "legacy source object should not be returned");
}

function assertAlertShapeIfPresent(result) {
  const alerts = Array.isArray(result?.json?.alerts) ? result.json.alerts : [];
  if (alerts.length === 0) return;
  const first = alerts[0];
  assert.equal(typeof first.changed_count, "number", "changed_count should be numeric");
  assert.equal(typeof first.pending_count, "number", "pending_count should be numeric");
  assert.equal(typeof first.status, "string", "status should be string");
  assert.equal(typeof first.state, "string", "state should be string");
  assert.equal(typeof first.run_url, "string", "run_url should be string");
  assert.ok(Array.isArray(first.sample_details), "sample_details should be an array");
  assert.equal(typeof first.rulebook_status, "string", "rulebook_status should be explicit");
  assert.equal(typeof first.decision_rule_impact, "string", "decision_rule_impact should be explicit");
  assert.equal(typeof first.detected_changed_count, "number", "detected_changed_count should be numeric");
  assert.equal(typeof first.confirmed_changed_count, "number", "confirmed_changed_count should be numeric");
  assert.equal(typeof first.unresolved_changed_count, "number", "unresolved_changed_count should be numeric");
  assert.equal(typeof first.dismissed_signal_count, "number", "dismissed_signal_count should be numeric");
  assert.equal(typeof first.change_review_state, "string", "change_review_state should be explicit");
  for (const detail of first.sample_details) {
    assert.equal(typeof detail.review_status, "string", "sample review_status should be explicit");
    assert.equal(typeof detail.rulebook_updated, "boolean", "sample rulebook_updated should be boolean");
  }
}

function testAppliesRecordedPolicyEventReviews() {
  const alerts = applyPolicyEventReviews(
    [{
      sample_details: [{
        event_id: "refund:adobe:hash-123",
        review_status: "unreviewed",
        rulebook_updated: false,
      }],
    }],
    [{
      event_id: "refund:adobe:hash-123",
      review_status: "rulebook_updated",
      reviewed_at_utc: "2026-07-15T15:00:00Z",
      reviewed_by: "ops@example.com",
      review_note: "Updated verified refund window.",
      rulebook_updated: true,
      rulebook_version_after: "2026-07-15",
    }]
  );

  assert.equal(alerts[0].sample_details[0].review_status, "rulebook_updated");
  assert.equal(alerts[0].sample_details[0].rulebook_updated, true);
  assert.equal(alerts[0].sample_details[0].rulebook_version_after, "2026-07-15");
}

function testBackfillsMissingPolicyEventDetails() {
  const alerts = attachPolicyEventDetails(
    [{
      date_utc: "2026-07-15",
      changed_count: 2,
      sample_details: [],
    }],
    [
      {
        event_id: "refund:adobe:hash-123",
        date_utc: "2026-07-15",
        emitted_at_utc: "2026-07-15T15:00:00Z",
        policy: "refund",
        vendor: "adobe",
        source_url: "https://example.com/adobe",
        semantic_diff_summary: "Refund language changed.",
        review_status: "rulebook_updated",
        rulebook_updated: true,
        rulebook_version_after: "2026-07-16",
      },
      {
        event_id: "trial:grammarly:hash-456",
        date_utc: "2026-07-15",
        emitted_at_utc: "2026-07-15T14:00:00Z",
        policy: "trial",
        vendor: "grammarly",
        source_url: "https://example.com/grammarly",
        semantic_diff_summary: "Trial offer changed.",
      },
    ]
  );

  assert.equal(alerts[0].sample_details.length, 2);
  assert.deepEqual(
    alerts[0].sample_details.map((detail) => detail.event_id),
    ["refund:adobe:hash-123", "trial:grammarly:hash-456"]
  );
  assert.equal(alerts[0].sample_details[0].review_status, "rulebook_updated");
  assert.equal(alerts[0].sample_details[0].rulebook_updated, true);
  assert.equal(alerts[0].sample_details[1].review_status, "unreviewed");
  assert.equal(alerts[0].sample_details[1].rulebook_updated, false);
}

function createSupabaseFetchFixture({ dailyRows = [], policyEvents = [] } = {}) {
  return async function fetchFixture(rawUrl) {
    const url = new URL(String(rawUrl));
    let data = [];
    if (url.pathname.endsWith("/rest/v1/policy_daily_alerts")) {
      data = dailyRows;
    } else if (url.pathname.endsWith("/rest/v1/policy_events")) {
      data = policyEvents;
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(data);
      },
    };
  };
}

async function testSupabaseFeedGatesChangeClaimsOnReview() {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    POLICY_ALERTS_ALLOW_FILE_FALLBACK: process.env.POLICY_ALERTS_ALLOW_FILE_FALLBACK,
    POLICY_SUPABASE_SYNC_ENABLED: process.env.POLICY_SUPABASE_SYNC_ENABLED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
  };
  const dailyRows = [
    {
      date_utc: "2026-07-12",
      generated_at_utc: "2026-07-12T12:00:00Z",
      changed_count: 1,
      dedupe_changed_count: 1,
      reported_changed_count: 1,
      changed_sample: ["refund:adobe"],
      sample_details: [],
      by_policy: { refund: 1 },
      strict_eligible: false,
      signal_confidence: "manual-review",
      status: "review",
      state: "needs_review",
      raw: { change_review_state: "review_required" },
    },
    {
      date_utc: "2026-07-11",
      generated_at_utc: "2026-07-11T12:00:00Z",
      changed_count: 1,
      dedupe_changed_count: 1,
      reported_changed_count: 1,
      changed_sample: ["trial:wix"],
      sample_details: [],
      by_policy: { trial: 1 },
      strict_eligible: true,
      signal_confidence: "high-confidence",
      status: "confirmed",
      state: "verified",
    },
    {
      date_utc: "2026-07-10",
      generated_at_utc: "2026-07-10T12:00:00Z",
      changed_count: 1,
      dedupe_changed_count: 1,
      reported_changed_count: 1,
      changed_sample: ["refund:linkedin_premium"],
      sample_details: [],
      by_policy: { refund: 1 },
      strict_eligible: true,
      signal_confidence: "high-confidence",
      status: "confirmed",
      state: "verified",
    },
  ];
  const policyEvents = [
    {
      event_id: "refund:adobe:accepted-hash",
      date_utc: "2026-07-12",
      emitted_at_utc: "2026-07-12T11:00:00Z",
      policy: "refund",
      vendor: "adobe",
      review_status: "reviewed_no_rule_change",
    },
    {
      event_id: "trial:wix:dismissed-hash",
      date_utc: "2026-07-11",
      emitted_at_utc: "2026-07-11T11:00:00Z",
      policy: "trial",
      vendor: "wix",
      review_status: "dismissed_false_signal",
    },
    {
      event_id: "refund:linkedin_premium:historical-hash",
      date_utc: "2026-07-10",
      emitted_at_utc: "2026-07-10T11:00:00Z",
      policy: "refund",
      vendor: "linkedin_premium",
      review_status: "historical_unreviewed",
    },
  ];

  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.POLICY_SUPABASE_SYNC_ENABLED = "1";
    process.env.POLICY_ALERTS_ALLOW_FILE_FALLBACK = "0";
    globalThis.fetch = createSupabaseFetchFixture({ dailyRows, policyEvents });

    const confirmed = await invoke({ state: "confirmed", limit: "10" });
    assertCommonPayload(confirmed, "confirmed", 10, true);
    assert.deepEqual(
      confirmed.json.alerts.map((alert) => alert.date_utc),
      ["2026-07-12", "2026-07-11"],
      "confirmed feed must exclude unresolved change evidence"
    );
    assert.equal(confirmed.json.alerts[0].changed_count, 1, "reviewed source change should remain confirmed");
    assert.equal(confirmed.json.alerts[0].confirmed_changed_count, 1, "reviewed source change count mismatch");
    assert.equal(confirmed.json.alerts[1].changed_count, 0, "dismissed false signal must not count as a change");
    assert.equal(confirmed.json.alerts[1].dismissed_signal_count, 1, "dismissed signal count mismatch");
    assert.equal(confirmed.json.alerts[1].detected_changed_count, 1, "audit detection count must be retained");

    const review = await invoke({ state: "review", limit: "10" });
    assertCommonPayload(review, "review", 10, true);
    assert.deepEqual(
      review.json.alerts.map((alert) => alert.date_utc),
      ["2026-07-10"],
      "review feed must contain unresolved historical evidence only"
    );
    assert.equal(review.json.alerts[0].status, "review");
    assert.equal(review.json.alerts[0].state, "needs_review");
    assert.equal(review.json.alerts[0].strict_eligible, false);
    assert.equal(review.json.alerts[0].signal_confidence, "manual-review");
    assert.equal(review.json.alerts[0].unresolved_changed_count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  testAppliesRecordedPolicyEventReviews();
  console.log("PASS policy-alerts-api applies recorded event reviews");
  testBackfillsMissingPolicyEventDetails();
  console.log("PASS policy-alerts-api backfills missing event details");
  await testSupabaseFeedGatesChangeClaimsOnReview();
  console.log("PASS policy-alerts-api gates change claims on recorded review");

  process.env.POLICY_SUPABASE_SYNC_ENABLED = "0";
  process.env.POLICY_ALERTS_ALLOW_FILE_FALLBACK = "1";

  const confirmed = await invoke({ state: "confirmed", limit: "3" });
  assertCommonPayload(confirmed, "confirmed", 3, true);
  assertNoLegacySourceObject(confirmed);
  assertAlertShapeIfPresent(confirmed);
  console.log("PASS policy-alerts-api-confirmed");

  const review = await invoke({ state: "review", limit: "2" });
  assertCommonPayload(review, "review", 2, true);
  assertNoLegacySourceObject(review);
  assertAlertShapeIfPresent(review);
  console.log("PASS policy-alerts-api-review");

  const allDefault = await invoke({ state: "all", limit: "120" });
  assertCommonPayload(allDefault, "all", 100, true);
  assertNoLegacySourceObject(allDefault);
  const allIncludeZero = await invoke({ state: "all", limit: "120", include_zero: "1" });
  assertCommonPayload(allIncludeZero, "all", 100, true);
  assert.equal(
    allDefault.json?.alerts?.length || 0,
    allIncludeZero.json?.alerts?.length || 0,
    "default include_zero behavior should match include_zero=1"
  );
  const allExcludeZero = await invoke({ state: "all", limit: "120", include_zero: "0" });
  assertCommonPayload(allExcludeZero, "all", 100, false);
  const includeZerosCount = (allIncludeZero.json?.alerts || []).filter((entry) => Number(entry?.changed_count || 0) === 0).length;
  const excludeZerosCount = (allExcludeZero.json?.alerts || []).filter((entry) => Number(entry?.changed_count || 0) === 0).length;
  assert.equal(excludeZerosCount, 0, "include_zero=0 should remove zero-change rows");
  assert.ok(
    (allExcludeZero.json?.alerts?.length || 0) <= (allIncludeZero.json?.alerts?.length || 0),
    "include_zero=0 should not return more rows than include_zero=1"
  );
  assert.ok(
    includeZerosCount >= excludeZerosCount,
    "include_zero=1 should include at least as many zero-change rows as include_zero=0"
  );
  console.log("PASS policy-alerts-api-include-zero");

  const fallbackState = await invoke({ state: "invalid-state", limit: "1" });
  assertCommonPayload(fallbackState, "confirmed", 1, true);
  assertNoLegacySourceObject(fallbackState);
  console.log("PASS policy-alerts-api-state-normalization");

  const methodNotAllowed = await invoke({}, "POST");
  assert.equal(methodNotAllowed.statusCode, 405, "POST should be method_not_allowed");
  assert.equal(methodNotAllowed.json?.ok, false, "POST should return ok=false");
  assert.equal(methodNotAllowed.json?.error, "method_not_allowed", "POST error mismatch");
  console.log("PASS policy-alerts-api-method-guard");

  process.env.POLICY_ALERTS_ALLOW_FILE_FALLBACK = "0";
  const noFallback = await invoke({ state: "all", limit: "5" });
  assert.equal(noFallback.statusCode, 503, "fallback disabled without Supabase should fail");
  assert.equal(noFallback.json?.ok, false, "fallback disabled should return ok=false");
  assert.equal(noFallback.json?.error, "supabase_sync_not_enabled", "fallback-disabled error mismatch");
  console.log("PASS policy-alerts-api-no-fallback-guard");
  process.env.POLICY_ALERTS_ALLOW_FILE_FALLBACK = "1";

  console.log("Policy alerts API tests passed: 9/9");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
