#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
import { executeTrustedAdapter } from "../lib/trusted-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const defaultCorpusPath = join(repoRoot, "public", "replay", "rulebook-v1", "index.json");
const migrationManifestSchemaPath = join(repoRoot, "public", "schemas", "rulebook-migration-v1.schema.json");
const MIGRATION_SCHEMA_VERSION = "rulebook_migration_v1";
const MIGRATION_STATUSES = new Set(["proposed", "approved", "rejected", "superseded"]);
const COMPATIBILITY_CLASSES = new Set(["evaluator", "adapter", "rulebook", "public_response", "mixed"]);
const EXPECTED_DRIFT_POLICIES = new Set(["none", "requires_approval"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveFromRepo(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function resolveLocalSchemaRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((current, segment) => current?.[segment], rootSchema);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  return typeof value;
}

function schemaTypeMatches(value, expectedType) {
  if (expectedType === "null") return value === null;
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "object") return isPlainObject(value);
  if (expectedType === "integer") return Number.isInteger(value);
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expectedType;
}

function validateJsonSchemaSubset(value, schema, rootSchema = schema, path = "migration") {
  if (schema === true) return [];
  if (schema === false) return [`Migration manifest schema violation at ${path}: schema forbids this value`];
  if (!isPlainObject(schema)) return [];

  if (schema.$ref) {
    const referencedSchema = resolveLocalSchemaRef(rootSchema, schema.$ref);
    if (!referencedSchema) {
      return [`Migration manifest schema violation at ${path}: unresolved schema ref ${schema.$ref}`];
    }
    return validateJsonSchemaSubset(value, referencedSchema, rootSchema, path);
  }

  const errors = [];
  if (Object.hasOwn(schema, "const") && !valuesEqual(value, schema.const)) {
    errors.push(`Migration manifest schema violation at ${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => valuesEqual(value, entry))) {
    errors.push(`Migration manifest schema violation at ${path}: expected one of ${schema.enum.join(", ")}`);
  }

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((entry) => schemaTypeMatches(value, entry))) {
      errors.push(
        `Migration manifest schema violation at ${path}: expected type ${expectedTypes.join("|")}, received ${valueType(value)}`
      );
      return errors;
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`Migration manifest schema violation at ${path}: minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`Migration manifest schema violation at ${path}: maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`Migration manifest schema violation at ${path}: pattern ${schema.pattern}`);
    }
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) {
      errors.push(`Migration manifest schema violation at ${path}: expected date-time`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`Migration manifest schema violation at ${path}: minItems ${schema.minItems}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`Migration manifest schema violation at ${path}: maxItems ${schema.maxItems}`);
    }
    if (schema.items !== undefined) {
      value.forEach((entry, index) => {
        errors.push(...validateJsonSchemaSubset(entry, schema.items, rootSchema, `${path}[${index}]`));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        errors.push(`Migration manifest schema violation at ${path}.${key}: required`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        errors.push(...validateJsonSchemaSubset(entry, properties[key], rootSchema, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`Migration manifest schema violation at ${path}.${key}: additionalProperties forbids field ${key}`);
      } else if (isPlainObject(schema.additionalProperties)) {
        errors.push(
          ...validateJsonSchemaSubset(entry, schema.additionalProperties, rootSchema, `${path}.${key}`)
        );
      }
    }
  }

  return errors;
}

function validateMigrationManifestSchema(manifest) {
  let schema = null;
  try {
    schema = loadJson(migrationManifestSchemaPath);
  } catch (error) {
    return [`Unable to load migration manifest JSON Schema: ${error.message}`];
  }
  return validateJsonSchemaSubset(manifest, schema);
}

function usage() {
  return `Usage: npm run rulebook:migration-dry-run -- [options]

Options:
  --json                                      Print machine-readable JSON
  --allow-drift                               Exit 0 while preserving ok:false on drift/error
  --corpus <path>                             Corpus index path (default: public/replay/rulebook-v1/index.json)
  --fixture <id>                              Replay only one fixture; repeatable
  --migration <path>                          Load a rulebook_migration_v1 manifest
  --candidate-evaluator-version <label>      Label the evaluator candidate under test
  --candidate-rulebook <rulebook_id>=<path>   Replace matching stored rulebook snapshots; repeatable
  --candidate-adapter <id>@<version>=<hash>   Replace matching adapter dependency; repeatable
  --help                                      Show this help
`;
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseCandidateRulebook(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid --candidate-rulebook value: ${value}`);
  }
  return {
    rulebookId: value.slice(0, separator),
    path: resolveFromRepo(value.slice(separator + 1)),
  };
}

function parseCandidateAdapter(value) {
  const separator = value.indexOf("=");
  const target = value.slice(0, separator);
  const manifestHash = value.slice(separator + 1);
  const versionSeparator = target.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1 || versionSeparator <= 0 || versionSeparator === target.length - 1) {
    throw new Error(`Invalid --candidate-adapter value: ${value}`);
  }
  return {
    adapterId: target.slice(0, versionSeparator),
    version: target.slice(versionSeparator + 1),
    manifestHash,
  };
}

function parseArgs(argv) {
  const options = {
    json: false,
    allowDrift: false,
    corpusPath: defaultCorpusPath,
    corpusPathExplicit: false,
    fixtureIds: [],
    migrationPath: null,
    migrationManifest: null,
    migration: null,
    configErrors: [],
    candidateEvaluatorVersion: null,
    candidateRulebooks: new Map(),
    candidateAdapters: new Map(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-drift") {
      options.allowDrift = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--corpus") {
      options.corpusPath = resolveFromRepo(takeValue(argv, index, arg));
      options.corpusPathExplicit = true;
      index += 1;
    } else if (arg === "--fixture") {
      options.fixtureIds.push(takeValue(argv, index, arg));
      index += 1;
    } else if (arg === "--migration") {
      options.migrationPath = resolveFromRepo(takeValue(argv, index, arg));
      index += 1;
    } else if (arg === "--candidate-evaluator-version") {
      options.candidateEvaluatorVersion = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--candidate-rulebook") {
      const candidate = parseCandidateRulebook(takeValue(argv, index, arg));
      options.candidateRulebooks.set(candidate.rulebookId, candidate);
      index += 1;
    } else if (arg === "--candidate-adapter") {
      const candidate = parseCandidateAdapter(takeValue(argv, index, arg));
      options.candidateAdapters.set(candidate.adapterId, candidate);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value);
}

function pathRelativeToRepo(path) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}

function validateMigrationManifest(manifest, manifestPath) {
  const errors = [];
  if (!isPlainObject(manifest)) {
    return ["Migration manifest must be an object"];
  }
  errors.push(...validateMigrationManifestSchema(manifest));
  if (manifest.schema_version !== MIGRATION_SCHEMA_VERSION) {
    errors.push(`Migration manifest schema_version must be ${MIGRATION_SCHEMA_VERSION}`);
  }
  if (typeof manifest.migration_id !== "string" || !manifest.migration_id.trim()) {
    errors.push("Migration manifest migration_id is required");
  }
  if (!MIGRATION_STATUSES.has(String(manifest.status || ""))) {
    errors.push(`Migration manifest status must be one of ${[...MIGRATION_STATUSES].join(", ")}`);
  }
  if (!COMPATIBILITY_CLASSES.has(String(manifest.compatibility_class || ""))) {
    errors.push(`Migration manifest compatibility_class must be one of ${[...COMPATIBILITY_CLASSES].join(", ")}`);
  }
  if (manifest.corpus !== undefined && typeof manifest.corpus !== "string") {
    errors.push("Migration manifest corpus must be a string path when provided");
  }
  if (manifest.fixtures !== undefined && !Array.isArray(manifest.fixtures)) {
    errors.push("Migration manifest fixtures must be an array when provided");
  }
  if (Array.isArray(manifest.fixtures)) {
    manifest.fixtures.forEach((fixture, index) => {
      if (typeof fixture !== "string" || !fixture.trim()) {
        errors.push(`Migration manifest fixtures[${index}] must be a non-empty string`);
      }
    });
  }

  const candidate = isPlainObject(manifest.candidate) ? manifest.candidate : {};
  if (manifest.candidate !== undefined && !isPlainObject(manifest.candidate)) {
    errors.push("Migration manifest candidate must be an object when provided");
  }
  if (candidate.evaluator_version !== undefined && typeof candidate.evaluator_version !== "string") {
    errors.push("Migration manifest candidate.evaluator_version must be a string when provided");
  }
  if (candidate.rulebooks !== undefined && !Array.isArray(candidate.rulebooks)) {
    errors.push("Migration manifest candidate.rulebooks must be an array when provided");
  }
  if (Array.isArray(candidate.rulebooks)) {
    candidate.rulebooks.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`Migration manifest candidate.rulebooks[${index}] must be an object`);
        return;
      }
      if (typeof entry.rulebook_id !== "string" || !entry.rulebook_id.trim()) {
        errors.push(`Migration manifest candidate.rulebooks[${index}].rulebook_id is required`);
      }
      if (typeof entry.path !== "string" || !entry.path.trim()) {
        errors.push(`Migration manifest candidate.rulebooks[${index}].path is required`);
      }
    });
  }
  if (candidate.adapters !== undefined && !Array.isArray(candidate.adapters)) {
    errors.push("Migration manifest candidate.adapters must be an array when provided");
  }
  if (Array.isArray(candidate.adapters)) {
    candidate.adapters.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`Migration manifest candidate.adapters[${index}] must be an object`);
        return;
      }
      if (typeof entry.adapter_id !== "string" || !entry.adapter_id.trim()) {
        errors.push(`Migration manifest candidate.adapters[${index}].adapter_id is required`);
      }
      if (typeof entry.version !== "string" || !entry.version.trim()) {
        errors.push(`Migration manifest candidate.adapters[${index}].version is required`);
      }
      if (typeof entry.manifest_hash !== "string" || !entry.manifest_hash.trim()) {
        errors.push(`Migration manifest candidate.adapters[${index}].manifest_hash is required`);
      }
    });
  }

  const expectedDrift = isPlainObject(manifest.expected_drift) ? manifest.expected_drift : {};
  if (manifest.expected_drift !== undefined && !isPlainObject(manifest.expected_drift)) {
    errors.push("Migration manifest expected_drift must be an object when provided");
  }
  const expectedPolicy = String(expectedDrift.policy || "none");
  if (!EXPECTED_DRIFT_POLICIES.has(expectedPolicy)) {
    errors.push(`Migration manifest expected_drift.policy must be one of ${[...EXPECTED_DRIFT_POLICIES].join(", ")}`);
  }
  for (const key of ["fixtures", "fields"]) {
    if (expectedDrift[key] !== undefined && !Array.isArray(expectedDrift[key])) {
      errors.push(`Migration manifest expected_drift.${key} must be an array when provided`);
    }
  }

  const approval = isPlainObject(manifest.approval) ? manifest.approval : {};
  if (manifest.approval !== undefined && !isPlainObject(manifest.approval)) {
    errors.push("Migration manifest approval must be an object when provided");
  }
  const approvalStatus = String(approval.status || "not_required");
  if (!["not_required", "pending", "approved", "rejected"].includes(approvalStatus)) {
    errors.push("Migration manifest approval.status must be not_required, pending, approved, or rejected");
  }
  if (approvalStatus === "approved") {
    if (manifest.status !== "approved") {
      errors.push("Migration manifest status must be approved when approval.status is approved");
    }
    if (typeof approval.approved_by !== "string" || !approval.approved_by.trim()) {
      errors.push("Migration manifest approval.approved_by is required when approved");
    }
    if (typeof approval.approved_at !== "string" || !Number.isFinite(Date.parse(approval.approved_at))) {
      errors.push("Migration manifest approval.approved_at must be an ISO timestamp when approved");
    }
  }

  if (!errors.length && expectedPolicy === "requires_approval" && approvalStatus === "not_required") {
    errors.push("Migration manifest expected drift requires an approval object");
  }
  if (!errors.length && manifestPath) {
    const normalized = pathRelativeToRepo(manifestPath);
    if (normalized.includes("..")) {
      errors.push("Migration manifest path must resolve inside the repository");
    }
  }
  return errors;
}

function applyMigrationManifest(options) {
  if (!options.migrationPath) return;

  let manifest = null;
  try {
    manifest = loadJson(options.migrationPath);
  } catch (error) {
    options.configErrors.push(`Unable to load migration manifest: ${error.message}`);
    return;
  }

  options.migrationManifest = manifest;
  options.configErrors.push(...validateMigrationManifest(manifest, options.migrationPath));
  const candidate = isPlainObject(manifest.candidate) ? manifest.candidate : {};
  const expectedDrift = isPlainObject(manifest.expected_drift) ? manifest.expected_drift : {};
  const approval = isPlainObject(manifest.approval) ? manifest.approval : {};

  options.migration = {
    schema_version: String(manifest.schema_version || ""),
    migration_id: String(manifest.migration_id || ""),
    status: String(manifest.status || ""),
    compatibility_class: String(manifest.compatibility_class || ""),
    summary: String(manifest.summary || ""),
    manifest_path: pathRelativeToRepo(options.migrationPath),
    expected_drift_policy: String(expectedDrift.policy || "none"),
    approval_status: String(approval.status || "not_required"),
    approved_by: approval.approved_by || null,
    approved_at: approval.approved_at || null,
  };

  if (typeof manifest.corpus === "string" && manifest.corpus.trim() && !options.corpusPathExplicit) {
    options.corpusPath = resolveFromRepo(manifest.corpus);
  }
  if (Array.isArray(manifest.fixtures)) {
    for (const fixture of manifest.fixtures) uniquePush(options.fixtureIds, fixture);
  }
  if (typeof candidate.evaluator_version === "string" && candidate.evaluator_version.trim()) {
    options.candidateEvaluatorVersion = candidate.evaluator_version;
  }
  if (Array.isArray(candidate.rulebooks)) {
    for (const entry of candidate.rulebooks) {
      if (isPlainObject(entry) && typeof entry.rulebook_id === "string" && typeof entry.path === "string") {
        options.candidateRulebooks.set(entry.rulebook_id, {
          rulebookId: entry.rulebook_id,
          path: resolveFromRepo(entry.path),
        });
      }
    }
  }
  if (Array.isArray(candidate.adapters)) {
    for (const entry of candidate.adapters) {
      if (
        isPlainObject(entry) &&
        typeof entry.adapter_id === "string" &&
        typeof entry.version === "string" &&
        typeof entry.manifest_hash === "string"
      ) {
        options.candidateAdapters.set(entry.adapter_id, {
          adapterId: entry.adapter_id,
          version: entry.version,
          manifestHash: entry.manifest_hash,
        });
      }
    }
  }
}

async function evaluateReplayRequest(request, options) {
  if (request?.body?.mode !== "rulebook") {
    throw new Error("Replay request must use mode=rulebook");
  }
  const body = clone(request.body);
  const candidateRulebook = options.candidateRulebooks.get(String(body.rulebook?.rulebook_id || ""));
  if (candidateRulebook) {
    const rulebook = loadJson(candidateRulebook.path);
    if (rulebook.rulebook_id !== candidateRulebook.rulebookId) {
      throw new Error(
        `Candidate rulebook selector ${candidateRulebook.rulebookId} loaded rulebook_id ${rulebook.rulebook_id || "missing"}`
      );
    }
    body.rulebook = rulebook;
  }

  const candidateAdapter = body.adapter ? options.candidateAdapters.get(String(body.adapter.adapter_id || "")) : null;
  if (candidateAdapter) {
    body.adapter = {
      ...body.adapter,
      version: candidateAdapter.version,
      manifest_hash: candidateAdapter.manifestHash,
    };
  }

  let runtimeInputs = body.context?.inputs || {};
  let trustedAdapter = null;
  if (body.adapter) {
    if (body.context?.inputs && Object.keys(body.context.inputs).length > 0) {
      throw new Error("Replay request cannot combine adapter input with context.inputs");
    }
    const adapterEvaluation = await executeTrustedAdapter(body.adapter);
    if (!adapterEvaluation.ok) {
      const detail =
        adapterEvaluation.expected_manifest_hash || adapterEvaluation.registered_manifest_hash
          ? ` expected=${adapterEvaluation.expected_manifest_hash || "n/a"} registered=${
              adapterEvaluation.registered_manifest_hash || "n/a"
            }`
          : "";
      throw new Error(`${adapterEvaluation.error}: ${adapterEvaluation.message || "adapter evaluation failed"}${detail}`);
    }
    runtimeInputs = adapterEvaluation.facts;
    trustedAdapter = adapterEvaluation.attestation;
  }

  const evaluation = evaluateRulebookV1({
    rulebook: body.rulebook,
    inputs: runtimeInputs,
  });
  if (!evaluation.ok) {
    throw new Error(`${evaluation.error}: ${evaluation.message || "rulebook evaluation failed"}`);
  }

  const result = {
    ...evaluation.result,
    ...(trustedAdapter
      ? {
          trusted_adapter: trustedAdapter,
          adapter_facts: runtimeInputs,
        }
      : {}),
  };
  result.rulebook_attestation = buildRulebookAttestation(result);
  return {
    statusCode: 200,
    json: result,
  };
}

function semanticOutput(result) {
  return {
    status: result?.status,
    verdict: result?.verdict,
    application_verdict: result?.application_verdict,
    action: result?.action,
    reason_code: result?.reason_code,
    matched_rule_id: result?.matched_rule_id,
  };
}

function actualHistoricalRecord(evaluation) {
  const result = evaluation.json || {};
  return {
    statusCode: evaluation.statusCode,
    engine: result.engine,
    evaluator_version: result.evaluator_version,
    semantic_output: semanticOutput(result),
    rulebook: result.rulebook,
    input_hash: result.input_hash,
    attestation_hash: result.rulebook_attestation?.bundle_hash,
    trusted_adapter: result.trusted_adapter || null,
    adapter_facts: result.adapter_facts || null,
  };
}

function expectedHistoricalRecord(record) {
  return {
    statusCode: record?.statusCode,
    engine: record?.engine,
    evaluator_version: record?.evaluator_version,
    semantic_output: record?.semantic_output,
    rulebook: record?.rulebook,
    input_hash: record?.input_hash,
    attestation_hash: record?.rulebook_attestation?.bundle_hash,
    trusted_adapter: record?.trusted_adapter || null,
    adapter_facts: record?.adapter_facts || null,
  };
}

function valuesEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function compareHistoricalRecord(expected, actual) {
  const fields = [
    "statusCode",
    "engine",
    "evaluator_version",
    "semantic_output",
    "rulebook",
    "input_hash",
    "attestation_hash",
    "trusted_adapter",
    "adapter_facts",
  ];
  const drifts = [];
  for (const field of fields) {
    if (!valuesEqual(expected[field], actual[field])) {
      drifts.push({
        field,
        expected: expected[field],
        actual: actual[field],
      });
    }
  }
  return drifts;
}

function fileNameFromFixtureRef(fixtureRef) {
  const url = String(fixtureRef.url || "");
  const tail = url.split("/").filter(Boolean).pop();
  if (!tail || !tail.endsWith(".json")) {
    throw new Error(`Fixture ${fixtureRef.id || "unknown"} has no JSON URL`);
  }
  return tail;
}

function classifyDrifts(results, manifest) {
  const expectedDrift = isPlainObject(manifest?.expected_drift) ? manifest.expected_drift : {};
  const policy = String(expectedDrift.policy || "none");
  const expectedFixtures = new Set(Array.isArray(expectedDrift.fixtures) ? expectedDrift.fixtures : []);
  const expectedFields = new Set(Array.isArray(expectedDrift.fields) ? expectedDrift.fields : []);
  let expectedDriftCount = 0;
  let unexpectedDriftCount = 0;

  for (const result of results) {
    for (const drift of result.drifts || []) {
      const fixtureMatches = expectedFixtures.size === 0 || expectedFixtures.has(result.id);
      const fieldMatches = expectedFields.size === 0 || expectedFields.has(drift.field);
      if (policy !== "none" && fixtureMatches && fieldMatches) {
        expectedDriftCount += 1;
      } else {
        unexpectedDriftCount += 1;
      }
    }
  }

  return {
    expected_drift_count: expectedDriftCount,
    unexpected_drift_count: unexpectedDriftCount,
  };
}

function migrationIsApproved(migration) {
  return Boolean(
    migration &&
      migration.status === "approved" &&
      migration.approval_status === "approved" &&
      migration.approved_by &&
      migration.approved_at
  );
}

async function runDryRun(options) {
  const configErrors = [...(options.configErrors || [])];
  let index = null;
  try {
    index = loadJson(options.corpusPath);
  } catch (error) {
    configErrors.push(`Unable to load corpus index: ${error.message}`);
  }

  const candidateRulebookIds = [...options.candidateRulebooks.keys()].sort();
  const candidateAdapters = [...options.candidateAdapters.values()]
    .map((entry) => `${entry.adapterId}@${entry.version}`)
    .sort();

  if (!index) {
    return {
      ok: false,
      corpus_version: null,
      replay_contract: null,
      compatibility_policy: null,
      fixtures_total: 0,
      pass_count: 0,
      drift_count: 0,
      error_count: 0,
      config_errors: configErrors,
      migration: options.migration,
      candidate_evaluator_version: options.candidateEvaluatorVersion,
      candidate_rulebooks: candidateRulebookIds,
      candidate_adapters: candidateAdapters,
      gate_passed: false,
      approval_required: false,
      expected_drift_count: 0,
      unexpected_drift_count: 0,
      results: [],
    };
  }

  for (const candidate of options.candidateRulebooks.values()) {
    try {
      const rulebook = loadJson(candidate.path);
      if (rulebook.rulebook_id !== candidate.rulebookId) {
        configErrors.push(
          `Candidate rulebook selector ${candidate.rulebookId} loaded rulebook_id ${rulebook.rulebook_id || "missing"}`
        );
      }
    } catch (error) {
      configErrors.push(`Unable to load candidate rulebook ${candidate.rulebookId}: ${error.message}`);
    }
  }

  const fixtureIds = new Set(options.fixtureIds);
  let fixtureRefs = Array.isArray(index.fixtures) ? index.fixtures : [];
  if (fixtureIds.size) {
    fixtureRefs = fixtureRefs.filter((fixtureRef) => fixtureIds.has(fixtureRef.id));
    for (const id of fixtureIds) {
      if (!fixtureRefs.some((fixtureRef) => fixtureRef.id === id)) {
        configErrors.push(`Fixture not found in corpus: ${id}`);
      }
    }
  }

  const corpusDir = dirname(options.corpusPath);
  const results = [];
  if (!configErrors.length) {
    for (const fixtureRef of fixtureRefs) {
      let fixture = null;
      try {
        fixture = loadJson(join(corpusDir, fileNameFromFixtureRef(fixtureRef)));
        const evaluation = await evaluateReplayRequest(fixture.replay?.request, options);
        const drifts = compareHistoricalRecord(
          expectedHistoricalRecord(fixture.historical_record),
          actualHistoricalRecord(evaluation)
        );
        results.push({
          id: fixture.id,
          title: fixture.title,
          kind: fixture.kind,
          status: drifts.length ? "drift" : "pass",
          drifts,
        });
      } catch (error) {
        results.push({
          id: fixture?.id || fixtureRef.id,
          title: fixture?.title || fixtureRef.title,
          kind: fixture?.kind || fixtureRef.kind,
          status: "error",
          drifts: [],
          error: String(error?.message || error),
        });
      }
    }
  }

  const passCount = results.filter((entry) => entry.status === "pass").length;
  const driftCount = results.filter((entry) => entry.status === "drift").length;
  const errorCount = results.filter((entry) => entry.status === "error").length;
  const driftClassification = classifyDrifts(results, options.migrationManifest);
  const approvedMigration = migrationIsApproved(options.migration);
  const approvalRequired = Boolean(
    options.migration &&
      driftCount > 0 &&
      driftClassification.unexpected_drift_count === 0 &&
      !approvedMigration
  );
  const gatePassed = Boolean(
    configErrors.length === 0 &&
      errorCount === 0 &&
      (driftCount === 0 || (options.migration && driftClassification.unexpected_drift_count === 0 && approvedMigration))
  );
  return {
    ok: configErrors.length === 0 && driftCount === 0 && errorCount === 0,
    corpus_version: index.corpus_version || null,
    replay_contract: index.replay_contract || null,
    compatibility_policy: index.compatibility_policy || null,
    fixtures_total: fixtureRefs.length,
    pass_count: passCount,
    drift_count: driftCount,
    error_count: errorCount,
    config_errors: configErrors,
    migration: options.migration,
    candidate_evaluator_version: options.candidateEvaluatorVersion,
    candidate_rulebooks: candidateRulebookIds,
    candidate_adapters: candidateAdapters,
    gate_passed: gatePassed,
    approval_required: approvalRequired,
    ...driftClassification,
    results,
  };
}

function printText(report) {
  const status = report.ok ? "PASS" : "DRIFT";
  console.log(`${status} ${report.corpus_version || "unknown-corpus"} fixtures=${report.fixtures_total}`);
  for (const result of report.results) {
    const suffix = result.status === "drift" ? ` (${result.drifts.map((entry) => entry.field).join(", ")})` : "";
    const error = result.status === "error" ? ` (${result.error})` : "";
    console.log(`${result.status.toUpperCase()} ${result.id}${suffix}${error}`);
  }
  if (report.config_errors.length) {
    for (const error of report.config_errors) console.error(`CONFIG ${error}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error?.message || error));
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  applyMigrationManifest(options);
  const report = await runDryRun(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }

  if (report.config_errors.length) process.exit(2);
  if (report.migration) {
    if (!report.gate_passed && !options.allowDrift) process.exit(1);
    return;
  }
  if (!report.ok && !options.allowDrift) process.exit(1);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(2);
});
