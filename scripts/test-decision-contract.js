#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import decideHandler from "../api/decide.js";
import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
import { invokeJson } from "./test-helpers/http-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");

function loadFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
}

function assertIsoTimestamp(value, label) {
  assert.equal(typeof value, "string", `${label}: expected string`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label}: expected ISO timestamp`);
}

function assertLineage(payload, label) {
  assert.equal(typeof payload.policy_version, "string", `${label}: missing policy_version`);
  assert.ok(payload.policy_version.length > 0, `${label}: policy_version is empty`);
  assert.equal(typeof payload.source_hash, "string", `${label}: missing source_hash`);
  assert.ok(payload.source_hash.length >= 8, `${label}: source_hash looks too short`);
  assertIsoTimestamp(payload.evaluated_at, `${label}.evaluated_at`);
}

async function testDecideSingleFixture() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [{ text: "yes" }],
            },
          },
        ],
      };
    },
  });

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, fixture.expect.statusCode, "decide status mismatch");
    assert.equal(result.json?.c, fixture.expect.c, "decide c mismatch");
    assert.equal(result.json?.v, fixture.expect.v, "decide v mismatch");
    assert.equal(typeof result.json?.request_id, "string", "decide request_id missing");
    assertLineage(result.json, "decide");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
  }
}

async function testPolicyV1Fixture() {
  const fixture = loadFixture("policy-refund-v1.json");
  const result = await invokeJson(v1PolicyDispatcher, fixture.request);
  assert.equal(result.statusCode, fixture.expect.statusCode, "policy status mismatch");
  assert.equal(result.json?.verdict, fixture.expect.verdict, "policy verdict mismatch");
  assert.equal(result.json?.code, fixture.expect.code, "policy code mismatch");
  assertLineage(result.json, "policy_v1");
}

async function testWorkflowFixture() {
  const fixture = loadFixture("workflow-zendesk-refund.json");
  const first = await invokeJson(zendeskWorkflowDispatcher, fixture.request);
  assert.equal(first.statusCode, fixture.expect.statusCode, "workflow status mismatch");
  assert.equal(first.json?.ok, fixture.expect.ok, "workflow ok mismatch");
  assert.equal(first.json?.flow, fixture.expect.flow, "workflow flow mismatch");
  assert.equal(first.json?.decision?.c, fixture.expect.decision, "workflow decision mismatch");
  assert.equal(first.json?.action?.type, fixture.expect.action, "workflow action mismatch");
  assert.equal(first.json?.policy?.verdict, fixture.expect.policy_verdict, "workflow policy verdict mismatch");
  assertLineage(first.json, "workflow");
  assertLineage(first.json?.policy || {}, "workflow.policy");

  const second = await invokeJson(zendeskWorkflowDispatcher, fixture.request);
  assert.equal(second.statusCode, fixture.expect.statusCode, "workflow replay status mismatch");
  assert.equal(second.json?.idempotent_replay, true, "workflow idempotent replay expected");
}

async function main() {
  const tests = [
    ["decide-single", testDecideSingleFixture],
    ["policy-v1-dispatch", testPolicyV1Fixture],
    ["workflow-zendesk-dispatch", testWorkflowFixture],
  ];

  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  }
  console.log(`Contract tests passed: ${passed}/${tests.length}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
