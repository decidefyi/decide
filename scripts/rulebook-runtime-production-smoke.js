#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAdvisoryDecisionContract } from "../lib/rulebook-runtime-contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");

const DEFAULT_BASE_URL = "https://api.decide.fyi";
const DEFAULT_TIMEOUT_MS = 20000;
const EXPECTED_CORE = "hybrid_declarative_rulebook_with_trusted_adapters";
const DIRECT_BINDING = "direct_declarative_rulebook";
const TRUSTED_ADAPTER_BINDING = "trusted_adapter_facts_then_declarative_rulebook";
const KRAFTHAUS_WORKFLOW_FIXTURE_ID = "krafthaus_workflow_readiness_adapter_bind";
const KRAFTHAUS_WORKFLOW_FIXTURE_FILE = "krafthaus-workflow-readiness-adapter-bind.json";
const EXECUTABLE_FIELD_ROOTS = ["code", "source", "script", "function", "handler", "javascript", "typescript", "wasm"];

function usage() {
  console.log(`Usage:
  npm run smoke:rulebook-runtime

Options:
  --base-url <url>       Target origin. Default: ${DEFAULT_BASE_URL}
  --api-key <key>        Optional Decide API key if the target requires auth.
  --timeout-ms <number>  Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --allow-unsigned       Do not require signed Rulebook attestations.
  --help                 Show this help.

Env:
  DECIDE_RULEBOOK_RUNTIME_SMOKE_BASE_URL   Alternate target origin.
  DECIDE_RULEBOOK_RUNTIME_SMOKE_API_KEY    Optional API key.
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.DECIDE_RULEBOOK_RUNTIME_SMOKE_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.DECIDE_RULEBOOK_RUNTIME_SMOKE_API_KEY || "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowUnsigned: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || "";
    } else if (arg === "--api-key") {
      args.apiKey = argv[++index] || "";
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++index] || DEFAULT_TIMEOUT_MS);
    } else if (arg === "--allow-unsigned") {
      args.allowUnsigned = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("base URL is required");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("base URL must use http or https");
  }
  return url.origin;
}

function loadFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
}

function loadRepoJson(...segments) {
  return JSON.parse(readFileSync(join(REPO_ROOT, ...segments), "utf8"));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function requestJson({ baseUrl, path, method = "GET", body, apiKey, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "accept": "application/json",
      "user-agent": "decide-rulebook-runtime-production-smoke/1.0",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${method} ${path}: response was not JSON: ${text.slice(0, 180)}`);
    }
    return { response, json };
  } finally {
    clearTimeout(timer);
  }
}

function assertRuntimeBinding(payload, expectedMode, label) {
  expect(payload?.runtime_binding?.production_core === EXPECTED_CORE, `${label}: production core mismatch`);
  expect(payload?.runtime_binding?.binding_mode === expectedMode, `${label}: binding mode mismatch`);
  expect(payload?.runtime_binding?.verdict_authority === "declarative_rulebook", `${label}: verdict authority mismatch`);
  expect(payload?.runtime_binding?.customer_supplied_code === "rejected", `${label}: customer code stance mismatch`);
  if (expectedMode === TRUSTED_ADAPTER_BINDING) {
    expect(payload?.runtime_binding?.adapter_authority === "facts_only", `${label}: adapter authority mismatch`);
  }
}

function assertUnknownField(errors, expectedField, label) {
  expect(Array.isArray(errors), `${label}: errors missing`);
  expect(
    errors.some((entry) => entry?.field === expectedField && entry?.code === "unknown_field"),
    `${label}: expected unknown_field for ${expectedField}`
  );
}

function assertAdvisoryDecisionContract(payload, expectedMode, label) {
  expect(
    sameJson(payload?.decision_contract, buildAdvisoryDecisionContract({ mode: expectedMode })),
    `${label}: advisory decision contract mismatch`
  );
  expect(payload?.rulebook_contract === undefined, `${label}: advisory response exposed rulebook contract`);
  expect(payload?.runtime_binding === undefined, `${label}: advisory response exposed runtime binding`);
}

