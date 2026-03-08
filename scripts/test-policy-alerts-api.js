#!/usr/bin/env node

import assert from "node:assert/strict";

import handler from "../api/policy-alerts.js";

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

function assertCommonPayload(result, expectedState, expectedLimit) {
  assert.equal(result.statusCode, 200, "expected status 200");
  assert.ok(result.json && typeof result.json === "object", "expected JSON payload");
  assert.equal(result.json.ok, true, "ok should be true");
  assert.equal(result.json.schema_version, "policy_alerts_v2", "schema version mismatch");
  assert.equal(result.json.state, expectedState, "state mismatch");
  assert.equal(result.json.limit, expectedLimit, "limit mismatch");
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
}

async function main() {
  process.env.POLICY_SUPABASE_SYNC_ENABLED = "0";

  const confirmed = await invoke({ state: "confirmed", limit: "3" });
  assertCommonPayload(confirmed, "confirmed", 3);
  assertNoLegacySourceObject(confirmed);
  assertAlertShapeIfPresent(confirmed);
  console.log("PASS policy-alerts-api-confirmed");

  const review = await invoke({ state: "review", limit: "2" });
  assertCommonPayload(review, "review", 2);
  assertNoLegacySourceObject(review);
  assertAlertShapeIfPresent(review);
  console.log("PASS policy-alerts-api-review");

  const fallbackState = await invoke({ state: "invalid-state", limit: "1" });
  assertCommonPayload(fallbackState, "confirmed", 1);
  assertNoLegacySourceObject(fallbackState);
  console.log("PASS policy-alerts-api-state-normalization");

  const methodNotAllowed = await invoke({}, "POST");
  assert.equal(methodNotAllowed.statusCode, 405, "POST should be method_not_allowed");
  assert.equal(methodNotAllowed.json?.ok, false, "POST should return ok=false");
  assert.equal(methodNotAllowed.json?.error, "method_not_allowed", "POST error mismatch");
  console.log("PASS policy-alerts-api-method-guard");

  console.log("Policy alerts API tests passed: 4/4");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
