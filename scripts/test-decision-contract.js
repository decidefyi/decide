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

function loadJsonFromRepo(...segments) {
  return JSON.parse(readFileSync(join(__dirname, "..", ...segments), "utf8"));
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
