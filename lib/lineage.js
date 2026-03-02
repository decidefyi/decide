import { createHash } from "node:crypto";

function toIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function buildSourceHash(payload) {
  const input = stableStringify(payload);
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function withLineage(payload, { policyVersion = "unknown", sourceHash = "unknown", evaluatedAt } = {}) {
  const base = payload && typeof payload === "object" ? payload : {};
  return {
    ...base,
    policy_version: String(policyVersion || "unknown"),
    source_hash: String(sourceHash || "unknown"),
    evaluated_at: toIso(evaluatedAt),
  };
}
