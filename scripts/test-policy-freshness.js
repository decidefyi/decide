#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildPolicyFreshnessReport,
  evaluatePolicyFreshness,
} from "../lib/policy-freshness.js";

function testMarksExpiredHumanVerificationStale() {
  const result = evaluatePolicyFreshness({
    policy: "refund",
    rulesVersion: "2026-02-15",
    lastChecked: "2026-02-01",
    lastVerifiedUtc: "2026-03-02T06:47:25Z",
    now: new Date("2026-07-15T12:00:00Z"),
    maxAgeDays: 90,
  });

  assert.equal(result.status, "stale");
  assert.equal(result.stale, true);
  assert.equal(result.reason, "human_verification_expired");
  assert.equal(result.verified_age_days, 135);
}

function testReportSeparatesMonitoringFromRulebookPromotion() {
  const report = buildPolicyFreshnessReport({
    policies: [
      {
        policy: "refund",
        rulesVersion: "2026-02-15",
        lastChecked: "2026-02-01",
        lastVerifiedUtc: "2026-03-02T06:47:25Z",
      },
      {
        policy: "trial",
        rulesVersion: "2026-07-01",
        lastChecked: "2026-07-14",
        lastVerifiedUtc: "2026-07-14T08:00:00Z",
      },
    ],
    now: new Date("2026-07-15T12:00:00Z"),
    maxAgeDays: 90,
  });

  assert.equal(report.status, "stale");
  assert.equal(report.stale_policy_count, 1);
  assert.equal(report.monitoring_mutates_rulebook, false);
  assert.deepEqual(report.action_required, ["review_and_version:refund"]);
}

testMarksExpiredHumanVerificationStale();
console.log("PASS policy freshness marks expired human verification stale");
testReportSeparatesMonitoringFromRulebookPromotion();
console.log("PASS policy freshness separates monitoring from rulebook promotion");
console.log("Policy freshness tests passed: 2/2");
