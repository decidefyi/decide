#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import decideHandler from "../api/decide.js";
import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
import {
  auditTrustedAdapterImplementation,
  getTrustedAdapterManifest,
} from "../lib/trusted-adapters.js";
import { invokeJson } from "./test-helpers/http-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");

function loadFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
}

function loadJsonFromRepo(...segments) {
  return JSON.parse(readFileSync(join(__dirname, "..", ...segments), "utf8"));
}

function loadPublicRulebookConformanceFixture(fileName) {
  return loadJsonFromRepo("public", "conformance", "rulebook-v1", fileName);
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

function assertUnknownField(errors, expectedField, label) {
  assert.ok(Array.isArray(errors), `${label}: errors missing`);
  assert.ok(
    errors.some((entry) => entry?.code === "unknown_field" && entry?.field === expectedField),
    `${label}: expected unknown_field for ${expectedField}`
  );
}

async function testDecideSingleFixture() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
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
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideApiKeyFixture() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "decide-auth-token";
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
    const unauthorized = await invokeJson(decideHandler, fixture.request);
    assert.equal(unauthorized.statusCode, 401, "decide unauthorized status mismatch");
    assert.equal(unauthorized.json?.error, "DECIDE_API_UNAUTHORIZED", "decide unauthorized error mismatch");

    const authorized = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-api-key": "decide-auth-token",
      },
    });
    assert.equal(authorized.statusCode, fixture.expect.statusCode, "decide authorized status mismatch");
    assert.equal(authorized.json?.c, fixture.expect.c, "decide authorized c mismatch");
    assert.equal(authorized.json?.v, fixture.expect.v, "decide authorized v mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRuntimeFixture() {
  const fixture = loadFixture("decide-runtime.json");
  const sensitiveInputValue = "sk_live_should_not_echo";
  fixture.request.body.context.inputs.api_key = sensitiveInputValue;
  fixture.request.body.context.inputs.access_token = "tok_should_not_echo";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    decision: {
                      recommended_option: "Burst packs",
                      confidence: 1.2,
                    },
                    scorecard: [
                      { option: "Burst packs", score: 8.7, confidence: 1.1, impact: "high projected expansion", risk: "low", rank: 1 },
                      { option: "Automatic overage", score: 8.4, confidence: 0.67, impact: "high expansion with trust risk", risk: "high", rank: 2 },
                      { option: "Hybrid grace + overage", score: 8.2, confidence: 0.7, impact: "balanced expansion and retention", risk: "medium", rank: 3 },
                    ],
                    tradeoffs: [],
                    next_actions: [],
                    citations: [],
                  }),
                },
              ],
            },
          },
        ],
      };
    },
  });

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, fixture.expect.statusCode, "decide runtime status mismatch");
    assert.equal(result.json?.status, "ok", "decide runtime status field mismatch");
    assert.equal(result.json?.engine, "decide", "decide runtime engine mismatch");
    assert.equal(result.json?.c, "ok", "decide runtime c mismatch");
    assert.equal(result.json?.v, "ok", "decide runtime v mismatch");

    const recommended = result.json?.decision?.recommended_option;
    const options = fixture.request.body.context.options;
    assert.equal(typeof recommended, "string", "decide runtime recommended option missing");
    assert.ok(options.includes(recommended), "decide runtime recommended option must match one of the options");
    assert.equal(typeof result.json?.decision?.confidence, "number", "decide runtime confidence missing");
    assert.equal(result.json?.decision?.confidence, 1, "decide runtime confidence should clamp slight >1 overflows");

    assert.ok(Array.isArray(result.json?.scorecard), "decide runtime scorecard missing");
    assert.equal(result.json.scorecard.length, options.length, "decide runtime scorecard length mismatch");
    result.json.scorecard.forEach((row, idx) => {
      assert.equal(typeof row?.confidence, "number", `decide runtime scorecard confidence missing for row ${idx}`);
      assert.ok(row.confidence >= 0 && row.confidence <= 1, `decide runtime scorecard confidence out of range for row ${idx}`);
    });

    assert.ok(Array.isArray(result.json?.tradeoffs), "decide runtime tradeoffs missing");
    assert.ok(result.json.tradeoffs.length >= 1, "decide runtime tradeoffs must be non-empty");
    assert.ok(Array.isArray(result.json?.next_actions), "decide runtime next_actions missing");
    assert.ok(result.json.next_actions.length >= 1, "decide runtime next_actions must be non-empty");
    assert.ok(Array.isArray(result.json?.citations), "decide runtime citations missing");
    assert.ok(result.json.citations.length >= 1, "decide runtime citations must be non-empty");

    const firstCitation = result.json.citations[0] || {};
    assert.equal(typeof firstCitation.title, "string", "decide runtime citation title missing");
    assert.ok(Array.isArray(firstCitation.reasoning_lines), "decide runtime citation reasoning_lines missing");
    assert.ok(firstCitation.reasoning_lines.length >= 2, "decide runtime citation reasoning_lines must be non-empty");
    const reasoningText = result.json.citations
      .flatMap((entry) => (Array.isArray(entry?.reasoning_lines) ? entry.reasoning_lines : []))
      .join(" ");
    assert.equal(reasoningText.includes(sensitiveInputValue), false, "sensitive input value leaked into fallback citation reasoning");
    assert.equal(/api[_-]?key\s*=/.test(reasoningText.toLowerCase()), false, "sensitive input key should not be echoed in reasoning");

    assertLineage(result.json, "decide_runtime");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookFixture() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("rulebook evaluation must not call an LLM");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);

    assert.equal(first.statusCode, fixture.expect.statusCode, "rulebook status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "rulebook decision mismatch");
    assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, "rulebook application verdict mismatch");
    assert.equal(first.json?.action, fixture.expect.action, "rulebook action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "rulebook reason code mismatch");
    assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, "rulebook matched rule mismatch");
    assert.equal(first.json?.engine, "decide_rulebook_v1", "rulebook engine mismatch");
    assert.equal(first.json?.rulebook?.schema_version, "rulebook_v1", "rulebook schema version mismatch");
    assert.equal(first.json?.rulebook?.id, fixture.request.body.rulebook.rulebook_id, "rulebook id mismatch");
    assert.equal(first.json?.rulebook?.version, fixture.request.body.rulebook.version, "rulebook version mismatch");
    assert.equal(typeof first.json?.rulebook?.hash, "string", "rulebook hash missing");
    assert.equal(typeof first.json?.input_hash, "string", "rulebook input hash missing");
    assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, "rulebook input hash must be sha256 hex");
    assert.equal(first.json?.policy_version, fixture.request.body.rulebook.version, "rulebook policy version mismatch");
    assert.equal(first.json?.source_hash, first.json?.rulebook?.hash, "rulebook source hash mismatch");
    assert.deepEqual(
      {
        verdict: second.json?.verdict,
        application_verdict: second.json?.application_verdict,
        action: second.json?.action,
        reason_code: second.json?.reason_code,
        matched_rule_id: second.json?.matched_rule_id,
        rulebook_hash: second.json?.rulebook?.hash,
        input_hash: second.json?.input_hash,
      },
      {
        verdict: first.json?.verdict,
        application_verdict: first.json?.application_verdict,
        action: first.json?.action,
        reason_code: first.json?.reason_code,
        matched_rule_id: first.json?.matched_rule_id,
        rulebook_hash: first.json?.rulebook?.hash,
        input_hash: first.json?.input_hash,
      },
      "same rulebook and inputs must produce the same semantic result"
    );
    assert.equal(fetchCalled, false, "rulebook evaluation unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookMissingInput() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  delete request.body.context.inputs.margin_percent;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 200, "missing rulebook input should return a bounded decision");
    assert.equal(result.json?.status, "needs_input", "missing rulebook input status mismatch");
    assert.equal(result.json?.verdict, "review", "missing rulebook input must fail closed to review");
    assert.equal(result.json?.application_verdict, "NEEDS_INPUT", "missing rulebook application verdict mismatch");
    assert.equal(result.json?.action, "collect_required_input", "missing rulebook input action mismatch");
    assert.equal(result.json?.reason_code, "INPUT_SCHEMA_FAILED", "missing rulebook input reason mismatch");
    assert.equal(typeof result.json?.input_hash, "string", "missing rulebook input hash missing");
    assert.match(result.json.input_hash, /^[a-f0-9]{64}$/, "missing rulebook input hash must be sha256 hex");
    assert.deepEqual(result.json?.missing_fields, ["margin_percent"], "missing rulebook fields mismatch");
    assert.equal(result.json?.matched_rule_id, null, "missing input must not match a rule");
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsExecutableOperator() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.rules[0].condition.operator = "javascript";
  request.body.rulebook.rules[0].condition.value = "return process.env";
  request.body.rulebook.rules[0].script = "return process.env";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("invalid rulebook must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "unsupported rulebook operator status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "unsupported rulebook operator error mismatch");
    assert.ok(Array.isArray(result.json?.errors), "unsupported rulebook operator errors missing");
    assert.ok(
      result.json.errors.some((entry) => entry?.code === "unsupported_operator"),
      "unsupported rulebook operator validation detail missing"
    );
    assert.ok(
      result.json.errors.some((entry) => entry?.code === "unknown_field"),
      "executable-like rulebook field must be rejected instead of ignored"
    );
    assert.equal(fetchCalled, false, "invalid rulebook unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsExecutablePayloadFields() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.code = "return { decision: 'yes' }";
  request.body.rulebook.handler = "pricingException";
  request.body.rulebook.rules[0].condition.function = "return process.env";
  request.body.rulebook.default_outcome.javascript = "return 'approve'";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("executable rulebook payload must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable rulebook payload status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "executable rulebook payload error mismatch");
    assertUnknownField(result.json?.errors, "rulebook.code", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.handler", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.rules[0].condition.function", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.default_outcome.javascript", "executable rulebook payload");
    assert.equal(fetchCalled, false, "executable rulebook payload unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideTrustedAdapterFixture() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  fixture.request.body.adapter.manifest_hash = manifest.manifest_hash;
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("trusted adapter evaluation must not call a network dependency");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);
    assert.equal(first.statusCode, fixture.expect.statusCode, "trusted adapter status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "trusted adapter decision mismatch");
    assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, "trusted adapter verdict mismatch");
    assert.equal(first.json?.action, fixture.expect.action, "trusted adapter action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "trusted adapter reason mismatch");
    assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, "trusted adapter matched rule mismatch");
    assert.equal(first.json?.adapter_facts?.decision_score, fixture.expect.decision_score, "adapter score mismatch");
    assert.equal(
      first.json?.adapter_facts?.decision_edge_points,
      fixture.expect.decision_edge_points,
      "adapter edge mismatch"
    );
    assert.equal(first.json?.adapter_facts?.confidence_pct, fixture.expect.confidence_pct, "adapter confidence mismatch");
    assert.equal(first.json?.trusted_adapter?.adapter_id, "solana_execution_gate", "adapter id missing");
    assert.equal(first.json?.trusted_adapter?.version, "1.0.0", "adapter version missing");
    assert.equal(
      first.json?.trusted_adapter?.implementation_hash,
      manifest.implementation_hash,
      "adapter implementation hash mismatch"
    );
    assert.equal(first.json?.trusted_adapter?.manifest_hash, manifest.manifest_hash, "adapter manifest hash mismatch");
    assert.equal(typeof first.json?.input_hash, "string", "adapter-backed rulebook input hash missing");
    assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, "adapter-backed rulebook input hash must be sha256 hex");
    assert.equal(typeof first.json?.trusted_adapter?.input_hash, "string", "adapter input hash missing");
    assert.equal(typeof first.json?.trusted_adapter?.output_hash, "string", "adapter output hash missing");
    assert.equal(
      first.json?.trusted_adapter?.execution_isolation,
      "worker_thread_one_shot_v1",
      "adapter execution isolation missing"
    );
    assert.equal(
      first.json?.trusted_adapter?.capability_enforcement,
      "ambient_capability_deny_v1",
      "adapter capability enforcement missing"
    );
    assert.equal(first.json?.trusted_adapter?.execution_timeout_ms, 250, "adapter timeout attestation mismatch");
    assert.deepEqual(
      {
        verdict: second.json?.application_verdict,
        score: second.json?.adapter_facts?.decision_score,
        rulebook_input_hash: second.json?.input_hash,
        input_hash: second.json?.trusted_adapter?.input_hash,
        output_hash: second.json?.trusted_adapter?.output_hash,
      },
      {
        verdict: first.json?.application_verdict,
        score: first.json?.adapter_facts?.decision_score,
        rulebook_input_hash: first.json?.input_hash,
        input_hash: first.json?.trusted_adapter?.input_hash,
        output_hash: first.json?.trusted_adapter?.output_hash,
      },
      "same adapter, input, and rulebook must reproduce the same semantic facts"
    );
    assert.equal(fetchCalled, false, "trusted adapter evaluation unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testTrustedAdapterCapabilityAudit() {
  const denied = auditTrustedAdapterImplementation(function forbiddenAdapter() {
    return { observed_at: Date.now(), random: Math.random(), secret: process.env.SECRET };
  });
  assert.equal(denied.ok, false, "forbidden ambient capabilities should fail registration audit");
  assert.deepEqual(
    denied.denied_capabilities,
    ["clock_access", "environment_access", "randomness_access"],
    "capability audit should report each denied ambient dependency"
  );
}

async function testDecideTrustedAdapterRejectsManifestDrift() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  fixture.request.body.adapter.manifest_hash = "0".repeat(64);
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 422, "adapter manifest mismatch status mismatch");
    assert.equal(
      result.json?.error,
      "TRUSTED_ADAPTER_MANIFEST_MISMATCH",
      "adapter manifest mismatch error missing"
    );
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideTrustedAdapterRejectsExecutablePayloadFields() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.adapter.manifest_hash = manifest.manifest_hash;
  request.body.adapter.code = "return normalizedFacts";
  request.body.adapter.handler = "solanaExecutionGateV1";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("executable adapter payload must not call a network dependency");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable adapter payload status mismatch");
    assert.equal(result.json?.error, "TRUSTED_ADAPTER_INVALID", "executable adapter payload error mismatch");
    assertUnknownField(result.json?.errors, "adapter.code", "executable adapter payload");
    assertUnknownField(result.json?.errors, "adapter.handler", "executable adapter payload");
    assert.equal(fetchCalled, false, "executable adapter payload unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideTrustedAdapterRejectsExecutableInputFields() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.adapter.manifest_hash = manifest.manifest_hash;
  request.body.adapter.input.script = "return process.env";
  request.body.adapter.input.wasm = "base64-module";
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable adapter input status mismatch");
    assert.equal(result.json?.error, "TRUSTED_ADAPTER_INPUT_INVALID", "executable adapter input error mismatch");
    assertUnknownField(result.json?.errors, "adapter.input.script", "executable adapter input");
    assertUnknownField(result.json?.errors, "adapter.input.wasm", "executable adapter input");
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testRulebookV1PublicConformanceFixtures() {
  const indexPath = join(__dirname, "..", "public", "conformance", "rulebook-v1", "index.json");
  assert.ok(existsSync(indexPath), "public Rulebook v1 conformance index is missing");
  const schema = loadJsonFromRepo("public", "schemas", "rulebook-v1.schema.json");
  const index = loadPublicRulebookConformanceFixture("index.json");
  assert.equal(index.conformance_version, "rulebook_v1_conformance_v1", "conformance index version mismatch");
  assert.equal(index.schema_url, schema.$id, "conformance index schema URL mismatch");
  assert.deepEqual(
    index.fixtures.map((fixture) => fixture.id),
    [
      "pricing_exception_direct_approve",
      "solana_execution_gate_adapter_approve",
      "executable_payload_rejected",
    ],
    "public Rulebook v1 conformance fixture set changed unexpectedly"
  );

  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Rulebook v1 conformance fixtures must not call an LLM");
  };

  try {
    for (const [fixtureIndex, fixtureRef] of index.fixtures.entries()) {
      assert.ok(
        fixtureRef.url.startsWith("https://api.decide.fyi/conformance/rulebook-v1/"),
        `${fixtureRef.id}: fixture URL must use API origin`
      );
      const fileName = fixtureRef.url.split("/").pop();
      const fixture = loadPublicRulebookConformanceFixture(fileName);
      assert.equal(fixture.fixture_version, "rulebook_v1_conformance_v1", `${fixtureRef.id}: fixture version mismatch`);
      assert.equal(fixture.id, fixtureRef.id, `${fixtureRef.id}: fixture id mismatch`);
      assert.equal(fixture.schema_url, schema.$id, `${fixtureRef.id}: schema URL mismatch`);
      assert.equal(fixture.request?.method, "POST", `${fixtureRef.id}: request method mismatch`);
      assert.equal(fixture.request?.path, "/api/decide", `${fixtureRef.id}: request path mismatch`);
      assert.equal(fixture.request?.body?.mode, "rulebook", `${fixtureRef.id}: fixture must use rulebook mode`);

      const request = {
        ...fixture.request,
        headers: {
          ...(fixture.request.headers || {}),
          "x-forwarded-for": `10.255.0.${fixtureIndex + 1}`,
        },
      };
      const first = await invokeJson(decideHandler, request);
      assert.equal(first.statusCode, fixture.expect.statusCode, `${fixtureRef.id}: status mismatch`);

      if (fixture.expect.ok === false) {
        assert.equal(first.json?.error, fixture.expect.error, `${fixtureRef.id}: error mismatch`);
        for (const field of fixture.expect.expected_unknown_fields || []) {
          assertUnknownField(first.json?.errors, field, `${fixtureRef.id}: unknown field expectation`);
        }
        continue;
      }

      const second = await invokeJson(decideHandler, request);
      assert.equal(first.json?.engine, "decide_rulebook_v1", `${fixtureRef.id}: engine mismatch`);
      assert.equal(first.json?.rulebook?.schema_version, "rulebook_v1", `${fixtureRef.id}: rulebook schema mismatch`);
      assert.equal(first.json?.verdict, fixture.expect.decision, `${fixtureRef.id}: decision mismatch`);
      assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, `${fixtureRef.id}: application verdict mismatch`);
      assert.equal(first.json?.action, fixture.expect.action, `${fixtureRef.id}: action mismatch`);
      assert.equal(first.json?.reason_code, fixture.expect.reason_code, `${fixtureRef.id}: reason code mismatch`);
      assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, `${fixtureRef.id}: matched rule mismatch`);
      assert.equal(typeof first.json?.rulebook?.hash, "string", `${fixtureRef.id}: rulebook hash missing`);
      assert.equal(typeof first.json?.input_hash, "string", `${fixtureRef.id}: input hash missing`);
      assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, `${fixtureRef.id}: input hash must be sha256 hex`);
      assert.deepEqual(
        {
          verdict: second.json?.verdict,
          application_verdict: second.json?.application_verdict,
          action: second.json?.action,
          reason_code: second.json?.reason_code,
          matched_rule_id: second.json?.matched_rule_id,
          rulebook_hash: second.json?.rulebook?.hash,
          input_hash: second.json?.input_hash,
          adapter_facts: second.json?.adapter_facts || null,
        },
        {
          verdict: first.json?.verdict,
          application_verdict: first.json?.application_verdict,
          action: first.json?.action,
          reason_code: first.json?.reason_code,
          matched_rule_id: first.json?.matched_rule_id,
          rulebook_hash: first.json?.rulebook?.hash,
          input_hash: first.json?.input_hash,
          adapter_facts: first.json?.adapter_facts || null,
        },
        `${fixtureRef.id}: repeated fixture run must reproduce semantic output`
      );
      if (fixture.expect.adapter_facts) {
        for (const [field, expectedValue] of Object.entries(fixture.expect.adapter_facts)) {
          assert.equal(first.json?.adapter_facts?.[field], expectedValue, `${fixtureRef.id}: adapter fact ${field} mismatch`);
        }
      }
    }
    assert.equal(fetchCalled, false, "Rulebook v1 conformance fixtures unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testRulebookRuntimeArchitectureDoc() {
  const architecturePath = join(__dirname, "..", "docs", "RULEBOOK_RUNTIME_ARCHITECTURE.md");
  const rulebookDocPath = join(__dirname, "..", "docs", "RULEBOOK_V1.md");
  const schemaPath = join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json");
  assert.ok(existsSync(architecturePath), "rulebook runtime architecture doc is missing");
  assert.ok(existsSync(rulebookDocPath), "rulebook contract doc is missing");
  assert.ok(existsSync(schemaPath), "public Rulebook v1 JSON Schema artifact is missing");
  const architecture = readFileSync(architecturePath, "utf8");
  const rulebookDoc = readFileSync(rulebookDocPath, "utf8");
  const schema = loadJsonFromRepo("public", "schemas", "rulebook-v1.schema.json");
  const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
  assert.ok(architecture.includes("Status: Accepted"), "runtime architecture doc must record accepted status");
  assert.ok(
    architecture.includes("Rulebook v1 is the public production determinism contract"),
    "runtime architecture doc must name Rulebook v1 as the public deterministic core"
  );
  assert.ok(
    architecture.includes("Customer-supplied executable rulebooks do not run inside Decide"),
    "runtime architecture doc must reject customer executable rulebooks"
  );
  assert.ok(
    architecture.includes("Trusted adapters may emit facts, but they do not select the binding verdict"),
    "runtime architecture doc must keep trusted adapters out of verdict selection"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_RUNTIME_ARCHITECTURE.md"),
    "README must link the runtime architecture decision"
  );
  assert.equal(schema.$id, "https://api.decide.fyi/schemas/rulebook-v1.schema.json", "schema id must use the API origin");
  assert.equal(schema.properties?.schema_version?.const, "rulebook_v1", "schema must lock the Rulebook v1 version");
  assert.equal(schema.additionalProperties, false, "schema root must be closed");
  assert.equal(schema.$defs?.rule?.additionalProperties, false, "schema rule objects must be closed");
  assert.equal(schema.$defs?.outcome?.additionalProperties, false, "schema outcomes must be closed");
  assert.equal(
    schema.$defs?.condition?.oneOf?.[3]?.properties?.operator?.enum?.includes("javascript"),
    false,
    "schema must not expose executable operators"
  );
  for (const field of ["code", "source", "script", "function", "handler", "javascript", "typescript", "wasm"]) {
    assert.equal(schema.properties?.[field], undefined, `schema root must not expose executable field ${field}`);
    assert.equal(schema.$defs?.rule?.properties?.[field], undefined, `schema rules must not expose executable field ${field}`);
  }
  assert.ok(
    rulebookDoc.includes("https://api.decide.fyi/schemas/rulebook-v1.schema.json"),
    "rulebook contract doc must link the public JSON Schema artifact"
  );
}

async function testDecideModelFallbackOrder() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return {
        ok: false,
        status: 404,
        async json() {
          return {
            error: {
              message: "model not found",
            },
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
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
    };
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "decide fallback order status mismatch");
    assert.equal(result.json?.c, "yes", "decide fallback order verdict mismatch");
    assert.equal(urls.length, 2, "expected second model attempt after first-model failure");
    assert.match(urls[0], /models\/gemini-3\.1-pro-preview:generateContent/, "first attempt should use gemini-3.1-pro-preview");
    assert.match(urls[1], /models\/gemini-2\.5-pro:generateContent/, "second attempt should use gemini-2.5-pro");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideModelFallbackOnEmptyText() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: "" }],
                },
              },
            ],
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
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
    };
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "decide empty-text fallback status mismatch");
    assert.equal(result.json?.c, "yes", "decide empty-text fallback verdict mismatch");
    assert.equal(urls.length, 2, "expected second model attempt after empty first response");
    assert.match(urls[0], /models\/gemini-3\.1-pro-preview:generateContent/, "first attempt should use gemini-3.1-pro-preview");
    assert.match(urls[1], /models\/gemini-2\.5-pro:generateContent/, "second attempt should use gemini-2.5-pro");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideExtendedFallbackOrder() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  const urls = [];

  global.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length < 5) {
      return {
        ok: false,
        status: 404,
        async json() {
          return {
            error: {
              message: "model not found",
            },
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
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
    };
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "decide extended fallback order status mismatch");
    assert.equal(result.json?.c, "yes", "decide extended fallback order verdict mismatch");
    assert.equal(urls.length, 5, "expected success on the fifth model attempt");
    assert.match(urls[0], /models\/gemini-3\.1-pro-preview:generateContent/, "rung 1 should use gemini-3.1-pro-preview");
    assert.match(urls[1], /models\/gemini-2\.5-pro:generateContent/, "rung 2 should use gemini-2.5-pro");
    assert.match(urls[2], /models\/gemini-3-flash-preview:generateContent/, "rung 3 should use gemini-3-flash-preview");
    assert.match(
      urls[3],
      /models\/gemini-3\.1-flash-lite-preview:generateContent/,
      "rung 4 should use gemini-3.1-flash-lite-preview"
    );
    assert.match(urls[4], /models\/gemini-2\.5-flash:generateContent/, "rung 5 should use gemini-2.5-flash");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
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

async function testUcpVendorEnumConsistency() {
  const rules = loadJsonFromRepo("rules", "v1_us_individual.json");
  const ucp = loadJsonFromRepo("public", ".well-known", "ucp.json");

  const expectedVendors = Object.keys(rules?.vendors || {}).sort((a, b) => a.localeCompare(b));
  assert.ok(expectedVendors.length > 0, "rules vendor list should not be empty");

  for (const service of ucp?.services || []) {
    const actual = Array.isArray(service?.inputs?.vendor?.enum)
      ? [...service.inputs.vendor.enum].sort((a, b) => a.localeCompare(b))
      : null;

    assert.ok(actual, `${service?.name || "unknown service"} is missing inputs.vendor.enum`);
    assert.deepEqual(
      actual,
      expectedVendors,
      `${service?.name || "unknown service"} vendor enum drifted from rules/v1_us_individual.json`
    );
  }
}

async function main() {
  const tests = [
    ["decide-single", testDecideSingleFixture],
    ["decide-api-key", testDecideApiKeyFixture],
    ["decide-runtime", testDecideRuntimeFixture],
    ["decide-rulebook-v1", testDecideRulebookFixture],
    ["decide-rulebook-missing-input", testDecideRulebookMissingInput],
    ["decide-rulebook-rejects-executable-operator", testDecideRulebookRejectsExecutableOperator],
    ["decide-rulebook-rejects-executable-payload-fields", testDecideRulebookRejectsExecutablePayloadFields],
    ["decide-trusted-adapter-v1", testDecideTrustedAdapterFixture],
    ["trusted-adapter-capability-audit", testTrustedAdapterCapabilityAudit],
    ["decide-trusted-adapter-manifest-drift", testDecideTrustedAdapterRejectsManifestDrift],
    ["decide-trusted-adapter-rejects-executable-payload-fields", testDecideTrustedAdapterRejectsExecutablePayloadFields],
    ["decide-trusted-adapter-rejects-executable-input-fields", testDecideTrustedAdapterRejectsExecutableInputFields],
    ["rulebook-v1-public-conformance-fixtures", testRulebookV1PublicConformanceFixtures],
    ["rulebook-runtime-architecture-doc", testRulebookRuntimeArchitectureDoc],
    ["decide-model-fallback-order", testDecideModelFallbackOrder],
    ["decide-model-fallback-empty-text", testDecideModelFallbackOnEmptyText],
    ["decide-extended-fallback-order", testDecideExtendedFallbackOrder],
    ["policy-v1-dispatch", testPolicyV1Fixture],
    ["workflow-zendesk-dispatch", testWorkflowFixture],
    ["ucp-vendor-enum-consistency", testUcpVendorEnumConsistency],
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
