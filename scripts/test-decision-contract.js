#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import decideHandler from "../api/decide.js";
import rulebookAttestationKeysHandler from "../api/rulebook-attestation-keys.js";
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

function loadPublicRulebookGoldenReplayFixture(fileName) {
  return loadJsonFromRepo("public", "replay", "rulebook-v1", fileName);
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

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function verifySignature({ publicKeyPem, bundleHash, signature }) {
  return cryptoVerify(
    null,
    Buffer.from(String(bundleHash || ""), "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(String(signature || ""), "base64url")
  );
}

function assertRulebookAttestation(payload, label) {
  const attestation = payload?.rulebook_attestation;
  const signature = attestation?.signature;
  assert.equal(attestation?.schema_version, "rulebook_attestation_v1", `${label}: attestation schema mismatch`);
  assert.match(attestation?.bundle_hash || "", /^[a-f0-9]{64}$/, `${label}: attestation bundle hash must be sha256 hex`);
  assert.equal(
    attestation.bundle_hash,
    sha256(canonicalJson(attestation.bundle)),
    `${label}: attestation bundle hash must match canonical bundle`
  );
  assert.equal(attestation?.bundle?.engine, payload?.engine, `${label}: attestation engine mismatch`);
  assert.equal(
    attestation?.bundle?.evaluator_version,
    payload?.evaluator_version,
    `${label}: attestation evaluator mismatch`
  );
  assert.deepEqual(attestation?.bundle?.rulebook, payload?.rulebook, `${label}: attestation rulebook mismatch`);
  assert.equal(attestation?.bundle?.input_hash, payload?.input_hash, `${label}: attestation input hash mismatch`);
  assert.deepEqual(
    attestation?.bundle?.outcome,
    {
      status: payload?.status,
      verdict: payload?.verdict,
      application_verdict: payload?.application_verdict,
      action: payload?.action,
      reason_code: payload?.reason_code,
      matched_rule_id: payload?.matched_rule_id,
    },
    `${label}: attestation outcome mismatch`
  );

  if (payload?.trusted_adapter) {
    assert.deepEqual(
      attestation?.bundle?.trusted_adapter,
      payload.trusted_adapter,
      `${label}: attestation trusted adapter mismatch`
    );
  } else {
    assert.equal(attestation?.bundle?.trusted_adapter, null, `${label}: attestation trusted adapter should be null`);
  }

  assert.equal(
    signature?.schema_version,
    "rulebook_attestation_signature_v1",
    `${label}: attestation signature schema mismatch`
  );
  assert.equal(signature?.algorithm, "Ed25519", `${label}: attestation signature algorithm mismatch`);
  assert.equal(signature?.signed_field, "bundle_hash", `${label}: attestation signature must cover bundle_hash`);
  assert.equal(
    signature?.public_key_url,
    "https://api.decide.fyi/.well-known/rulebook-attestation-keys.json",
    `${label}: attestation signature public key URL mismatch`
  );
  assert.ok(
    ["signed", "unsigned"].includes(signature?.status),
    `${label}: attestation signature status must be signed or unsigned`
  );
  if (signature.status === "signed") {
    assert.equal(typeof signature.key_id, "string", `${label}: signed attestation key id missing`);
    assert.match(signature.signature || "", /^[A-Za-z0-9_-]+$/, `${label}: signed attestation signature must be base64url`);
    assert.match(signature.public_key_pem || "", /^-----BEGIN PUBLIC KEY-----/, `${label}: signed attestation public key missing`);
    assert.equal(
      verifySignature({
        publicKeyPem: signature.public_key_pem,
        bundleHash: attestation.bundle_hash,
        signature: signature.signature,
      }),
      true,
      `${label}: signed attestation signature verification failed`
    );
  } else {
    assert.equal(signature.signature, null, `${label}: unsigned attestation signature should be null`);
  }
}

function generateSigningEnv(keyId = "contract-test-rulebook-key") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    keyId,
  };
}

function runTrustedAdapterCapabilityRuntimeProbe() {
  return new Promise((resolve, reject) => {
    const capabilityModuleUrl = new URL("../lib/trusted-adapter-capabilities.js", import.meta.url).href;
    const source = `
      import { parentPort } from "node:worker_threads";
      import { installDeniedAmbientCapabilities } from ${JSON.stringify(capabilityModuleUrl)};

      const results = {};
      const probe = (name, operation) => {
        try {
          operation();
          results[name] = "allowed";
        } catch (error) {
          results[name] = String(error?.message || error);
        }
      };

      installDeniedAmbientCapabilities();
      probe("environment_access", () => process.env);
      probe("clock_access", () => performance.now());
      probe("randomness_access", () => crypto.randomUUID());
      probe("network_access", () => fetch("https://example.com"));
      probe("timer_access", () => setImmediate(() => {}));
      probe("network_override", () => {
        globalThis.fetch = () => ({ ok: true });
      });
      parentPort.postMessage(results);
    `;
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
      type: "module",
      env: {},
    });
    worker.once("message", (message) => {
      void worker.terminate();
      resolve(message);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`capability runtime probe exited with code ${code}`));
    });
  });
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
  const schemaText = readFileSync(join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json"), "utf8");
  const schemaHash = sha256(schemaText);
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
    assert.deepEqual(
      first.json?.rulebook_contract,
      {
        schema_version: "rulebook_v1",
        schema_url: "https://api.decide.fyi/schemas/rulebook-v1.schema.json",
        schema_hash: schemaHash,
        evaluator_version: "decide_rulebook_v1",
      },
      "rulebook response must identify the enforced schema contract"
    );
    assert.equal(first.json?.rulebook?.id, fixture.request.body.rulebook.rulebook_id, "rulebook id mismatch");
    assert.equal(first.json?.rulebook?.version, fixture.request.body.rulebook.version, "rulebook version mismatch");
    assert.equal(typeof first.json?.rulebook?.hash, "string", "rulebook hash missing");
    assert.equal(typeof first.json?.input_hash, "string", "rulebook input hash missing");
    assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, "rulebook input hash must be sha256 hex");
    assertRulebookAttestation(first.json, "rulebook");
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
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
      },
      {
        verdict: first.json?.verdict,
        application_verdict: first.json?.application_verdict,
        action: first.json?.action,
        reason_code: first.json?.reason_code,
        matched_rule_id: first.json?.matched_rule_id,
        rulebook_hash: first.json?.rulebook?.hash,
        input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
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

async function testDecideRulebookEnforcesPublishedSchema() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.rules[0].outcome.decision = "NO";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("schema-invalid rulebook must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "schema-invalid rulebook status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "schema-invalid rulebook error mismatch");
    assert.ok(
      result.json?.errors?.some(
        (entry) =>
          entry?.code === "schema_violation" &&
          entry?.field === "rulebook.rules[0].outcome.decision" &&
          String(entry?.message || "").includes("one of yes, no, review")
      ),
      "runtime must enforce the published Rulebook v1 schema enum without normalization"
    );
    assert.equal(fetchCalled, false, "schema-invalid rulebook unexpectedly called an LLM");
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
    assert.equal(
      result.json?.rulebook_contract?.schema_url,
      "https://api.decide.fyi/schemas/rulebook-v1.schema.json",
      "missing-input response must identify the enforced schema contract"
    );
    assert.equal(typeof result.json?.input_hash, "string", "missing rulebook input hash missing");
    assert.match(result.json.input_hash, /^[a-f0-9]{64}$/, "missing rulebook input hash must be sha256 hex");
    assertRulebookAttestation(result.json, "missing rulebook input");
    assert.deepEqual(result.json?.missing_fields, ["margin_percent"], "missing rulebook fields mismatch");
    assert.equal(result.json?.matched_rule_id, null, "missing input must not match a rule");
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookAttestationSigning() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const signing = generateSigningEnv();
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  global.fetch = async () => {
    throw new Error("signed rulebook evaluation must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "signed rulebook status mismatch");
    assertRulebookAttestation(result.json, "signed rulebook");
    const signature = result.json?.rulebook_attestation?.signature;
    assert.equal(signature?.status, "signed", "attestation should be signed when signing key is configured");
    assert.equal(signature?.key_id, signing.keyId, "attestation signing key id mismatch");
    assert.equal(signature?.public_key_pem, signing.publicKeyPem, "attestation public key mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: result.json.rulebook_attestation.bundle_hash,
        signature: signature.signature,
      }),
      true,
      "attestation signature should verify with exported public key"
    );

    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 200, "attestation keys status mismatch");
    assert.equal(keys.json?.schema_version, "rulebook_attestation_keys_v1", "attestation keys schema mismatch");
    assert.equal(keys.json?.active_key_id, signing.keyId, "active attestation key id mismatch");
    assert.equal(keys.json?.keys?.[0]?.key_id, signing.keyId, "published attestation key id mismatch");
    assert.equal(keys.json?.keys?.[0]?.algorithm, "Ed25519", "published attestation key algorithm mismatch");
    assert.equal(keys.json?.keys?.[0]?.public_key_pem, signing.publicKeyPem, "published attestation public key mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
  }
}

