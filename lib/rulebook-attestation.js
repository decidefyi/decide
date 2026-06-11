import { createHash } from "node:crypto";
import { signRulebookAttestationBundleHash } from "./rulebook-attestation-signing.js";

export const RULEBOOK_ATTESTATION_SCHEMA_VERSION = "rulebook_attestation_v1";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function normalizeTrustedAdapter(attestation) {
  if (!isPlainObject(attestation)) return null;
  return {
    manifest_version: String(attestation.manifest_version || ""),
    adapter_id: String(attestation.adapter_id || ""),
    version: String(attestation.version || ""),
    implementation_revision: String(attestation.implementation_revision || ""),
    implementation_hash: String(attestation.implementation_hash || ""),
    manifest_hash: String(attestation.manifest_hash || ""),
    input_hash: String(attestation.input_hash || ""),
    output_hash: String(attestation.output_hash || ""),
    execution_isolation: String(attestation.execution_isolation || ""),
    capability_enforcement: String(attestation.capability_enforcement || ""),
    execution_timeout_ms: Number(attestation.execution_timeout_ms || 0),
  };
}

export function buildRulebookAttestation(result = {}) {
  const bundle = {
    engine: String(result.engine || ""),
    evaluator_version: String(result.evaluator_version || ""),
    rulebook: {
      schema_version: String(result.rulebook?.schema_version || ""),
      id: String(result.rulebook?.id || ""),
      version: String(result.rulebook?.version || ""),
      hash: String(result.rulebook?.hash || ""),
    },
    input_hash: String(result.input_hash || ""),
    outcome: {
      status: String(result.status || ""),
      verdict: String(result.verdict || ""),
      application_verdict: String(result.application_verdict || ""),
      action: String(result.action || ""),
      reason_code: String(result.reason_code || ""),
      matched_rule_id: result.matched_rule_id == null ? null : String(result.matched_rule_id),
    },
    trusted_adapter: normalizeTrustedAdapter(result.trusted_adapter),
  };
  const bundleHash = sha256(canonicalJson(bundle));

  return {
    schema_version: RULEBOOK_ATTESTATION_SCHEMA_VERSION,
    bundle_hash: bundleHash,
    bundle,
    signature: signRulebookAttestationBundleHash(bundleHash),
  };
}

export { canonicalJson as canonicalRulebookAttestationJson };
