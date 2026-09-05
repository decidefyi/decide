#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  GEMINI_USAGE_HARD_CAPS,
  releaseGeminiUsage,
  reserveGeminiUsage,
  resolveGeminiUsageBudgetConfig,
} from "../lib/gemini-usage-budget.js";
import {
  GEMINI_REQUEST_HARD_CAPS,
  resolveGeminiRequestPolicy,
} from "../lib/gemini-request-policy.js";

const BUDGET_ENV = {
  DECIDE_GEMINI_BUDGET_KV_REST_API_URL: "https://budget.example.test",
  DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN: "test-token",
};

assert.deepEqual(GEMINI_USAGE_HARD_CAPS, {
  daily: 10,
  monthly: 100,
  lifetime: 500,
  concurrency: 1,
});
assert.deepEqual(GEMINI_REQUEST_HARD_CAPS, {
  promptChars: 4096,
  timeoutMs: { single: 2000, multi: 8000, runtime: 8000 },
  outputTokens: { single: 32, multi: 128, runtime: 512 },
  thinkingLevel: "minimal",
});

assert.deepEqual(
  resolveGeminiRequestPolicy({
    mode: "single",
    env: { DECIDE_GEMINI_TIMEOUT_MS: "999999" },
  }),
  {
    maxPromptChars: 4096,
    timeoutMs: 2000,
    maxOutputTokens: 32,
    thinkingLevel: "minimal",
  }
);
assert.deepEqual(
  resolveGeminiRequestPolicy({
    mode: "runtime",
    env: {
      DECIDE_GEMINI_MAX_PROMPT_CHARS: "999999",
      DECIDE_GEMINI_TIMEOUT_MS: "999999",
    },
  }),
  {
    maxPromptChars: 4096,
    timeoutMs: 8000,
    maxOutputTokens: 512,
    thinkingLevel: "minimal",
  }
);
assert.deepEqual(
  resolveGeminiRequestPolicy({
    mode: "multi",
    env: {
      DECIDE_GEMINI_MAX_PROMPT_CHARS: "1000",
      DECIDE_GEMINI_TIMEOUT_MS: "2500",
    },
  }),
  {
    maxPromptChars: 1000,
    timeoutMs: 2500,
    maxOutputTokens: 128,
    thinkingLevel: "minimal",
  }
);

const defaults = resolveGeminiUsageBudgetConfig({
  env: BUDGET_ENV,
  now: Date.UTC(2026, 7, 13, 10, 0, 0),
});
assert.equal(defaults.configured, true);
assert.equal(defaults.dailyCap, 10);
assert.equal(defaults.monthlyCap, 100);
assert.equal(defaults.lifetimeCap, 500);
assert.equal(defaults.concurrencyCap, 1);
assert.match(defaults.keys.daily, /2026-08-13$/);
assert.match(defaults.keys.monthly, /2026-08$/);

const lowered = resolveGeminiUsageBudgetConfig({
  env: {
    ...BUDGET_ENV,
    DECIDE_GEMINI_DAILY_CALL_CAP: "4",
    DECIDE_GEMINI_MONTHLY_CALL_CAP: "40",
    DECIDE_GEMINI_LIFETIME_CALL_CAP: "200",
  },
});
assert.equal(lowered.dailyCap, 4);
assert.equal(lowered.monthlyCap, 40);
assert.equal(lowered.lifetimeCap, 200);

const attemptedRaise = resolveGeminiUsageBudgetConfig({
  env: {
    ...BUDGET_ENV,
    DECIDE_GEMINI_DAILY_CALL_CAP: "999",
    DECIDE_GEMINI_MONTHLY_CALL_CAP: "999",
    DECIDE_GEMINI_LIFETIME_CALL_CAP: "999",
  },
});
assert.equal(attemptedRaise.dailyCap, GEMINI_USAGE_HARD_CAPS.daily);
assert.equal(attemptedRaise.monthlyCap, GEMINI_USAGE_HARD_CAPS.monthly);
assert.equal(attemptedRaise.lifetimeCap, GEMINI_USAGE_HARD_CAPS.lifetime);

const incompleteDedicatedStore = resolveGeminiUsageBudgetConfig({
  env: {
    DECIDE_GEMINI_BUDGET_KV_REST_API_URL: "https://dedicated.example.test",
    DECIDE_KV_REST_API_URL: "https://shared.example.test",
    DECIDE_KV_REST_API_TOKEN: "shared-token-must-not-be-mixed",
  },
});
assert.equal(incompleteDedicatedStore.configured, false);
assert.equal(incompleteDedicatedStore.url, "https://dedicated.example.test");
assert.equal(incompleteDedicatedStore.token, "");

let fetchCalls = 0;
const missingStore = await reserveGeminiUsage({
  env: {},
  fetchImpl: async () => {
    fetchCalls += 1;
    throw new Error("missing configuration must fail before fetch");
  },
});
assert.equal(missingStore.allowed, false);
assert.equal(missingStore.reason, "budget_store_unavailable");
assert.equal(fetchCalls, 0);

const commands = [];
const allowed = await reserveGeminiUsage({
  env: BUDGET_ENV,
  requestId: "req_budget_allowed",
  reservationId: "reservation-test-token",
  fetchImpl: async (url, options) => {
    commands.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ result: [1, "allowed", 1, 1, 1] }];
      },
    };
  },
});
assert.equal(allowed.allowed, true);
assert.equal(allowed.reservationId, "reservation-test-token");
assert.deepEqual(allowed.usage, { daily: 1, monthly: 1, lifetime: 1 });
assert.equal(commands.length, 1);
assert.match(commands[0].url, /\/pipeline$/);
const reservationPipeline = JSON.parse(commands[0].options.body);
assert.equal(reservationPipeline[0][0], "EVAL");
assert.equal(reservationPipeline[0][2], 4);

const denied = await reserveGeminiUsage({
  env: BUDGET_ENV,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{ result: [0, "daily", 10, 33, 88] }];
    },
  }),
});
assert.equal(denied.allowed, false);
assert.equal(denied.reason, "daily_cap_reached");
assert.deepEqual(denied.usage, { daily: 10, monthly: 33, lifetime: 88 });

let releaseCommand = null;
const released = await releaseGeminiUsage(allowed, {
  env: BUDGET_ENV,
  fetchImpl: async (_url, options) => {
    releaseCommand = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ result: 1 }];
      },
    };
  },
});
assert.equal(released, true);
assert.equal(releaseCommand[0][0], "EVAL");

console.log("PASS Gemini durable usage budget");