async function testDecideRulebookRequiresSignedAttestation() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  global.fetch = async () => {
    throw new Error("required signed rulebook evaluation must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 503, "required signed rulebook should fail closed without signing key");
    assert.equal(result.json?.error, "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED", "required signature error mismatch");
    assert.equal(result.json?.signature_status, "unsigned", "required signature status mismatch");

    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 503, "required attestation keys should fail closed without signing key");
    assert.equal(keys.json?.error, "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED", "required keys error mismatch");
    assert.equal(keys.json?.status, "unsigned", "required keys signature status mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
  }
}

async function testRulebookAttestationPublishesKeyHistory() {
  const active = generateSigningEnv("contract-test-active-key");
  const retired = generateSigningEnv("contract-test-retired-key");
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousKeyHistory = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = active.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = active.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = JSON.stringify([
    {
      key_id: retired.keyId,
      algorithm: "Ed25519",
      public_key_pem: retired.publicKeyPem,
      status: "retired",
      not_before: "2026-06-01T00:00:00.000Z",
      not_after: "2026-06-11T00:00:00.000Z",
      use: "rulebook_attestation_signature",
    },
  ]);

  try {
    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 200, "attestation key history status mismatch");
    assert.equal(keys.json?.schema_version, "rulebook_attestation_keys_v1", "attestation keys schema mismatch");
    assert.equal(keys.json?.status, "signed", "attestation keys status mismatch");
    assert.equal(keys.json?.signature_required, true, "attestation keys required flag mismatch");
    assert.equal(keys.json?.active_key_id, active.keyId, "active attestation key id mismatch");
    assert.equal(keys.json?.key_history_count, 1, "attestation key history count mismatch");
    assert.deepEqual(
      keys.json?.keys?.map((key) => key.key_id),
      [active.keyId, retired.keyId],
      "attestation keys should publish active key followed by retired keys"
    );
    assert.equal(keys.json?.keys?.[0]?.status, "active", "active key status mismatch");
    assert.equal(keys.json?.keys?.[1]?.status, "retired", "retired key status mismatch");
    assert.equal(keys.json?.keys?.[1]?.not_before, "2026-06-01T00:00:00.000Z", "retired key not_before mismatch");
    assert.equal(keys.json?.keys?.[1]?.not_after, "2026-06-11T00:00:00.000Z", "retired key not_after mismatch");
    assert.equal(keys.json?.keys?.[1]?.public_key_pem, retired.publicKeyPem.trim(), "retired key public key mismatch");
  } finally {
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
    if (previousKeyHistory === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = previousKeyHistory;
  }
}

