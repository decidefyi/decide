#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildPolicyReviewUpdate } from "../lib/policy-review.js";

function testBuildsAuditableNoRuleChangeReview() {
  const result = buildPolicyReviewUpdate({
    eventId: "refund:linkedin_premium:abc123",
    status: "reviewed_no_rule_change",
    reviewedBy: "ops@example.com",
    note: "The seven-day eligibility window is unchanged; only page metadata moved.",
    now: new Date("2026-07-15T15:00:00Z"),
  });

  assert.equal(result.event_id, "refund:linkedin_premium:abc123");
  assert.equal(result.review_status, "reviewed_no_rule_change");
  assert.equal(result.rulebook_updated, false);
  assert.equal(result.reviewed_at_utc, "2026-07-15T15:00:00.000Z");
}

function testRulebookUpdateRequiresVersion() {
  assert.throws(
    () => buildPolicyReviewUpdate({
      eventId: "refund:adobe:def456",
      status: "rulebook_updated",
      reviewedBy: "ops@example.com",
      note: "Verified a material policy change.",
      now: new Date("2026-07-15T15:00:00Z"),
    }),
    /rulebook version/i
  );
}

testBuildsAuditableNoRuleChangeReview();
console.log("PASS policy review builds auditable no-rule-change decision");
testRulebookUpdateRequiresVersion();
console.log("PASS policy review requires version for rulebook updates");
console.log("Policy review tests passed: 2/2");
