#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildChangeKey,
  classifyFetchFailureBlock,
  evaluateSignalWindow,
  getCandidatePendingModelId,
  getCrossRunWindowRequiredForCandidate,
  isHighSignalWindowCandidate,
  isLegacyPendingCandidate,
  LEGACY_PENDING_MODEL_ID,
  PENDING_MODEL_ID,
  semanticSignaturesStable,
  toZendeskHelpCenterApiTarget,
} from "./check-policies.js";

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function configuredCrossRunWindowSize() {
  return Math.max(2, envInt("POLICY_CHECK_CROSS_RUN_WINDOW_SIZE", 6));
}

function configuredDefaultWindowRequired() {
  const size = configuredCrossRunWindowSize();
  return Math.max(2, Math.min(size, envInt("POLICY_CHECK_CROSS_RUN_WINDOW_REQUIRED", 3)));
}

function configuredHighSignalWindowRequired() {
  const size = configuredCrossRunWindowSize();
  return Math.max(2, Math.min(size, envInt("POLICY_CHECK_HIGH_SIGNAL_WINDOW_REQUIRED", 2)));
}

function configuredHighSignalMinPolicyHits() {
  return Math.max(1, envInt("POLICY_CHECK_HIGH_SIGNAL_MIN_POLICY_HITS", 2));
}

function configuredHighSignalMinLines() {
  return Math.max(2, envInt("POLICY_CHECK_HIGH_SIGNAL_MIN_LINES", 6));
}

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

function testHighSignalWindowCandidateDetection() {
  const minHits = configuredHighSignalMinPolicyHits();
  const minLines = configuredHighSignalMinLines();
  assert.equal(
    isHighSignalWindowCandidate({
      semanticSignature: "cancel:anytime",
      quality: { passed: true, policyKeywordHits: minHits, lineCount: minLines },
    }),
    true,
    "high-signal candidates should require semantic signal + quality thresholds"
  );
  assert.equal(
    isHighSignalWindowCandidate({
      semanticSignature: "",
      quality: { passed: true, policyKeywordHits: 3, lineCount: 9 },
    }),
    false,
    "semantic signature is required for high-signal classification"
  );
}

function testAdaptiveWindowRequiredForCandidate() {
  const minHits = configuredHighSignalMinPolicyHits();
  const minLines = configuredHighSignalMinLines();
  const defaultRequired = configuredDefaultWindowRequired();
  const expectedHighSignalRequired = Math.min(defaultRequired, configuredHighSignalWindowRequired());

  const highSignalRequired = getCrossRunWindowRequiredForCandidate({
    semanticSignature: "cancel:anytime",
    quality: { passed: true, policyKeywordHits: minHits, lineCount: minLines },
  });
  assert.equal(
    highSignalRequired,
    expectedHighSignalRequired,
    "high-signal candidates should use the configured relaxed window requirement"
  );

  const lowSignalRequired = getCrossRunWindowRequiredForCandidate({
    semanticSignature: "cancel:anytime",
    quality: { passed: true, policyKeywordHits: Math.max(0, minHits - 1), lineCount: minLines },
  });
  assert.equal(lowSignalRequired, defaultRequired, "low-signal candidates should keep the default required window");
}

function testEvaluateSignalWindowSupportsRequiredOverride() {
  const signals = ["sig:a", "sig:a", "sig:b"];
  const relaxedDecision = evaluateSignalWindow(signals, 2);
  assert.equal(relaxedDecision.required, 2, "expected required vote count override to be applied");
  assert.equal(relaxedDecision.hashDecision, "sig:a", "expected top signal to win with relaxed threshold");

  const strictDecision = evaluateSignalWindow(signals, 3);
  assert.equal(strictDecision.required, 3, "expected strict required vote count to be applied");
  assert.equal(strictDecision.hashDecision, "", "expected no winner when strict threshold is unmet");
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

  testHighSignalWindowCandidateDetection();
  console.log("PASS check-policies high-signal candidate detection");

  testAdaptiveWindowRequiredForCandidate();
  console.log("PASS check-policies adaptive window required votes");

  testEvaluateSignalWindowSupportsRequiredOverride();
  console.log("PASS check-policies signal window required override");

  console.log("Check-policies tests passed: 18/18");
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
