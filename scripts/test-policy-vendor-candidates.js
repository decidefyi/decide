#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  monitorPolicyVendorCandidates,
  toObservationSlot,
} from "../lib/policy-vendor-candidate-monitor.js";

const registry = {
  admission: {
    observation_interval_hours: 6,
    observation_window: 120,
  },
  candidates: {
    sample: {
      allowed_hosts: ["help.example.com"],
      policies: {
        refund: {
          monitor: "zendesk_api",
          fetch_url: "https://help.example.com/api/v2/help_center/en-us/articles/1.json",
        },
        return: {
          monitor: "manual_review",
          review_status: "pending",
        },
      },
    },
  },
};

function successfulFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      article: {
        title: "Official refund policy",
        body: `<p>${"Refund and subscription policy evidence. ".repeat(8)}</p>`,
        updated_at: "2026-07-29T10:00:00Z",
      },
    }),
  });
}

async function testObservationSlotsCannotBeInflatedByReruns() {
  const first = await monitorPolicyVendorCandidates({
    registry,
    state: {},
    now: new Date("2026-07-30T01:00:00Z"),
    fetchImpl: successfulFetch,
  });
  const rerun = await monitorPolicyVendorCandidates({
    registry,
    state: first.state,
    now: new Date("2026-07-30T05:59:00Z"),
    fetchImpl: successfulFetch,
  });
  const nextSlot = await monitorPolicyVendorCandidates({
    registry,
    state: rerun.state,
    now: new Date("2026-07-30T06:01:00Z"),
    fetchImpl: successfulFetch,
  });

  assert.equal(toObservationSlot(new Date("2026-07-30T05:59:00Z")), "2026-07-30T00:00Z");
  assert.equal(rerun.state.candidates.sample.policies.refund.observation_count, 1);
  assert.equal(nextSlot.state.candidates.sample.policies.refund.observation_count, 2);
  assert.equal(nextSlot.state.candidates.sample.policies.refund.success_rate, 1);
  assert.equal(nextSlot.results.find((result) => result.policy === "return").status, "manual_review");
}

async function testFailedFetchIsRecordedWithoutThrowing() {
  const first = await monitorPolicyVendorCandidates({
    registry,
    state: {},
    now: new Date("2026-07-30T12:00:00Z"),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  const result = await monitorPolicyVendorCandidates({
    registry,
    state: first.state,
    now: new Date("2026-07-30T13:00:00Z"),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  const policyState = result.state.candidates.sample.policies.refund;

  assert.equal(policyState.last_status, "failure");
  assert.equal(policyState.consecutive_failures, 1);
  assert.equal(policyState.observation_count, 1);
  assert.equal(policyState.last_http_status, 403);
  assert.match(policyState.last_error, /http_403/);
}

async function testOfficialDocumentSourcesAreValidatedAndFetchedOnce() {
  let fetchCount = 0;
  const officialRegistry = {
    admission: registry.admission,
    candidates: {
      sample: {
        allowed_hosts: ["support.example.com"],
        policies: {
          refund: {
            monitor: "official_document",
            fetch_url: "https://support.example.com/billing-policy",
            required_terms: ["refund", "subscription"],
          },
          cancel: {
            monitor: "official_document",
            fetch_url: "https://support.example.com/billing-policy",
            required_terms: ["cancel", "subscription"],
          },
        },
      },
    },
  };
  const result = await monitorPolicyVendorCandidates({
    registry: officialRegistry,
    state: {},
    now: new Date("2026-07-30T18:00:00Z"),
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => `<main>${"Official refund, cancel, and subscription policy. ".repeat(8)}</main>`,
      };
    },
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.results.filter((entry) => entry.status === "success").length, 2);
  assert.equal(result.state.candidates.sample.policies.refund.hash_stability_rate, 1);
}

async function testChallengeDocumentCannotCountAsEvidence() {
  const challengeRegistry = {
    admission: registry.admission,
    candidates: {
      sample: {
        allowed_hosts: ["support.example.com"],
        policies: {
          refund: {
            monitor: "official_document",
            fetch_url: "https://support.example.com/refunds",
            required_terms: ["refund"],
          },
        },
      },
    },
  };
  const result = await monitorPolicyVendorCandidates({
    registry: challengeRegistry,
    state: {},
    now: new Date("2026-07-31T00:00:00Z"),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => `<html><title>Just a moment...</title><body>${"Verify you are human. ".repeat(20)}</body></html>`,
    }),
  });

  const policyState = result.state.candidates.sample.policies.refund;
  assert.equal(policyState.last_status, "failure");
  assert.match(policyState.last_error, /challenge_document_detected/);
}

await testObservationSlotsCannotBeInflatedByReruns();
console.log("PASS candidate burn-in deduplicates reruns within each six-hour observation slot");
await testFailedFetchIsRecordedWithoutThrowing();
console.log("PASS candidate burn-in records source failures without failing current notaries");
await testOfficialDocumentSourcesAreValidatedAndFetchedOnce();
console.log("PASS official documents are content-validated and shared URLs are fetched once");
await testChallengeDocumentCannotCountAsEvidence();
console.log("PASS challenge documents cannot count as policy evidence");
console.log("Policy vendor candidate tests passed: 4/4");
