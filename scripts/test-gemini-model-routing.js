#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  DEFAULT_PAID_GEMINI_MODEL,
  resolveGeminiModelLadder,
  resolveGeminiRuntimePolicy,
} from "../lib/gemini-model-routing.js";

const defaultPolicy = resolveGeminiRuntimePolicy({ env: {} });
assert.equal(defaultPolicy.enabled, false);
assert.equal(defaultPolicy.mode, "disabled");
assert.equal(defaultPolicy.reason, "zero_cost_default");
assert.equal(defaultPolicy.model, null);
assert.deepEqual(resolveGeminiModelLadder({ env: {} }), []);

const explicitlyDisabled = resolveGeminiRuntimePolicy({
  env: {
    DECIDE_GEMINI_MODE: "disabled",
    DECIDE_GEMINI_MODEL: "gemini-2.5-flash-lite",
  },
});
assert.equal(explicitlyDisabled.enabled, false);
assert.equal(explicitlyDisabled.reason, "zero_cost_disabled");
assert.deepEqual(
  resolveGeminiModelLadder({
    env: {
      DECIDE_GEMINI_MODE: "disabled",
      DECIDE_GEMINI_MODEL: "gemini-2.5-flash-lite",
    },
  }),
  []
);

const unknownMode = resolveGeminiRuntimePolicy({
  env: { DECIDE_GEMINI_MODE: "free" },
});
assert.equal(unknownMode.enabled, false);
assert.equal(unknownMode.reason, "mode_not_allowed");

const defaultPaid = resolveGeminiRuntimePolicy({
  env: { DECIDE_GEMINI_MODE: "paid" },
});
assert.equal(defaultPaid.enabled, true);
assert.equal(defaultPaid.mode, "paid");
assert.equal(defaultPaid.model, DEFAULT_PAID_GEMINI_MODEL);
assert.deepEqual(
  resolveGeminiModelLadder({ env: { DECIDE_GEMINI_MODE: "paid" } }),
  [DEFAULT_PAID_GEMINI_MODEL]
);

for (const model of [
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "custom-fast",
  "gemini-3.1-flash-lite-preview",
]) {
  const policy = resolveGeminiRuntimePolicy({
    env: {
      DECIDE_GEMINI_MODE: "paid",
      DECIDE_GEMINI_MODEL: model,
    },
  });
  assert.equal(policy.enabled, false, `${model} must fail closed`);
  assert.equal(policy.reason, "model_not_allowed", `${model} rejection reason mismatch`);
  assert.equal(policy.model, null, `${model} must not survive model validation`);
}

assert.deepEqual(
  resolveGeminiModelLadder({
    env: {
      DECIDE_GEMINI_MODE: "paid",
      DECIDE_GEMINI_MODEL: "gemini-3.1-pro-preview",
      DECIDE_GEMINI_MODEL_LADDER: "gemini-3.1-pro-preview,gemini-2.5-flash-lite",
      DECIDE_GEMINI_LOW_LATENCY_MODEL_LADDER: "gemini-2.5-flash-lite",
    },
  }),
  [],
  "legacy ladder variables must not bypass the strict paid-model allowlist"
);

console.log("PASS Gemini zero-cost routing policy");
