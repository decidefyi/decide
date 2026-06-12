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
const RULEBOOK_RUNTIME_PRODUCTION_CORE = "hybrid_declarative_rulebook_with_trusted_adapters";
const RULEBOOK_DIRECT_BINDING_MODE = "direct_declarative_rulebook";
const RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE = "trusted_adapter_facts_then_declarative_rulebook";
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

function buildRulebookRuntimeBinding({ bindingMode = RULEBOOK_DIRECT_BINDING_MODE } = {}) {
  if (bindingMode === RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE) {
    return {
      production_core: RULEBOOK_RUNTIME_PRODUCTION_CORE,
      binding_mode: RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE,
      verdict_authority: "declarative_rulebook",
      adapter_authority: "facts_only",
      customer_supplied_code: "rejected",
    };
  }

  return {
    production_core: RULEBOOK_RUNTIME_PRODUCTION_CORE,
    binding_mode: RULEBOOK_DIRECT_BINDING_MODE,
    verdict_authority: "declarative_rulebook",
    customer_supplied_code: "rejected",
  };
}

function buildRulebookRuntimeManifest() {
  return {
    manifest_version: RULEBOOK_RUNTIME_MANIFEST_VERSION,
    manifest_url: RULEBOOK_RUNTIME_MANIFEST_URL,
    rulebook_contract: { ...RULEBOOK_RUNTIME_CONTRACT },
    execution_model: {
      production_core: RULEBOOK_RUNTIME_PRODUCTION_CORE,
      binding_verdict_selector: "declarative_rulebook",
      customer_supplied_code: "rejected",
      trusted_adapters: "registered_fact_producers",
      binding_modes: [
        {
          mode: RULEBOOK_DIRECT_BINDING_MODE,
          status: "supported",
          request_material: ["rulebook", "context.inputs"],
          fact_source: "caller_supplied_inputs",
          verdict_authority: "declarative_rulebook",
          customer_supplied_code: "rejected",
        },
        {
          mode: RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE,
          status: "supported",
          request_material: ["adapter", "rulebook"],
          fact_source: "registered_first_party_adapter",
          adapter_authority: "facts_only",
          verdict_authority: "declarative_rulebook",
          customer_supplied_code: "rejected",
        },
      ],
      unsupported_modes: [
        {
          mode: "customer_executable_rulebook",
          status: "rejected",
          reason: "Rulebook v1 is closed declarative JSON; executable policy logic requires a future versioned contract.",
        },
      ],
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
    application_binding: {
      contract_version: "decide_application_binding_v1",
      applies_to: "krafthaus_workflow_applications",
      must_bind_before_action: true,
      accepted_fact_sources: ["context.inputs", "adapter_facts"],
      required_decision_material: [
        "rulebook_contract",
        "runtime_binding",
        "verdict",
        "application_verdict",
        "action",
        "reason_code",
        "matched_rule_id",
        "rulebook.hash",
        "input_hash",
        "rulebook_attestation.bundle_hash",
      ],
      replay_reference: "https://api.decide.fyi/replay/rulebook-v1/index.json",
      conformance_reference: "https://api.decide.fyi/conformance/rulebook-v1/index.json",
      prohibited_claims: [
        "llm_output_is_binding_production_verdict",
        "customer_executable_code_runs_as_rulebook_v1",
        "action_executes_before_decision_material_is_captured",
      ],
    },
  };
}

export {
  RULEBOOK_DIRECT_BINDING_MODE,
  RULEBOOK_EVALUATOR_VERSION,
  RULEBOOK_JSON_SCHEMA,
  RULEBOOK_RUNTIME_PRODUCTION_CORE,
  RULEBOOK_RUNTIME_CONTRACT,
  RULEBOOK_RUNTIME_MANIFEST_URL,
  RULEBOOK_RUNTIME_MANIFEST_VERSION,
  RULEBOOK_SCHEMA_HASH,
  RULEBOOK_SCHEMA_TEXT,
  RULEBOOK_SCHEMA_URL,
  RULEBOOK_SCHEMA_VERSION,
  RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE,
  buildRulebookRuntimeBinding,
  buildRulebookRuntimeManifest,
};
