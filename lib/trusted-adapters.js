import { createHash } from "node:crypto";
import {
  auditTrustedAdapterImplementation,
  TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
  TRUSTED_ADAPTER_EXECUTION_ISOLATION,
  TRUSTED_ADAPTER_TIMEOUT_MS,
} from "./trusted-adapter-capabilities.js";
import {
  getRegisteredTrustedAdapter,
  TRUSTED_ADAPTER_MANIFEST_VERSION,
} from "./trusted-adapter-definitions.js";
import { executeTrustedAdapterIsolated } from "./trusted-adapter-isolation.js";

const ID_PATTERN = /^[a-z][a-z0-9_.:-]{1,119}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

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

function validateAllowedKeys(source, allowed, path, errors) {
  if (!isPlainObject(source)) return;
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) {
      errors.push({
        field: `${path}.${key}`,
        code: "unknown_field",
        message: "is not accepted by this trusted adapter contract",
      });
    }
  }
}

function materializedManifest(entry) {
  if (!entry) return null;
  return {
    ...entry.manifest,
    implementation_hash: sha256(String(entry.execute)),
  };
}

function publicManifest(entry) {
  const manifest = materializedManifest(entry);
  if (!manifest) return null;
  return {
    ...manifest,
    manifest_hash: sha256(canonicalJson(manifest)),
  };
}

function validateAdapterInput(manifest, input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return [{ field: "adapter.input", code: "invalid_type", message: "must be an object" }];
  }
  const properties = manifest.input_schema.properties;
  validateAllowedKeys(input, Object.keys(properties), "adapter.input", errors);
  for (const field of manifest.input_schema.required) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      errors.push({ field: `adapter.input.${field}`, code: "required", message: "is required" });
    }
  }
  for (const [field, definition] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const value = input[field];
    if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      errors.push({ field: `adapter.input.${field}`, code: "invalid_type", message: "must be a finite number" });
      continue;
    }
    if (definition.type === "boolean" && typeof value !== "boolean") {
      errors.push({ field: `adapter.input.${field}`, code: "invalid_type", message: "must be a boolean" });
      continue;
    }
    if (definition.type === "string" && typeof value !== "string") {
      errors.push({ field: `adapter.input.${field}`, code: "invalid_type", message: "must be a string" });
      continue;
    }
    if (definition.enum && !definition.enum.includes(value)) {
      errors.push({
        field: `adapter.input.${field}`,
        code: "invalid_value",
        message: `must be one of ${definition.enum.join(", ")}`,
      });
    }
    if (typeof value === "number" && definition.exclusive_minimum !== undefined && value <= definition.exclusive_minimum) {
      errors.push({
        field: `adapter.input.${field}`,
        code: "out_of_range",
        message: `must be greater than ${definition.exclusive_minimum}`,
      });
    }
    if (typeof value === "number" && definition.maximum !== undefined && value > definition.maximum) {
      errors.push({
        field: `adapter.input.${field}`,
        code: "out_of_range",
        message: `must be at most ${definition.maximum}`,
      });
    }
  }
  return errors;
}

function validateAdapterOutput(manifest, output) {
  const errors = [];
  if (!isPlainObject(output)) {
    return [{ field: "adapter.output", code: "invalid_type", message: "must be an object" }];
  }
  const properties = manifest.output_schema.properties;
  validateAllowedKeys(output, Object.keys(properties), "adapter.output", errors);
  for (const [field, definition] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(output, field)) {
      errors.push({ field: `adapter.output.${field}`, code: "required", message: "is required" });
      continue;
    }
    const value = output[field];
    if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      errors.push({ field: `adapter.output.${field}`, code: "invalid_type", message: "must be a finite number" });
      continue;
    }
    if (definition.type === "integer" && !Number.isInteger(value)) {
      errors.push({ field: `adapter.output.${field}`, code: "invalid_type", message: "must be an integer" });
      continue;
    }
    if (definition.type === "boolean" && typeof value !== "boolean") {
      errors.push({ field: `adapter.output.${field}`, code: "invalid_type", message: "must be a boolean" });
      continue;
    }
    if (definition.type === "string" && typeof value !== "string") {
      errors.push({ field: `adapter.output.${field}`, code: "invalid_type", message: "must be a string" });
      continue;
    }
    if (definition.enum && !definition.enum.includes(value)) {
      errors.push({
        field: `adapter.output.${field}`,
        code: "invalid_value",
        message: `must be one of ${definition.enum.join(", ")}`,
      });
    }
    if (typeof value === "number" && definition.minimum !== undefined && value < definition.minimum) {
      errors.push({
        field: `adapter.output.${field}`,
        code: "out_of_range",
        message: `must be at least ${definition.minimum}`,
      });
    }
    if (typeof value === "number" && definition.maximum !== undefined && value > definition.maximum) {
      errors.push({
        field: `adapter.output.${field}`,
        code: "out_of_range",
        message: `must be at most ${definition.maximum}`,
      });
    }
  }
  return errors;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}

