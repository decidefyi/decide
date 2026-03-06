#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildChangeKey,
  classifyFetchFailureBlock,
  getCandidatePendingModelId,
  isLegacyPendingCandidate,
  LEGACY_PENDING_MODEL_ID,
  PENDING_MODEL_ID,
  semanticSignaturesStable,
  toZendeskHelpCenterApiTarget,
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

function testZendeskApiTargetForArticle() {
  const result = toZendeskHelpCenterApiTarget(
    "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription"
  );

  assert.deepEqual(result, {
    kind: "article",
    apiUrl: "https://help.crunchyroll.com/api/v2/help_center/en-us/articles/4963792118804.json",
  });
}

function testZendeskApiTargetForSection() {
  const result = toZendeskHelpCenterApiTarget(
    "https://help.crunchyroll.com/hc/en-us/sections/21770446775956-Policies"
  );

  assert.deepEqual(result, {
    kind: "section",
    apiUrl: "https://help.crunchyroll.com/api/v2/help_center/en-us/sections/21770446775956/articles.json?per_page=100",
  });
}

function testZendeskApiTargetRejectsUnsupportedPaths() {
  const result = toZendeskHelpCenterApiTarget("https://help.x.com/en/using-x/x-premium");
  assert.equal(result, null, "non-help-center URLs should not produce a zendesk API target");
}

function testSemanticSignaturesStableForEmptyTokens() {
  assert.equal(
    semanticSignaturesStable("", ""),
    true,
    "empty semantic signatures should be treated as stable across runs"
  );
}

function testSemanticSignaturesStableForMatchingNonEmptyTokens() {
  assert.equal(
    semanticSignaturesStable("cancel:anytime|billing:auto_renew", "cancel:anytime|billing:auto_renew"),
    true,
    "matching semantic signatures should be stable"
  );
}

function testSemanticSignaturesStableRejectsMixedOrDifferentTokens() {
  assert.equal(
    semanticSignaturesStable("", "trial:auto_converts_to_paid"),
    false,
    "missing vs present semantic signature should not be stable"
  );
  assert.equal(
    semanticSignaturesStable("cancel:anytime", "cancel:fee_or_penalty"),
    false,
    "different semantic signatures should not be stable"
  );
}

function testBuildChangeKeyPrefersSemanticSignature() {
  const value = buildChangeKey("abc123hash", "cancel:anytime|billing:auto_renew");
  assert.equal(value, "cancel:anytime|billing:auto_renew", "semantic signature should drive change key when present");
}

function testBuildChangeKeyFallsBackToHash() {
  const value = buildChangeKey("abc123hash", "");
  assert.equal(value, "abc123hash", "hash should be used when semantic signature is absent");
}

function testBuildChangeKeyHandlesMissingValues() {
  const value = buildChangeKey("", "");
  assert.equal(value, "", "empty inputs should produce an empty change key");
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

  testZendeskApiTargetForArticle();
  console.log("PASS check-policies zendesk article target");

  testZendeskApiTargetForSection();
  console.log("PASS check-policies zendesk section target");

  testZendeskApiTargetRejectsUnsupportedPaths();
  console.log("PASS check-policies zendesk unsupported path");

  testSemanticSignaturesStableForEmptyTokens();
  console.log("PASS check-policies semantic stability empty signatures");

  testSemanticSignaturesStableForMatchingNonEmptyTokens();
  console.log("PASS check-policies semantic stability matching signatures");

  testSemanticSignaturesStableRejectsMixedOrDifferentTokens();
  console.log("PASS check-policies semantic stability rejects mismatches");

  testBuildChangeKeyPrefersSemanticSignature();
  console.log("PASS check-policies change key prefers semantic signature");

  testBuildChangeKeyFallsBackToHash();
  console.log("PASS check-policies change key fallback hash");

  testBuildChangeKeyHandlesMissingValues();
  console.log("PASS check-policies change key missing inputs");

  console.log("Check-policies tests passed: 15/15");
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
