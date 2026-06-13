#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");

const DEFAULT_BASE_URL = "https://api.decide.fyi";
const DEFAULT_TIMEOUT_MS = 20000;
const EXPECTED_CORE = "hybrid_declarative_rulebook_with_trusted_adapters";
const DIRECT_BINDING = "direct_declarative_rulebook";
const TRUSTED_ADAPTER_BINDING = "trusted_adapter_facts_then_declarative_rulebook";
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
    payload?.decision_contract?.schema_version === "decide_decision_contract_v1",
    `${label}: decision contract schema mismatch`
  );
  expect(payload?.decision_contract?.mode === expectedMode, `${label}: decision contract mode mismatch`);
  expect(payload?.decision_contract?.authority === "advisory_only", `${label}: advisory authority mismatch`);
  expect(payload?.decision_contract?.production_verdict === false, `${label}: production verdict flag mismatch`);
  expect(
    payload?.decision_contract?.binding_verdict_selector === "rulebook_v1",
    `${label}: binding verdict selector mismatch`
  );
  expect(
    payload?.decision_contract?.binding_runtime_manifest_url === "https://api.decide.fyi/manifests/rulebook-runtime-v1.json",
    `${label}: binding manifest URL mismatch`
  );
  expect(
    payload?.decision_contract?.prohibited_claim === "llm_output_is_binding_production_verdict",
    `${label}: prohibited claim mismatch`
  );
  expect(payload?.rulebook_contract === undefined, `${label}: advisory response exposed rulebook contract`);
  expect(payload?.runtime_binding === undefined, `${label}: advisory response exposed runtime binding`);
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
}

main().catch((error) => {
  console.error(`FAIL rulebook runtime production smoke: ${error.message}`);
  process.exitCode = 1;
});
