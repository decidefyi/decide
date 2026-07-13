#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  resolveGeminiModelLadder,
  resolveGeminiModelProfile,
} from "../lib/gemini-model-routing.js";

assert.equal(resolveGeminiModelProfile("single"), "low_latency");
assert.equal(resolveGeminiModelProfile("multi"), "low_latency");
assert.equal(resolveGeminiModelProfile("runtime"), "quality");
assert.equal(resolveGeminiModelProfile("rulebook"), "quality");

const qualityModels = resolveGeminiModelLadder({ env: {} });
assert.equal(qualityModels[0], "gemini-3.1-pro-preview");
assert.ok(qualityModels.includes("gemini-3.5-flash"));

const lowLatencyModels = resolveGeminiModelLadder({ profile: "low_latency", env: {} });
assert.equal(lowLatencyModels[0], "gemini-3.1-flash-lite");
assert.ok(lowLatencyModels.includes("gemini-3.5-flash"));
assert.ok(!lowLatencyModels.some((model) => model.includes("preview")));
assert.ok(!lowLatencyModels.some((model) => model.startsWith("gemini-2.0")));

assert.deepEqual(
  resolveGeminiModelLadder({
    profile: "low_latency",
    env: {
      DECIDE_GEMINI_LOW_LATENCY_MODEL_LADDER: " custom-fast, gemini-3.1-flash-lite, custom-fast ",
    },
  }),
  ["custom-fast", "gemini-3.1-flash-lite"]
);

assert.deepEqual(
  resolveGeminiModelLadder({
    env: {
      DECIDE_GEMINI_MODEL_LADDER: " custom-quality, gemini-3.1-pro-preview, custom-quality ",
    },
  }),
  ["custom-quality", "gemini-3.1-pro-preview"]
);

console.log("PASS Gemini model routing");