export function getTrustedAdapterManifest(adapterId, version) {
  return publicManifest(getRegisteredTrustedAdapter(adapterId, version));
}

export async function executeTrustedAdapter(invocation) {
  const errors = [];
  if (!isPlainObject(invocation)) {
    return {
      ok: false,
      statusCode: 422,
      error: "TRUSTED_ADAPTER_INVALID",
      message: "Trusted adapter invocation must be an object.",
      errors: [{ field: "adapter", code: "invalid_type", message: "must be an object" }],
    };
  }
  validateAllowedKeys(invocation, ["adapter_id", "version", "manifest_hash", "input"], "adapter", errors);
  const adapterId = String(invocation.adapter_id || "").trim();
  const version = String(invocation.version || "").trim();
  const expectedManifestHash = String(invocation.manifest_hash || "").trim().toLowerCase();
  if (!ID_PATTERN.test(adapterId)) {
    errors.push({ field: "adapter.adapter_id", code: "invalid_value", message: "must be a stable lowercase identifier" });
  }
  if (!VERSION_PATTERN.test(version)) {
    errors.push({ field: "adapter.version", code: "invalid_value", message: "must be a semantic version" });
  }
  if (!HASH_PATTERN.test(expectedManifestHash)) {
    errors.push({ field: "adapter.manifest_hash", code: "invalid_value", message: "must be a 64-character sha256 hash" });
  }
  if (errors.length) {
    return {
      ok: false,
      statusCode: 422,
      error: "TRUSTED_ADAPTER_INVALID",
      message: "Trusted adapter invocation validation failed.",
      errors,
    };
  }

  const entry = getRegisteredTrustedAdapter(adapterId, version);
  if (!entry) {
    return {
      ok: false,
      statusCode: 422,
      error: "TRUSTED_ADAPTER_NOT_REGISTERED",
      message: "The requested adapter id and version are not registered.",
    };
  }
  const manifest = publicManifest(entry);
  if (expectedManifestHash !== manifest.manifest_hash) {
    return {
      ok: false,
      statusCode: 422,
      error: "TRUSTED_ADAPTER_MANIFEST_MISMATCH",
      message: "The requested adapter manifest hash does not match the registered implementation contract.",
      expected_manifest_hash: expectedManifestHash,
      registered_manifest_hash: manifest.manifest_hash,
    };
  }

  const inputErrors = validateAdapterInput(entry.manifest, invocation.input);
  if (inputErrors.length) {
    return {
      ok: false,
      statusCode: 422,
      error: "TRUSTED_ADAPTER_INPUT_INVALID",
      message: "Trusted adapter input validation failed.",
      errors: inputErrors,
    };
  }

  const canonicalInput = deepFreeze(JSON.parse(canonicalJson(invocation.input)));
  const capabilityAudit = auditTrustedAdapterImplementation(entry.execute);
  if (!capabilityAudit.ok) {
    return {
      ok: false,
      statusCode: 500,
      error: "TRUSTED_ADAPTER_CAPABILITY_AUDIT_FAILED",
      message: "Trusted adapter implementation uses denied ambient capabilities.",
      denied_capabilities: capabilityAudit.denied_capabilities,
    };
  }
  const execution = await executeTrustedAdapterIsolated({
    adapterId,
    version,
    input: canonicalInput,
    timeoutMs: TRUSTED_ADAPTER_TIMEOUT_MS,
  });
  if (!execution.ok) {
    return {
      ok: false,
      statusCode: execution.error === "TRUSTED_ADAPTER_EXECUTION_TIMEOUT" ? 504 : 500,
      error: execution.error,
      message: execution.message,
    };
  }
  const facts = execution.facts;
  const outputErrors = validateAdapterOutput(entry.manifest, facts);
  if (outputErrors.length) {
    return {
      ok: false,
      statusCode: 500,
      error: "TRUSTED_ADAPTER_OUTPUT_INVALID",
      message: "Trusted adapter output did not match its registered schema.",
      errors: outputErrors,
    };
  }
  return {
    ok: true,
    facts,
    attestation: {
      manifest_version: TRUSTED_ADAPTER_MANIFEST_VERSION,
      adapter_id: manifest.adapter_id,
      version: manifest.version,
      implementation_revision: manifest.implementation_revision,
      implementation_hash: manifest.implementation_hash,
      manifest_hash: manifest.manifest_hash,
      input_hash: sha256(canonicalJson(canonicalInput)),
      output_hash: sha256(canonicalJson(facts)),
      execution_isolation: TRUSTED_ADAPTER_EXECUTION_ISOLATION,
      capability_enforcement: TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
      execution_timeout_ms: TRUSTED_ADAPTER_TIMEOUT_MS,
    },
  };
}

export {
  auditTrustedAdapterImplementation,
  TRUSTED_ADAPTER_MANIFEST_VERSION,
};
