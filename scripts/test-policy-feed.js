#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");

function loadFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
}

function runFixture(fileName) {
  const fixture = loadFixture(fileName);
  const merged = mergePolicyAlertFeed({
    existingAlerts: fixture.existing,
    entry: fixture.entry,
    maxEntries: 120,
    lowSignalThreshold: 1,
    lowSignalLookback: 6,
  });

  assert.equal(merged.published, fixture.expect.published, `${fixture.name}: published mismatch`);
  if (typeof fixture.expect.reason === "string") {
    assert.equal(merged.reason, fixture.expect.reason, `${fixture.name}: suppression reason mismatch`);
  }
  assert.ok(Array.isArray(merged.alerts), `${fixture.name}: alerts must be an array`);
  assert.ok(typeof merged.signature === "string" && merged.signature.length >= 8, `${fixture.name}: signature missing`);
  return merged;
}

function testIdempotentDuplicateSuppression() {
  const actualChange = loadFixture("policy-feed-actual-change.json");
  const first = mergePolicyAlertFeed({
    existingAlerts: actualChange.existing,
    entry: actualChange.entry,
    maxEntries: 120,
    lowSignalThreshold: 1,
    lowSignalLookback: 6,
  });
  assert.equal(first.published, true, "first merge should publish");

  const second = mergePolicyAlertFeed({
    existingAlerts: first.alerts,
    entry: actualChange.entry,
    maxEntries: 120,
    lowSignalThreshold: 1,
    lowSignalLookback: 6,
  });
  assert.equal(second.published, false, "repeated identical merge should be suppressed");
  assert.equal(second.reason, "duplicate_latest", "duplicate reason mismatch");
}

function main() {
  runFixture("policy-feed-no-change.json");
  console.log("PASS policy-feed-no-change");

  runFixture("policy-feed-actual-change.json");
  console.log("PASS policy-feed-actual-change");

  testIdempotentDuplicateSuppression();
  console.log("PASS policy-feed-idempotent-duplicate");

  console.log("Policy-feed tests passed: 3/3");
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