async function testRulebookAttestationRejectsInvalidKeyHistory() {
  const active = generateSigningEnv("contract-test-active-key");
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousKeyHistory = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = active.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = active.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = JSON.stringify([
    {
      key_id: active.keyId,
      algorithm: "Ed25519",
      public_key_pem: active.publicKeyPem,
      status: "retired",
    },
  ]);

  try {
    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 503, "invalid attestation key history status mismatch");
    assert.equal(keys.json?.ok, false, "invalid attestation key history ok mismatch");
    assert.equal(
      keys.json?.error,
      "RULEBOOK_ATTESTATION_KEY_HISTORY_INVALID",
      "invalid attestation key history error mismatch"
    );
    assert.equal(keys.json?.status, "error", "invalid attestation key history signing status mismatch");
    assert.equal(keys.json?.key_history_count, 0, "invalid attestation key history count mismatch");
  } finally {
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
    if (previousKeyHistory === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = previousKeyHistory;
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
      first.json?.input_hash,
      first.json?.trusted_adapter?.output_hash,
      "adapter-backed rulebook input hash should bind adapter facts"
    );
    assertRulebookAttestation(first.json, "trusted adapter rulebook");
    assert.equal(
      first.json?.trusted_adapter?.execution_isolation,
      "worker_thread_one_shot_v1",
      "adapter execution isolation missing"
    );
    assert.equal(
      first.json?.trusted_adapter?.capability_enforcement,
      "ambient_capability_deny_v2",
      "adapter capability enforcement missing"
    );
    assert.equal(first.json?.trusted_adapter?.execution_timeout_ms, 1000, "adapter timeout attestation mismatch");
    assert.deepEqual(
      {
        verdict: second.json?.application_verdict,
        score: second.json?.adapter_facts?.decision_score,
        rulebook_input_hash: second.json?.input_hash,
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
        input_hash: second.json?.trusted_adapter?.input_hash,
        output_hash: second.json?.trusted_adapter?.output_hash,
      },
      {
        verdict: first.json?.application_verdict,
        score: first.json?.adapter_facts?.decision_score,
        rulebook_input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
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

async function testTrustedAdapterCapabilityRuntimeEnforcement() {
  const results = await runTrustedAdapterCapabilityRuntimeProbe();
  assert.match(results.environment_access, /denied ambient capability: environment_access/i);
  assert.match(results.clock_access, /denied ambient capability: clock_access/i);
  assert.match(results.randomness_access, /denied ambient capability: randomness_access/i);
  assert.match(results.network_access, /denied ambient capability: network_access/i);
  assert.match(results.timer_access, /denied ambient capability: clock_access/i);
  assert.match(results.network_override, /denied ambient capability: network_access/i);
}

function testTrustedAdapterColdStartIsolation() {
  const isolationModuleUrl = new URL("../lib/trusted-adapter-isolation.js", import.meta.url).href;
  const source = `
    import { executeTrustedAdapterIsolated } from ${JSON.stringify(isolationModuleUrl)};
    const result = await executeTrustedAdapterIsolated({
      adapterId: "solana_execution_gate",
      version: "1.0.0",
      input: {
        sol_amount: 48,
        risk_level: "medium",
        evidence_level: "strong",
        quorum_signed: true,
        budget_within_policy: true,
        recipient_verified: true
      }
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({ ok: result.ok, decision_score: result.facts.decision_score }));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    timeout: 5000,
  });
  const result = JSON.parse(output.trim());
  assert.deepEqual(result, { ok: true, decision_score: 91 }, "cold trusted-adapter worker should execute safely");
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
      assert.equal(
        fixture.expect.rulebook_contract?.schema_url,
        schema.$id,
        `${fixtureRef.id}: fixture must declare the Rulebook v1 contract URL`
      );
      assert.equal(
        fixture.expect.rulebook_contract?.schema_hash_format,
        "sha256_hex",
        `${fixtureRef.id}: fixture must declare the Rulebook v1 contract hash format`
      );
      assert.equal(
        fixture.expect.rulebook_contract?.evaluator_version,
        "decide_rulebook_v1",
        `${fixtureRef.id}: fixture must declare the Rulebook v1 evaluator version`
      );
      assert.deepEqual(
        {
          schema_version: first.json?.rulebook_contract?.schema_version,
          schema_url: first.json?.rulebook_contract?.schema_url,
          schema_hash_format: /^[a-f0-9]{64}$/.test(first.json?.rulebook_contract?.schema_hash || "") ? "sha256_hex" : null,
          evaluator_version: first.json?.rulebook_contract?.evaluator_version,
        },
        {
          schema_version: "rulebook_v1",
          schema_url: fixture.expect.rulebook_contract.schema_url,
          schema_hash_format: fixture.expect.rulebook_contract.schema_hash_format,
          evaluator_version: fixture.expect.rulebook_contract.evaluator_version,
        },
        `${fixtureRef.id}: runtime rulebook contract metadata mismatch`
      );
      assert.equal(first.json?.verdict, fixture.expect.decision, `${fixtureRef.id}: decision mismatch`);
      assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, `${fixtureRef.id}: application verdict mismatch`);
      assert.equal(first.json?.action, fixture.expect.action, `${fixtureRef.id}: action mismatch`);
      assert.equal(first.json?.reason_code, fixture.expect.reason_code, `${fixtureRef.id}: reason code mismatch`);
      assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, `${fixtureRef.id}: matched rule mismatch`);
      assert.equal(typeof first.json?.rulebook?.hash, "string", `${fixtureRef.id}: rulebook hash missing`);
      assert.equal(typeof first.json?.input_hash, "string", `${fixtureRef.id}: input hash missing`);
      assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, `${fixtureRef.id}: input hash must be sha256 hex`);
      assert.equal(
        fixture.expect.attestation?.schema_version,
        "rulebook_attestation_v1",
        `${fixtureRef.id}: fixture must declare attestation schema expectation`
      );
      assert.equal(
        fixture.expect.attestation?.bundle_hash_format,
        "sha256_hex",
        `${fixtureRef.id}: fixture must declare attestation hash format expectation`
      );
      assert.equal(
        fixture.expect.signature?.schema_version,
        "rulebook_attestation_signature_v1",
        `${fixtureRef.id}: fixture must declare attestation signature schema expectation`
      );
      assert.equal(
        fixture.expect.signature?.algorithm,
        "Ed25519",
        `${fixtureRef.id}: fixture must declare attestation signature algorithm expectation`
      );
      assert.equal(
        fixture.expect.signature?.signed_field,
        "bundle_hash",
        `${fixtureRef.id}: fixture must declare attestation signature field expectation`
      );
      assertRulebookAttestation(first.json, `${fixtureRef.id}: rulebook attestation`);
      assert.deepEqual(
        {
          verdict: second.json?.verdict,
          application_verdict: second.json?.application_verdict,
          action: second.json?.action,
          reason_code: second.json?.reason_code,
          matched_rule_id: second.json?.matched_rule_id,
          rulebook_hash: second.json?.rulebook?.hash,
          input_hash: second.json?.input_hash,
          attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
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
          attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
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

async function testRulebookV1GoldenReplayCorpus() {
  const indexPath = join(__dirname, "..", "public", "replay", "rulebook-v1", "index.json");
  assert.ok(existsSync(indexPath), "public Rulebook v1 golden replay corpus index is missing");
  const index = loadPublicRulebookGoldenReplayFixture("index.json");
  assert.equal(index.corpus_version, "rulebook_v1_golden_replay_v1", "golden replay corpus version mismatch");
  assert.equal(index.schema_version, "rulebook_v1", "golden replay schema version mismatch");
  assert.equal(index.compatibility_policy, "compatibility_policy_v1", "golden replay policy mismatch");
  assert.equal(index.replay_contract, "historical_rulebook_replay_v1", "golden replay contract mismatch");
  assert.deepEqual(
    index.fixtures.map((fixture) => fixture.id),
    [
      "pricing_exception_direct_approve",
      "solana_execution_gate_adapter_approve",
      "refund_policy_notary_allow",
      "trial_policy_notary_auto_convert",
      "cancel_policy_notary_penalty",
      "return_policy_notary_full_return",
    ],
    "golden replay corpus fixture set changed unexpectedly"
  );

  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Rulebook v1 golden replay corpus must not call an LLM");
  };

  try {
    for (const [fixtureIndex, fixtureRef] of index.fixtures.entries()) {
      assert.ok(
        fixtureRef.url.startsWith("https://api.decide.fyi/replay/rulebook-v1/"),
        `${fixtureRef.id}: fixture URL must use API replay origin`
      );
      const fileName = fixtureRef.url.split("/").pop();
      const fixture = loadPublicRulebookGoldenReplayFixture(fileName);
      assert.equal(fixture.corpus_version, index.corpus_version, `${fixtureRef.id}: corpus version mismatch`);
      assert.equal(fixture.id, fixtureRef.id, `${fixtureRef.id}: fixture id mismatch`);
      assert.equal(fixture.compatibility_policy, index.compatibility_policy, `${fixtureRef.id}: policy mismatch`);
      assert.equal(fixture.replay_contract, index.replay_contract, `${fixtureRef.id}: replay contract mismatch`);
      assert.equal(fixture.replay?.request?.method, "POST", `${fixtureRef.id}: replay request method mismatch`);
      assert.equal(fixture.replay?.request?.path, "/api/decide", `${fixtureRef.id}: replay request path mismatch`);
      assert.equal(fixture.replay?.request?.body?.mode, "rulebook", `${fixtureRef.id}: replay request must use rulebook mode`);
      assert.equal(
        fixture.replay?.stored_material?.rulebook_snapshot?.rulebook_id,
        fixture.replay?.request?.body?.rulebook?.rulebook_id,
        `${fixtureRef.id}: stored rulebook snapshot must match replay request`
      );
      assert.equal(
        fixture.replay?.stored_material?.evaluator_version,
        "decide_rulebook_v1",
        `${fixtureRef.id}: stored evaluator version mismatch`
      );

      const request = {
        ...fixture.replay.request,
        headers: {
          ...(fixture.replay.request.headers || {}),
          "x-forwarded-for": `10.254.0.${fixtureIndex + 1}`,
        },
      };
      const first = await invokeJson(decideHandler, request);
      assert.equal(first.statusCode, fixture.historical_record?.statusCode, `${fixtureRef.id}: status mismatch`);
      assert.equal(first.json?.engine, fixture.historical_record?.engine, `${fixtureRef.id}: engine mismatch`);
      assert.equal(
        first.json?.evaluator_version,
        fixture.historical_record?.evaluator_version,
        `${fixtureRef.id}: evaluator version mismatch`
      );
      assert.deepEqual(
        {
          status: first.json?.status,
          verdict: first.json?.verdict,
          application_verdict: first.json?.application_verdict,
          action: first.json?.action,
          reason_code: first.json?.reason_code,
          matched_rule_id: first.json?.matched_rule_id,
        },
        fixture.historical_record?.semantic_output,
        `${fixtureRef.id}: semantic replay output mismatch`
      );
      assert.deepEqual(first.json?.rulebook, fixture.historical_record?.rulebook, `${fixtureRef.id}: rulebook lineage mismatch`);
      assert.equal(first.json?.input_hash, fixture.historical_record?.input_hash, `${fixtureRef.id}: input hash mismatch`);
      assert.equal(
        first.json?.rulebook_attestation?.schema_version,
        "rulebook_attestation_v1",
        `${fixtureRef.id}: attestation schema mismatch`
      );
      assert.equal(
        first.json?.rulebook_attestation?.bundle_hash,
        fixture.historical_record?.rulebook_attestation?.bundle_hash,
        `${fixtureRef.id}: attestation hash mismatch`
      );
      assert.deepEqual(
        first.json?.rulebook_attestation?.bundle?.outcome,
        fixture.historical_record?.semantic_output,
        `${fixtureRef.id}: attestation outcome mismatch`
      );
      if (fixture.historical_record?.trusted_adapter) {
        assert.deepEqual(
          first.json?.trusted_adapter,
          fixture.historical_record.trusted_adapter,
          `${fixtureRef.id}: trusted adapter lineage mismatch`
        );
      }
      if (fixture.historical_record?.adapter_facts) {
        assert.deepEqual(
          first.json?.adapter_facts,
          fixture.historical_record.adapter_facts,
          `${fixtureRef.id}: adapter facts mismatch`
        );
      }

      const second = await invokeJson(decideHandler, request);
      assert.deepEqual(
        {
          evaluator_version: second.json?.evaluator_version,
          semantic_output: {
            status: second.json?.status,
            verdict: second.json?.verdict,
            application_verdict: second.json?.application_verdict,
            action: second.json?.action,
            reason_code: second.json?.reason_code,
            matched_rule_id: second.json?.matched_rule_id,
          },
          rulebook: second.json?.rulebook,
          input_hash: second.json?.input_hash,
          attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
          trusted_adapter: second.json?.trusted_adapter || null,
          adapter_facts: second.json?.adapter_facts || null,
        },
        {
          evaluator_version: fixture.historical_record?.evaluator_version,
          semantic_output: fixture.historical_record?.semantic_output,
          rulebook: fixture.historical_record?.rulebook,
          input_hash: fixture.historical_record?.input_hash,
          attestation_hash: fixture.historical_record?.rulebook_attestation?.bundle_hash,
          trusted_adapter: fixture.historical_record?.trusted_adapter || null,
          adapter_facts: fixture.historical_record?.adapter_facts || null,
        },
        `${fixtureRef.id}: repeated historical replay must reproduce the stored corpus record`
      );
    }
    assert.equal(fetchCalled, false, "Rulebook v1 golden replay corpus unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testRulebookMigrationDryRunCli() {
  const repoRoot = join(__dirname, "..");
  const migrationManifestSchemaUrl = "https://api.decide.fyi/schemas/rulebook-migration-v1.schema.json";
  const migrationManifestSchemaPath = join(repoRoot, "public", "schemas", "rulebook-migration-v1.schema.json");
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const compatibilityPolicy = readFileSync(join(repoRoot, "docs", "RULEBOOK_COMPATIBILITY_POLICY.md"), "utf8");
  const migrationExamples = readFileSync(join(repoRoot, "docs", "RULEBOOK_MIGRATION_EXAMPLES.md"), "utf8");
  const migrationManifestDoc = readFileSync(join(repoRoot, "docs", "RULEBOOK_MIGRATION_MANIFEST_V1.md"), "utf8");
  const command = "npm run rulebook:migration-dry-run";
  assert.ok(existsSync(migrationManifestSchemaPath), "Rulebook migration manifest JSON Schema must be published");
  const migrationManifestSchema = loadJsonFromRepo("public", "schemas", "rulebook-migration-v1.schema.json");
  assert.equal(migrationManifestSchema.$id, migrationManifestSchemaUrl, "migration manifest schema URL mismatch");
  assert.equal(
    migrationManifestSchema.properties?.schema_version?.const,
    "rulebook_migration_v1",
    "migration manifest schema must pin schema_version"
  );
  assert.equal(migrationManifestSchema.additionalProperties, false, "migration manifest schema must be closed");
  assert.ok(migrationManifestSchema.properties?.candidate?.properties?.rulebooks, "schema missing candidate.rulebooks");
  assert.ok(migrationManifestSchema.properties?.candidate?.properties?.adapters, "schema missing candidate.adapters");
  assert.ok(migrationManifestSchema.properties?.expected_drift, "schema missing expected_drift");
  assert.ok(migrationManifestSchema.properties?.approval, "schema missing approval");
  assert.ok(readme.includes(command), "README must document the migration dry-run command");
  assert.ok(compatibilityPolicy.includes(command), "compatibility policy must document the migration dry-run command");
  assert.ok(migrationExamples.includes(command), "migration examples must document the migration dry-run command");
  assert.ok(readme.includes("--migration"), "README must document migration manifest usage");
  assert.ok(readme.includes(migrationManifestSchemaUrl), "README must publish migration manifest schema URL");
  assert.ok(compatibilityPolicy.includes(migrationManifestSchemaUrl), "compatibility policy must publish schema URL");
  assert.ok(migrationExamples.includes(migrationManifestSchemaUrl), "migration examples must publish schema URL");
  assert.ok(migrationManifestDoc.includes(migrationManifestSchemaUrl), "migration manifest doc must publish schema URL");
  assert.ok(compatibilityPolicy.includes("rulebook_migration_v1"), "compatibility policy must mention migration manifests");
  assert.ok(migrationExamples.includes("rulebook_migration_v1"), "migration examples must mention migration manifests");
  assert.ok(migrationManifestDoc.includes("rulebook_migration_v1"), "migration manifest doc must define schema version");
  assert.ok(migrationManifestDoc.includes("gate_passed"), "migration manifest doc must define gate_passed semantics");

  const env = {
    ...process.env,
    GEMINI_API_KEY: "",
    DECIDE_API_KEY: "",
  };
  const baselineOutput = execFileSync(process.execPath, ["scripts/rulebook-migration-dry-run.js", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
  const baseline = JSON.parse(baselineOutput);
  assert.equal(baseline.ok, true, "migration dry-run baseline should pass");
  assert.equal(baseline.corpus_version, "rulebook_v1_golden_replay_v1", "dry-run corpus version mismatch");
  assert.equal(baseline.replay_contract, "historical_rulebook_replay_v1", "dry-run replay contract mismatch");
  assert.equal(baseline.fixtures_total, 6, "dry-run fixture count mismatch");
  assert.equal(baseline.drift_count, 0, "baseline dry-run should have no drift");
  assert.deepEqual(
    baseline.results.map((entry) => entry.status),
    ["pass", "pass", "pass", "pass", "pass", "pass"],
    "baseline dry-run should pass every fixture"
  );

  let driftReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--fixture",
        "pricing_exception_direct_approve",
        "--candidate-evaluator-version",
        "decide_rulebook_v1_1",
        "--candidate-rulebook",
        "pricing_exception=scripts/fixtures/decision-contract/pricing-exception-2026-07-01-rulebook.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    driftReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 1, "candidate drift dry-run should exit 1");
  }
  assert.ok(driftReport, "candidate drift dry-run should fail with a JSON report");
  assert.equal(driftReport.ok, false, "candidate drift report should be marked not ok");
  assert.equal(driftReport.candidate_evaluator_version, "decide_rulebook_v1_1", "candidate evaluator label mismatch");
  assert.deepEqual(
    driftReport.candidate_rulebooks,
    ["pricing_exception"],
    "candidate rulebook selector should be reported"
  );
  assert.equal(driftReport.fixtures_total, 1, "candidate dry-run should filter one fixture");
  assert.equal(driftReport.drift_count, 1, "candidate dry-run should report one drift");
  assert.equal(driftReport.results?.[0]?.id, "pricing_exception_direct_approve", "candidate drift fixture mismatch");
  assert.equal(driftReport.results?.[0]?.status, "drift", "candidate result should be drift");
  assert.ok(
    driftReport.results?.[0]?.drifts?.some((entry) => entry.field === "rulebook"),
    "candidate drift should include rulebook lineage drift"
  );
  assert.ok(
    driftReport.results?.[0]?.drifts?.some((entry) => entry.field === "attestation_hash"),
    "candidate drift should include attestation hash drift"
  );

  const allowedOutput = execFileSync(
    process.execPath,
    [
      "scripts/rulebook-migration-dry-run.js",
      "--json",
      "--allow-drift",
      "--fixture",
      "pricing_exception_direct_approve",
      "--candidate-rulebook",
      "pricing_exception=scripts/fixtures/decision-contract/pricing-exception-2026-07-01-rulebook.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    }
  );
  const allowed = JSON.parse(allowedOutput);
  assert.equal(allowed.ok, false, "allow-drift should preserve not-ok report semantics");
  assert.equal(allowed.drift_count, 1, "allow-drift should preserve drift count");

  let invalidManifestReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--migration",
        "scripts/fixtures/decision-contract/invalid-migration-extra-field.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    invalidManifestReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 2, "invalid migration manifest should exit 2 before replay");
  }
  assert.ok(invalidManifestReport, "invalid manifest dry-run should fail with a JSON report");
  assert.equal(invalidManifestReport.gate_passed, false, "invalid manifest gate should block");
  assert.ok(
    invalidManifestReport.config_errors?.some(
      (entry) => entry.includes("unexpected") && entry.includes("additionalProperties")
    ),
    "invalid manifest should report schema additionalProperties violation"
  );

  let pendingManifestReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--migration",
        "scripts/fixtures/decision-contract/pricing-exception-2026-07-01-migration-pending.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    pendingManifestReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 1, "pending manifest with expected drift should exit 1");
  }
  assert.ok(pendingManifestReport, "pending manifest dry-run should fail with a JSON report");
  assert.equal(pendingManifestReport.migration?.schema_version, "rulebook_migration_v1", "manifest schema mismatch");
  assert.equal(
    pendingManifestReport.migration?.migration_id,
    "pricing_exception_2026_07_01_pending",
    "manifest id mismatch"
  );
  assert.equal(pendingManifestReport.migration?.approval_status, "pending", "pending approval status mismatch");
  assert.equal(pendingManifestReport.gate_passed, false, "pending manifest gate should block");
  assert.equal(pendingManifestReport.approval_required, true, "pending manifest should require approval");
  assert.equal(pendingManifestReport.expected_drift_count, 2, "pending manifest should classify expected drift fields");
  assert.equal(pendingManifestReport.unexpected_drift_count, 0, "pending manifest should have no unexpected drift");

  const approvedManifestOutput = execFileSync(
    process.execPath,
    [
      "scripts/rulebook-migration-dry-run.js",
      "--json",
      "--migration",
      "scripts/fixtures/decision-contract/pricing-exception-2026-07-01-migration-approved.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    }
  );
  const approvedManifest = JSON.parse(approvedManifestOutput);
  assert.equal(approvedManifest.ok, false, "approved manifest should still report drift in strict ok semantics");
  assert.equal(approvedManifest.gate_passed, true, "approved manifest gate should pass expected drift");
  assert.equal(approvedManifest.migration?.approval_status, "approved", "approved manifest status mismatch");
  assert.equal(approvedManifest.expected_drift_count, 2, "approved manifest expected drift count mismatch");
  assert.equal(approvedManifest.unexpected_drift_count, 0, "approved manifest unexpected drift mismatch");
}

function testRulebookRuntimeArchitectureDoc() {
  const architecturePath = join(__dirname, "..", "docs", "RULEBOOK_RUNTIME_ARCHITECTURE.md");
  const rulebookDocPath = join(__dirname, "..", "docs", "RULEBOOK_V1.md");
  const compatibilityPolicyPath = join(__dirname, "..", "docs", "RULEBOOK_COMPATIBILITY_POLICY.md");
  const migrationExamplesPath = join(__dirname, "..", "docs", "RULEBOOK_MIGRATION_EXAMPLES.md");
  const schemaPath = join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json");
  assert.ok(existsSync(architecturePath), "rulebook runtime architecture doc is missing");
  assert.ok(existsSync(rulebookDocPath), "rulebook contract doc is missing");
  assert.ok(existsSync(compatibilityPolicyPath), "rulebook compatibility policy doc is missing");
  assert.ok(existsSync(migrationExamplesPath), "rulebook migration examples doc is missing");
  assert.ok(existsSync(schemaPath), "public Rulebook v1 JSON Schema artifact is missing");
  const architecture = readFileSync(architecturePath, "utf8");
  const rulebookDoc = readFileSync(rulebookDocPath, "utf8");
  const compatibilityPolicy = readFileSync(compatibilityPolicyPath, "utf8");
  const migrationExamples = readFileSync(migrationExamplesPath, "utf8");
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
  assert.ok(
    rulebookDoc.includes("RULEBOOK_COMPATIBILITY_POLICY.md"),
    "rulebook contract doc must link the compatibility policy"
  );
  assert.ok(
    architecture.includes("RULEBOOK_COMPATIBILITY_POLICY.md"),
    "runtime architecture doc must link the compatibility policy"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_COMPATIBILITY_POLICY.md"),
    "README must link the compatibility policy"
  );
  assert.ok(
    rulebookDoc.includes("RULEBOOK_MIGRATION_EXAMPLES.md"),
    "rulebook contract doc must link migration examples"
  );
  assert.ok(
    compatibilityPolicy.includes("RULEBOOK_MIGRATION_EXAMPLES.md"),
    "compatibility policy must link migration examples"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_MIGRATION_EXAMPLES.md"),
    "README must link migration examples"
  );
  for (const requiredReplayMarker of [
    "https://api.decide.fyi/replay/rulebook-v1/index.json",
    "rulebook_v1_golden_replay_v1",
    "historical_rulebook_replay_v1"
  ]) {
    assert.ok(rulebookDoc.includes(requiredReplayMarker), `rulebook contract doc missing replay marker: ${requiredReplayMarker}`);
    assert.ok(
      compatibilityPolicy.includes(requiredReplayMarker),
      `compatibility policy missing replay marker: ${requiredReplayMarker}`
    );
  }
  for (const requiredMigrationMarker of [
    "Evaluator Migration Example",
    "Adapter Migration Example",
    "Rulebook Migration Example",
    "golden replay corpus",
    "rulebook_v1_golden_replay_v1",
    "historical_rulebook_replay_v1",
    "DECIDE_RULEBOOK_EVALUATOR_NEXT",
    "solana_execution_gate@1.1.0",
    "pricing_exception@2026-07-01"
  ]) {
    assert.ok(
      migrationExamples.includes(requiredMigrationMarker),
      `rulebook migration examples doc missing marker: ${requiredMigrationMarker}`
    );
  }
  for (const requiredCompatibilityMarker of [
    "Policy version: `compatibility_policy_v1`",
    "Historical replay never reinterprets stored records with the current evaluator or adapter",
    "The same `rulebook_id` plus `version` cannot bind to a different canonical rulebook hash",
    "The same `rulebook_id` plus `version` cannot silently move to a different evaluator version",
    "Adapter dependency changes require a new adapter version, a new manifest hash, and an explicit rulebook version migration",
    "Rulebook v1 remains declarative",
    "Evaluator Migration",
    "Adapter Migration",
    "Public API Compatibility",
    "conformance fixtures",
    "golden replay corpus",
    "add optional fields",
    "remove, rename, or change the meaning"
  ]) {
    assert.ok(
      compatibilityPolicy.includes(requiredCompatibilityMarker),
      `compatibility policy doc missing marker: ${requiredCompatibilityMarker}`
    );
  }
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
  assert.ok(
    rulebookDoc.includes("rulebook_contract"),
    "rulebook contract doc must document runtime schema contract metadata"
  );
  assert.ok(
    architecture.includes("validates the request rulebook against the published JSON Schema"),
    "runtime architecture doc must say the production path validates against the published schema"
  );
  assert.ok(
    architecture.includes("rulebook_attestation_v1"),
    "runtime architecture doc must mention the Rulebook v1 registry attestation"
  );
  assert.ok(
    rulebookDoc.includes("rulebook_attestation_v1"),
    "rulebook contract doc must document the Rulebook v1 registry attestation"
  );
  assert.ok(
    readme.includes("rulebook_attestation_v1"),
    "README must mention the Rulebook v1 attestation bundle"
  );
  assert.ok(
    architecture.includes("rulebook_attestation_signature_v1"),
    "runtime architecture doc must mention the Rulebook v1 signature envelope"
  );
  assert.ok(
    rulebookDoc.includes("rulebook_attestation_signature_v1"),
    "rulebook contract doc must document the Rulebook v1 signature envelope"
  );
  assert.ok(
    readme.includes("rulebook_attestation_signature_v1"),
    "README must mention the Rulebook v1 attestation signature"
  );
  assert.ok(
    rulebookDoc.includes("/.well-known/rulebook-attestation-keys.json"),
    "rulebook contract doc must document the attestation public key endpoint"
  );
  assert.ok(
    architecture.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "runtime architecture doc must document the required-signature production guard"
  );
  assert.ok(
    rulebookDoc.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "rulebook contract doc must document the required-signature production guard"
  );
  assert.ok(
    readme.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "README must mention the required-signature production guard"
  );
  assert.ok(
    architecture.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "runtime architecture doc must document attestation key history"
  );
  assert.ok(
    architecture.includes("ambient_capability_deny_v2"),
    "runtime architecture doc must document the enforced trusted-adapter capability contract"
  );
  assert.ok(
    rulebookDoc.includes("TRUSTED_ADAPTER_CAPABILITY_DENIED"),
    "rulebook contract doc must document trusted-adapter runtime capability denial"
  );
  assert.ok(
    rulebookDoc.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "rulebook contract doc must document attestation key history"
  );
  assert.ok(
    rulebookDoc.includes("Refund, Trial, Cancel, and Return Policy MCP notaries"),
    "rulebook contract doc must identify the direct-rulebook Policy MCP notaries"
  );
  assert.ok(
    rulebookDoc.includes("rules/trial-policy-notary-v1.json"),
    "rulebook contract doc must identify the trial direct-rulebook notary"
  );
  assert.ok(
    rulebookDoc.includes("rules/cancel-policy-notary-v1.json"),
    "rulebook contract doc must identify the cancel direct-rulebook notary"
  );
  assert.ok(
    rulebookDoc.includes("rules/return-policy-notary-v1.json"),
    "rulebook contract doc must identify the return direct-rulebook notary"
  );
  assert.ok(
    readme.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "README must mention attestation key history"
  );
  assert.ok(
    rulebookDoc.includes("key_history_count"),
    "rulebook contract doc must document the key history count"
  );
  assert.equal(
    rulebookDoc.includes("Add a signed rulebook bundle or registry attestation"),
    false,
    "rulebook contract doc should not list implemented registry attestation as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add cryptographic signing for `rulebook_attestation.bundle_hash`"),
    false,
    "rulebook contract doc should not list implemented attestation signing as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add key-rotation history for multiple active and retired attestation keys"),
    false,
    "rulebook contract doc should not list implemented attestation key history as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add stronger runtime enforcement for declared adapter capability denial"),
    false,
    "rulebook contract doc should not list implemented adapter capability enforcement as future work"
  );
  assert.equal(
    rulebookDoc.includes("Migrate a second materially different Krafthaus application"),
    false,
    "rulebook contract doc should not list the completed second-application migration as future work"
  );
  assert.equal(
    rulebookDoc.includes("Define evaluator and adapter migration plus long-term compatibility policy"),
    false,
    "rulebook contract doc should not list implemented compatibility policy as future work"
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
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "refund policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    fixture.expect.verdict,
    "refund policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    fixture.expect.code,
    "refund policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_within_refund_window",
    "refund policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "refund policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "refund policy Rulebook v1");
}

async function testRefundPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "vendor without refunds",
      body: { vendor: "netflix", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "DENIED",
      code: "NO_REFUNDS",
      matchedRuleId: "deny_vendor_without_refunds",
    },
    {
      label: "outside refund window",
      body: { vendor: "adobe", days_since_purchase: 15, region: "US", plan: "individual" },
      verdict: "DENIED",
      code: "OUTSIDE_WINDOW",
      matchedRuleId: null,
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", days_since_purchase: 1, region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testRefundPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, days_since_purchase: 5, region: "US", plan: "individual" },
    });

  const adobe = await evaluate("adobe");
  const apple = await evaluate("apple_app_store");
  assert.equal(adobe.json?.window_days, apple.json?.window_days, "evidence-binding comparison requires equal windows");
  assert.equal(
    adobe.json?.rulebook_result?.rulebook?.hash,
    apple.json?.rulebook_result?.rulebook?.hash,
    "refund applications should share one declarative rulebook"
  );
  assert.notEqual(
    adobe.json?.rulebook_result?.input_hash,
    apple.json?.rulebook_result?.input_hash,
    "rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testRefundPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("refund-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed refund policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "refund policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "refund policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "refund policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testRefundPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    });
    assert.equal(result.statusCode, 503, "refund policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "refund policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testTrialPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/trial/terms",
    query: { policy: "trial", action: "terms" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: { vendor: "adobe", region: "US", plan: "individual" },
  });
  assert.equal(result.statusCode, 200, "trial policy status mismatch");
  assert.equal(result.json?.verdict, "TRIAL_AVAILABLE", "trial policy legacy verdict mismatch");
  assert.equal(result.json?.code, "AUTO_CONVERTS", "trial policy legacy reason code mismatch");
  assertLineage(result.json, "trial_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "trial policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "trial_policy_notary",
    "trial policy should use the trial policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "TRIAL_AVAILABLE",
    "trial policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "AUTO_CONVERTS",
    "trial policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_trial_with_auto_conversion",
    "trial policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "trial policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "trial policy Rulebook v1");
}

async function testTrialPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "vendor without trial",
      body: { vendor: "netflix", region: "US", plan: "individual" },
      verdict: "NO_TRIAL",
      code: "TRIAL_NOT_AVAILABLE",
      matchedRuleId: "deny_no_trial",
    },
    {
      label: "trial without auto conversion",
      body: { vendor: "1password", region: "US", plan: "individual" },
      verdict: "TRIAL_AVAILABLE",
      code: "NO_AUTO_CONVERT",
      matchedRuleId: "allow_trial_without_auto_conversion",
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testTrialPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, region: "US", plan: "individual" },
    });

  const adobe = await evaluate("adobe");
  const crunchyroll = await evaluate("crunchyroll");
  assert.equal(adobe.json?.trial_days, crunchyroll.json?.trial_days, "evidence-binding comparison requires equal trial days");
  assert.equal(adobe.json?.auto_converts, crunchyroll.json?.auto_converts, "evidence-binding comparison requires equal auto conversion");
  assert.equal(
    adobe.json?.rulebook_result?.rulebook?.hash,
    crunchyroll.json?.rulebook_result?.rulebook?.hash,
    "trial applications should share one declarative rulebook"
  );
  assert.notEqual(
    adobe.json?.rulebook_result?.input_hash,
    crunchyroll.json?.rulebook_result?.input_hash,
    "trial rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testTrialPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("trial-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed trial policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "trial policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "trial policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "trial policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testTrialPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    });
    assert.equal(result.statusCode, 503, "trial policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "trial policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testCancelPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/cancel/penalty",
    query: { policy: "cancel", action: "penalty" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: { vendor: "adobe", region: "US", plan: "individual" },
  });
  assert.equal(result.statusCode, 200, "cancel policy status mismatch");
  assert.equal(result.json?.verdict, "PENALTY", "cancel policy legacy verdict mismatch");
  assert.equal(result.json?.code, "EARLY_TERMINATION_FEE", "cancel policy legacy reason code mismatch");
  assertLineage(result.json, "cancel_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "cancel policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "cancel_policy_notary",
    "cancel policy should use the cancel policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "PENALTY",
    "cancel policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "EARLY_TERMINATION_FEE",
    "cancel policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "penalty_early_termination_fee",
    "cancel policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "cancel policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "cancel policy Rulebook v1");
}

async function testCancelPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "free cancellation",
      body: { vendor: "netflix", region: "US", plan: "individual" },
      verdict: "FREE_CANCEL",
      code: "NO_PENALTY",
      matchedRuleId: "allow_free_cancel",
    },
    {
      label: "early termination fee",
      body: { vendor: "adobe", region: "US", plan: "individual" },
      verdict: "PENALTY",
      code: "EARLY_TERMINATION_FEE",
      matchedRuleId: "penalty_early_termination_fee",
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testCancelPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, region: "US", plan: "individual" },
    });

  const netflix = await evaluate("netflix");
  const hulu = await evaluate("hulu");
  assert.equal(netflix.json?.policy, hulu.json?.policy, "evidence-binding comparison requires equal policy enum");
  assert.equal(netflix.json?.notice_days, hulu.json?.notice_days, "evidence-binding comparison requires equal notice days");
  assert.equal(
    netflix.json?.rulebook_result?.rulebook?.hash,
    hulu.json?.rulebook_result?.rulebook?.hash,
    "cancel applications should share one declarative rulebook"
  );
  assert.notEqual(
    netflix.json?.rulebook_result?.input_hash,
    hulu.json?.rulebook_result?.input_hash,
    "cancel rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testCancelPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("cancel-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed cancel policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "cancel policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "cancel policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "cancel policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testCancelPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    });
    assert.equal(result.statusCode, 503, "cancel policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "cancel policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testReturnPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/return/eligibility",
    query: { policy: "return", action: "eligibility" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
  });
  assert.equal(result.statusCode, 200, "return policy status mismatch");
  assert.equal(result.json?.verdict, "RETURNABLE", "return policy legacy verdict mismatch");
  assert.equal(result.json?.code, "FULL_RETURN", "return policy legacy reason code mismatch");
  assertLineage(result.json, "return_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "return policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "return_policy_notary",
    "return policy should use the return policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "RETURNABLE",
    "return policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "FULL_RETURN",
    "return policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_full_return",
    "return policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "return policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "return policy Rulebook v1");
}

async function testReturnPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "full return",
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
      verdict: "RETURNABLE",
      code: "FULL_RETURN",
      matchedRuleId: "allow_full_return",
    },
    {
      label: "prorated return",
      body: { vendor: "playstation_plus", days_since_purchase: 5, region: "US", plan: "individual" },
      verdict: "RETURNABLE",
      code: "PRORATED_RETURN",
      matchedRuleId: "allow_prorated_return",
    },
    {
      label: "vendor without returns",
      body: { vendor: "netflix", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "NON_RETURNABLE",
      code: "NO_RETURNS",
      matchedRuleId: "deny_no_returns",
    },
    {
      label: "expired return window",
      body: { vendor: "adobe", days_since_purchase: 30, region: "US", plan: "individual" },
      verdict: "EXPIRED",
      code: "OUTSIDE_WINDOW",
      matchedRuleId: null,
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", days_since_purchase: 1, region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testReturnPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, days_since_purchase: 5, region: "US", plan: "individual" },
    });

  const adobe = await evaluate("adobe");
  const apple = await evaluate("apple_app_store");
  assert.equal(adobe.json?.return_window_days, apple.json?.return_window_days, "evidence-binding comparison requires equal return windows");
  assert.equal(adobe.json?.return_type, apple.json?.return_type, "evidence-binding comparison requires equal return type");
  assert.equal(
    adobe.json?.rulebook_result?.rulebook?.hash,
    apple.json?.rulebook_result?.rulebook?.hash,
    "return applications should share one declarative rulebook"
  );
  assert.notEqual(
    adobe.json?.rulebook_result?.input_hash,
    apple.json?.rulebook_result?.input_hash,
    "return rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testReturnPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("return-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed return policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "return policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "return policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "return policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testReturnPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    });
    assert.equal(result.statusCode, 503, "return policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "return policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
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
    ["decide-rulebook-enforces-published-schema", testDecideRulebookEnforcesPublishedSchema],
    ["decide-rulebook-missing-input", testDecideRulebookMissingInput],
    ["decide-rulebook-attestation-signing", testDecideRulebookAttestationSigning],
    ["decide-rulebook-requires-signed-attestation", testDecideRulebookRequiresSignedAttestation],
    ["rulebook-attestation-key-history", testRulebookAttestationPublishesKeyHistory],
    ["rulebook-attestation-rejects-invalid-key-history", testRulebookAttestationRejectsInvalidKeyHistory],
    ["decide-rulebook-rejects-executable-operator", testDecideRulebookRejectsExecutableOperator],
    ["decide-rulebook-rejects-executable-payload-fields", testDecideRulebookRejectsExecutablePayloadFields],
    ["decide-trusted-adapter-v1", testDecideTrustedAdapterFixture],
    ["trusted-adapter-capability-audit", testTrustedAdapterCapabilityAudit],
    ["trusted-adapter-capability-runtime-enforcement", testTrustedAdapterCapabilityRuntimeEnforcement],
    ["trusted-adapter-cold-start-isolation", testTrustedAdapterColdStartIsolation],
    ["decide-trusted-adapter-manifest-drift", testDecideTrustedAdapterRejectsManifestDrift],
    ["decide-trusted-adapter-rejects-executable-payload-fields", testDecideTrustedAdapterRejectsExecutablePayloadFields],
    ["decide-trusted-adapter-rejects-executable-input-fields", testDecideTrustedAdapterRejectsExecutableInputFields],
    ["rulebook-v1-public-conformance-fixtures", testRulebookV1PublicConformanceFixtures],
    ["rulebook-v1-golden-replay-corpus", testRulebookV1GoldenReplayCorpus],
    ["rulebook-migration-dry-run-cli", testRulebookMigrationDryRunCli],
    ["rulebook-runtime-architecture-doc", testRulebookRuntimeArchitectureDoc],
    ["decide-model-fallback-order", testDecideModelFallbackOrder],
    ["decide-model-fallback-empty-text", testDecideModelFallbackOnEmptyText],
    ["decide-extended-fallback-order", testDecideExtendedFallbackOrder],
    ["policy-v1-dispatch", testPolicyV1Fixture],
    ["refund-policy-rulebook-outcomes", testRefundPolicyRulebookOutcomes],
    ["refund-policy-rulebook-binds-evidence-identity", testRefundPolicyRulebookBindsEvidenceIdentity],
    ["refund-policy-rulebook-signs-attestation", testRefundPolicyRulebookSignsAttestation],
    ["refund-policy-rulebook-requires-signed-attestation", testRefundPolicyRulebookRequiresSignedAttestation],
    ["trial-policy-rulebook", testTrialPolicyRulebookFixture],
    ["trial-policy-rulebook-outcomes", testTrialPolicyRulebookOutcomes],
    ["trial-policy-rulebook-binds-evidence-identity", testTrialPolicyRulebookBindsEvidenceIdentity],
    ["trial-policy-rulebook-signs-attestation", testTrialPolicyRulebookSignsAttestation],
    ["trial-policy-rulebook-requires-signed-attestation", testTrialPolicyRulebookRequiresSignedAttestation],
    ["cancel-policy-rulebook", testCancelPolicyRulebookFixture],
    ["cancel-policy-rulebook-outcomes", testCancelPolicyRulebookOutcomes],
    ["cancel-policy-rulebook-binds-evidence-identity", testCancelPolicyRulebookBindsEvidenceIdentity],
    ["cancel-policy-rulebook-signs-attestation", testCancelPolicyRulebookSignsAttestation],
    ["cancel-policy-rulebook-requires-signed-attestation", testCancelPolicyRulebookRequiresSignedAttestation],
    ["return-policy-rulebook", testReturnPolicyRulebookFixture],
    ["return-policy-rulebook-outcomes", testReturnPolicyRulebookOutcomes],
    ["return-policy-rulebook-binds-evidence-identity", testReturnPolicyRulebookBindsEvidenceIdentity],
    ["return-policy-rulebook-signs-attestation", testReturnPolicyRulebookSignsAttestation],
    ["return-policy-rulebook-requires-signed-attestation", testReturnPolicyRulebookRequiresSignedAttestation],
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