async function assertKrafthausWorkflowReadinessBinding({ baseUrl, apiKey, timeoutMs, allowUnsigned }) {
  const conformanceIndex = await requestJson({
    baseUrl,
    path: "/conformance/rulebook-v1/index.json",
    apiKey,
    timeoutMs,
  });
  expect(conformanceIndex.response.status === 200, `Krafthaus workflow conformance index: expected 200, got ${conformanceIndex.response.status}`);
  expect(
    conformanceIndex.json?.fixtures?.some((fixture) => fixture?.id === KRAFTHAUS_WORKFLOW_FIXTURE_ID),
    "Krafthaus workflow conformance index: fixture missing"
  );

  const fixture = await requestJson({
    baseUrl,
    path: `/conformance/rulebook-v1/${KRAFTHAUS_WORKFLOW_FIXTURE_FILE}`,
    apiKey,
    timeoutMs,
  });
  expect(fixture.response.status === 200, `Krafthaus workflow fixture: expected 200, got ${fixture.response.status}`);
  expect(fixture.json?.id === KRAFTHAUS_WORKFLOW_FIXTURE_ID, "Krafthaus workflow fixture: id mismatch");
  expect(fixture.json?.request?.path === "/api/decide", "Krafthaus workflow fixture: request path mismatch");
  expect(fixture.json?.request?.body?.adapter?.adapter_id === "krafthaus_workflow_readiness", "Krafthaus workflow fixture: adapter id mismatch");

  const decision = await requestJson({
    baseUrl,
    path: fixture.json.request.path,
    method: fixture.json.request.method,
    body: fixture.json.request.body,
    apiKey,
    timeoutMs,
  });
  expect(decision.response.status === fixture.json.expect.statusCode, `Krafthaus workflow decision: expected ${fixture.json.expect.statusCode}, got ${decision.response.status}`);
  expect(decision.json?.verdict === fixture.json.expect.decision, "Krafthaus workflow decision: decision mismatch");
  expect(decision.json?.application_verdict === fixture.json.expect.application_verdict, "Krafthaus workflow decision: application verdict mismatch");
  expect(decision.json?.action === fixture.json.expect.action, "Krafthaus workflow decision: action mismatch");
  expect(decision.json?.reason_code === fixture.json.expect.reason_code, "Krafthaus workflow decision: reason code mismatch");
  expect(decision.json?.matched_rule_id === fixture.json.expect.matched_rule_id, "Krafthaus workflow decision: matched rule mismatch");
  expect(decision.json?.trusted_adapter?.adapter_id === "krafthaus_workflow_readiness", "Krafthaus workflow decision: adapter id mismatch");
  expect(decision.json?.trusted_adapter?.manifest_hash === fixture.json.request.body.adapter.manifest_hash, "Krafthaus workflow decision: manifest hash mismatch");
  assertRuntimeBinding(decision.json, TRUSTED_ADAPTER_BINDING, "Krafthaus workflow decision");
  for (const [field, expectedValue] of Object.entries(fixture.json.expect.adapter_facts || {})) {
    expect(decision.json?.adapter_facts?.[field] === expectedValue, `Krafthaus workflow decision: adapter fact mismatch for ${field}`);
  }
  expect(decision.json?.rulebook_attestation?.schema_version === "rulebook_attestation_v1", "Krafthaus workflow decision: attestation missing");
  if (!allowUnsigned) {
    expect(decision.json?.rulebook_attestation?.signature?.status === "signed", "Krafthaus workflow decision: attestation must be signed");
  }

  const replayIndex = await requestJson({
    baseUrl,
    path: "/replay/rulebook-v1/index.json",
    apiKey,
    timeoutMs,
  });
  expect(replayIndex.response.status === 200, `Krafthaus workflow replay index: expected 200, got ${replayIndex.response.status}`);
  expect(
    replayIndex.json?.fixtures?.some((entry) => entry?.id === KRAFTHAUS_WORKFLOW_FIXTURE_ID),
    "Krafthaus workflow replay index: fixture missing"
  );

  const replay = await requestJson({
    baseUrl,
    path: `/replay/rulebook-v1/${KRAFTHAUS_WORKFLOW_FIXTURE_FILE}`,
    apiKey,
    timeoutMs,
  });
  expect(replay.response.status === 200, `Krafthaus workflow replay fixture: expected 200, got ${replay.response.status}`);
  expect(replay.json?.id === KRAFTHAUS_WORKFLOW_FIXTURE_ID, "Krafthaus workflow replay fixture: id mismatch");
  expect(
    replay.json?.historical_record?.semantic_output?.application_verdict === fixture.json.expect.application_verdict,
    "Krafthaus workflow replay fixture: historical verdict mismatch"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS;
  const apiKey = String(args.apiKey || "").trim();
  const validFixture = loadFixture("decide-rulebook-v1.json");
  const executableFixture = loadRepoJson("public", "conformance", "rulebook-v1", "executable-payload-rejected.json");
  const unsupportedBindingModeFixture = loadRepoJson(
    "public",
    "conformance",
    "rulebook-v1",
    "customer-executable-rulebook-rejected.json"
  );
  const outputMaterialFixture = loadRepoJson("public", "conformance", "rulebook-v1", "caller-output-material-rejected.json");
  const inputOutputMaterialFixture = loadRepoJson(
    "public",
    "conformance",
    "rulebook-v1",
    "caller-input-output-material-rejected.json"
  );

  const health = await requestJson({ baseUrl, path: "/api/health", apiKey, timeoutMs });
  expect(health.response.status === 200, `health: expected 200, got ${health.response.status}`);
  expect(health.json?.ok === true, "health: expected ok=true");
  console.log("PASS health");

  const manifest = await requestJson({ baseUrl, path: "/manifests/rulebook-runtime-v1.json", apiKey, timeoutMs });
  expect(manifest.response.status === 200, `manifest: expected 200, got ${manifest.response.status}`);
  expect(manifest.json?.manifest_version === "rulebook_runtime_manifest_v1", "manifest: version mismatch");
  expect(manifest.json?.execution_model?.production_core === EXPECTED_CORE, "manifest: production core mismatch");
  expect(manifest.json?.execution_model?.binding_verdict_selector === "declarative_rulebook", "manifest: verdict selector mismatch");
  expect(manifest.json?.execution_model?.customer_supplied_code === "rejected", "manifest: customer code stance mismatch");
  expect(
    manifest.json?.execution_model?.response_only_material_policy?.status === "rejected_on_request",
    "manifest: response-only material policy missing"
  );
  expect(
    manifest.json?.execution_model?.response_only_material_policy?.error === "RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN",
    "manifest: response-only material policy error mismatch"
  );
  expect(
    manifest.json?.execution_model?.response_only_material_policy?.fields?.includes("runtime_binding"),
    "manifest: runtime_binding must be response-only"
  );
  expect(
    manifest.json?.execution_model?.response_only_material_policy?.fields?.includes("application_verdict"),
    "manifest: application_verdict must be response-only"
  );
  expect(
    manifest.json?.execution_model?.response_only_material_policy?.fields?.includes("decision_contract"),
    "manifest: decision_contract must be response-only"
  );
  expect(
    manifest.json?.execution_model?.binding_modes?.some((entry) => entry?.mode === DIRECT_BINDING && entry?.status === "supported"),
    "manifest: direct declarative binding missing"
  );
  expect(
    manifest.json?.execution_model?.binding_modes?.some((entry) => entry?.mode === TRUSTED_ADAPTER_BINDING && entry?.status === "supported"),
    "manifest: trusted adapter binding missing"
  );
  expect(
    manifest.json?.execution_model?.unsupported_modes?.some(
      (entry) => entry?.mode === "customer_executable_rulebook" && entry?.status === "rejected"
    ),
    "manifest: executable rulebook rejection missing"
  );
  console.log("PASS runtime manifest");

  const schema = await requestJson({ baseUrl, path: "/schemas/rulebook-v1.schema.json", apiKey, timeoutMs });
  expect(schema.response.status === 200, `schema: expected 200, got ${schema.response.status}`);
  expect(schema.json?.$id === "https://api.decide.fyi/schemas/rulebook-v1.schema.json", "schema: id mismatch");
  expect(schema.json?.additionalProperties === false, "schema: root must be closed");
  for (const field of EXECUTABLE_FIELD_ROOTS) {
    expect(schema.json?.properties?.[field] === undefined, `schema: executable root field exposed: ${field}`);
  }
  expect(
    !schema.json?.$defs?.condition?.oneOf?.[3]?.properties?.operator?.enum?.includes("javascript"),
    "schema: javascript operator exposed"
  );
  console.log("PASS rulebook schema");

  const keys = await requestJson({ baseUrl, path: "/.well-known/rulebook-attestation-keys.json", apiKey, timeoutMs });
  expect(keys.response.status === 200, `attestation keys: expected 200, got ${keys.response.status}`);
  expect(keys.json?.ok === true, "attestation keys: expected ok=true");
  expect(Array.isArray(keys.json?.keys) && keys.json.keys.length > 0, "attestation keys: expected at least one key");
  if (!args.allowUnsigned) {
    expect(keys.json?.signature_required === true, "attestation keys: expected signature_required=true");
  }
  console.log("PASS attestation keys");

  const validRulebook = await requestJson({
    baseUrl,
    path: "/api/decide",
    method: "POST",
    body: validFixture.request.body,
    apiKey,
    timeoutMs,
  });
  expect(validRulebook.response.status === validFixture.expect.statusCode, `valid rulebook: expected ${validFixture.expect.statusCode}, got ${validRulebook.response.status}`);
  expect(validRulebook.json?.c === validFixture.expect.decision, "valid rulebook: decision mismatch");
  expect(validRulebook.json?.application_verdict === validFixture.expect.application_verdict, "valid rulebook: application verdict mismatch");
  expect(validRulebook.json?.reason_code === validFixture.expect.reason_code, "valid rulebook: reason code mismatch");
  expect(validRulebook.json?.matched_rule_id === validFixture.expect.matched_rule_id, "valid rulebook: matched rule mismatch");
  assertRuntimeBinding(validRulebook.json, DIRECT_BINDING, "valid rulebook");
  expect(validRulebook.json?.rulebook_contract?.schema_url === schema.json?.$id, "valid rulebook: schema URL mismatch");
  expect(validRulebook.json?.rulebook_attestation?.schema_version === "rulebook_attestation_v1", "valid rulebook: attestation missing");
  if (!args.allowUnsigned) {
    expect(validRulebook.json?.rulebook_attestation?.signature?.status === "signed", "valid rulebook: attestation must be signed");
  }
  console.log("PASS direct declarative rulebook");

  const rejectedExecutable = await requestJson({
    baseUrl,
    path: executableFixture.request.path,
    method: executableFixture.request.method,
    body: executableFixture.request.body,
    apiKey,
    timeoutMs,
  });
  expect(
    rejectedExecutable.response.status === executableFixture.expect.statusCode,
    `executable rejection: expected ${executableFixture.expect.statusCode}, got ${rejectedExecutable.response.status}`
  );
  expect(rejectedExecutable.json?.error === executableFixture.expect.error, "executable rejection: error mismatch");
  for (const field of executableFixture.expect.expected_unknown_fields) {
    assertUnknownField(rejectedExecutable.json?.errors, field, "executable rejection");
  }
  console.log("PASS executable rulebook rejection");

  const rejectedUnsupportedBindingMode = await requestJson({
    baseUrl,
    path: unsupportedBindingModeFixture.request.path,
    method: unsupportedBindingModeFixture.request.method,
    body: unsupportedBindingModeFixture.request.body,
    apiKey,
    timeoutMs,
  });
  expect(
    rejectedUnsupportedBindingMode.response.status === unsupportedBindingModeFixture.expect.statusCode,
    `customer executable binding rejection: expected ${unsupportedBindingModeFixture.expect.statusCode}, got ${rejectedUnsupportedBindingMode.response.status}`
  );
  expect(
    rejectedUnsupportedBindingMode.json?.error === unsupportedBindingModeFixture.expect.error,
    "customer executable binding rejection: error mismatch"
  );
  expect(
    rejectedUnsupportedBindingMode.json?.binding_mode === unsupportedBindingModeFixture.expect.binding_mode,
    "customer executable binding rejection: binding mode mismatch"
  );
  expect(
    JSON.stringify(rejectedUnsupportedBindingMode.json?.supported_binding_modes || []) ===
      JSON.stringify(unsupportedBindingModeFixture.expect.supported_binding_modes),
    "customer executable binding rejection: supported binding modes mismatch"
  );
  console.log("PASS customer executable binding mode rejection");

  const rejectedOutputMaterial = await requestJson({
    baseUrl,
    path: outputMaterialFixture.request.path,
    method: outputMaterialFixture.request.method,
    body: outputMaterialFixture.request.body,
    apiKey,
    timeoutMs,
  });
  expect(
    rejectedOutputMaterial.response.status === outputMaterialFixture.expect.statusCode,
    `output material rejection: expected ${outputMaterialFixture.expect.statusCode}, got ${rejectedOutputMaterial.response.status}`
  );
  expect(rejectedOutputMaterial.json?.error === outputMaterialFixture.expect.error, "output material rejection: error mismatch");
  expect(
    JSON.stringify(rejectedOutputMaterial.json?.forbidden_fields || []) ===
      JSON.stringify(outputMaterialFixture.expect.forbidden_fields),
    "output material rejection: forbidden fields mismatch"
  );
  console.log("PASS caller-supplied output material rejection");

  const rejectedInputOutputMaterial = await requestJson({
    baseUrl,
    path: inputOutputMaterialFixture.request.path,
    method: inputOutputMaterialFixture.request.method,
    body: inputOutputMaterialFixture.request.body,
    apiKey,
    timeoutMs,
  });
  expect(
    rejectedInputOutputMaterial.response.status === inputOutputMaterialFixture.expect.statusCode,
    `input output material rejection: expected ${inputOutputMaterialFixture.expect.statusCode}, got ${rejectedInputOutputMaterial.response.status}`
  );
  expect(
    rejectedInputOutputMaterial.json?.error === inputOutputMaterialFixture.expect.error,
    "input output material rejection: error mismatch"
  );
  expect(
    JSON.stringify(rejectedInputOutputMaterial.json?.forbidden_fields || []) ===
      JSON.stringify(inputOutputMaterialFixture.expect.forbidden_fields),
    "input output material rejection: forbidden fields mismatch"
  );
  console.log("PASS caller-supplied input output material rejection");

  await assertKrafthausWorkflowReadinessBinding({ baseUrl, apiKey, timeoutMs, allowUnsigned: args.allowUnsigned });
  console.log("PASS Krafthaus workflow readiness binding");

  const advisoryDecision = await requestJson({
    baseUrl,
    path: "/api/decide",
    method: "POST",
    body: {
      mode: "multi",
      stem: "Which boundary should be binding?",
      options: ["Rulebook v1", "LLM-only judgment", "Customer executable code"],
    },
    apiKey,
    timeoutMs,
  });
  expect(advisoryDecision.response.status === 200, `advisory contract: expected 200, got ${advisoryDecision.response.status}`);
  assertAdvisoryDecisionContract(advisoryDecision.json, "multi", "advisory contract");
  console.log("PASS advisory decision contract");

  console.log("PASS rulebook runtime production smoke");
  console.log(`base_url=${baseUrl}`);
  console.log(`production_core=${EXPECTED_CORE}`);
  console.log(`direct_binding=${DIRECT_BINDING}`);
  console.log(`trusted_adapter_binding=${TRUSTED_ADAPTER_BINDING}`);
  console.log(`krafthaus_workflow_fixture=${KRAFTHAUS_WORKFLOW_FIXTURE_ID}`);
}

main().catch((error) => {
  console.error(`FAIL rulebook runtime production smoke: ${error.message}`);
  process.exitCode = 1;
});
