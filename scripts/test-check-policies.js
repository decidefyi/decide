#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  classifyFetchFailureBlock,
  getCandidatePendingModelId,
  isLegacyPendingCandidate,
  LEGACY_PENDING_MODEL_ID,
  PENDING_MODEL_ID,
} from "./check-policies.js";

function testImmediateBlockOnCloudflareAnd403() {
  const result = classifyFetchFailureBlock(
    [
      "https://help.x.com/en/using-x/x-premium [browser_hook] (interstitial:cloudflare_challenge)",
      "https://help.x.com/en/using-x/x-premium [direct] (HTTP 403)",
      "https://help.x.com/en/using-x/x-premium [mirror] (interstitial:just_a_moment)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, true, "expected anti-bot failure to quarantine immediately");
  assert.match(result.reason, /^known_fetch_blocker:/, "expected a normalized blocker reason");
}

function testImmediateBlockAllowsZendesk404AsAuxiliary() {
  const result = classifyFetchFailureBlock(
    [
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [browser_hook] (interstitial:just_a_moment)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [direct] (HTTP 403)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [zendesk_api] (HTTP 404)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [mirror] (interstitial:just_a_moment)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, true, "zendesk API misses should not prevent blocker quarantine");
}

function testTransientFailureDoesNotImmediateBlock() {
  const result = classifyFetchFailureBlock(
    [
      "https://example.com/policy [direct] (timeout)",
      "https://example.com/policy [mirror] (HTTP 500)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, false, "transient failures should wait for streak-based quarantine");
  assert.equal(result.reason, "", "transient failures should not emit a blocker reason");
}

function testPlain403StillImmediateBlocks() {
  const result = classifyFetchFailureBlock("HTTP 403");

  assert.equal(result.immediateBlock, true, "plain 403 failures should quarantine immediately");
  assert.match(result.reason, /http_403/, "expected HTTP status to be normalized in blocker reason");
}

function testLegacyPendingModelDefaults() {
  assert.equal(
    getCandidatePendingModelId({}),
    LEGACY_PENDING_MODEL_ID,
    "candidates without a model id should be treated as legacy"
  );
  assert.equal(isLegacyPendingCandidate({}), true, "legacy candidates should not drive current backlog metrics");
}

function testCurrentPendingModelStaysActive() {
  const candidate = {
    pending_model_id: PENDING_MODEL_ID,
    pending_model_first_observed_utc: "2026-03-06T12:00:00Z",
  };

  assert.equal(getCandidatePendingModelId(candidate), PENDING_MODEL_ID, "expected current model id to round-trip");
  assert.equal(isLegacyPendingCandidate(candidate), false, "current-model candidates should remain active");
}

function main() {
  testImmediateBlockOnCloudflareAnd403();
  console.log("PASS check-policies immediate block on anti-bot");

  testImmediateBlockAllowsZendesk404AsAuxiliary();
  console.log("PASS check-policies zendesk auxiliary miss");

  testTransientFailureDoesNotImmediateBlock();
  console.log("PASS check-policies transient failure");

  testPlain403StillImmediateBlocks();
  console.log("PASS check-policies plain 403");

  testLegacyPendingModelDefaults();
  console.log("PASS check-policies legacy pending default");

  testCurrentPendingModelStaysActive();
  console.log("PASS check-policies current pending model");

  console.log("Check-policies tests passed: 6/6");
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
