import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const schemaPath = join(repoRoot, "public", "schemas", "rulebook-v1.schema.json");
const conformanceIndexPath = join(repoRoot, "public", "conformance", "rulebook-v1", "index.json");
const replayIndexPath = join(repoRoot, "public", "replay", "rulebook-v1", "index.json");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const RULEBOOK_SCHEMA_TEXT = readFileSync(schemaPath, "utf8");
const RULEBOOK_JSON_SCHEMA = Object.freeze(JSON.parse(RULEBOOK_SCHEMA_TEXT));
const conformanceIndex = readJson(conformanceIndexPath);
const replayIndex = readJson(replayIndexPath);

const RULEBOOK_RUNTIME_MANIFEST_VERSION = "rulebook_runtime_manifest_v1";
const RULEBOOK_RUNTIME_MANIFEST_URL = "https://api.decide.fyi/manifests/rulebook-runtime-v1.json";
const RULEBOOK_SCHEMA_VERSION = RULEBOOK_JSON_SCHEMA.properties?.schema_version?.const;
const RULEBOOK_SCHEMA_URL = RULEBOOK_JSON_SCHEMA.$id;
const RULEBOOK_SCHEMA_HASH = sha256(RULEBOOK_SCHEMA_TEXT);
const RULEBOOK_EVALUATOR_VERSION = RULEBOOK_JSON_SCHEMA["x-decide-evaluator-version"];

const RULEBOOK_RUNTIME_CONTRACT = Object.freeze({
  schema_version: RULEBOOK_SCHEMA_VERSION,
  schema_url: RULEBOOK_SCHEMA_URL,
  schema_hash: RULEBOOK_SCHEMA_HASH,
  evaluator_version: RULEBOOK_EVALUATOR_VERSION,
});

function buildRulebookRuntimeManifest() {
  return {
    manifest_version: RULEBOOK_RUNTIME_MANIFEST_VERSION,
    manifest_url: RULEBOOK_RUNTIME_MANIFEST_URL,
    rulebook_contract: { ...RULEBOOK_RUNTIME_CONTRACT },
    execution_model: {
      binding_verdict_selector: "declarative_rulebook",
      customer_supplied_code: "rejected",
      trusted_adapters: "registered_fact_producers",
    },
    conformance: {
      index_url: "https://api.decide.fyi/conformance/rulebook-v1/index.json",
      version: conformanceIndex.conformance_version,
    },
    replay: {
      index_url: "https://api.decide.fyi/replay/rulebook-v1/index.json",
      corpus_version: replayIndex.corpus_version,
      contract: replayIndex.replay_contract,
    },
  };
}

export {
  RULEBOOK_EVALUATOR_VERSION,
  RULEBOOK_JSON_SCHEMA,
  RULEBOOK_RUNTIME_CONTRACT,
  RULEBOOK_RUNTIME_MANIFEST_URL,
  RULEBOOK_RUNTIME_MANIFEST_VERSION,
  RULEBOOK_SCHEMA_HASH,
  RULEBOOK_SCHEMA_TEXT,
  RULEBOOK_SCHEMA_URL,
  RULEBOOK_SCHEMA_VERSION,
  buildRulebookRuntimeManifest,
};
