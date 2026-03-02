import { createHash } from "node:crypto";

const DEFAULT_MAX_ENTRIES = 120;
const DEFAULT_LOW_SIGNAL_THRESHOLD = 1;
const DEFAULT_LOW_SIGNAL_LOOKBACK = 6;

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeByPolicy(byPolicyValue) {
  const source = byPolicyValue && typeof byPolicyValue === "object" ? byPolicyValue : {};
  const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
  const normalized = {};
  for (const key of keys) {
    normalized[key] = toNonNegativeInt(source[key], 0);
  }
  return normalized;
}

function buildByPolicySignature(byPolicy) {
  return Object.entries(byPolicy)
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

export function normalizeAlertEntry(entry) {
  const normalized = entry && typeof entry === "object" ? { ...entry } : {};
  const byPolicy = normalizeByPolicy(normalized.by_policy);
  const changedSample = Array.isArray(normalized.changed_sample)
    ? normalized.changed_sample.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
    : [];

  const result = {
    ...normalized,
    date_utc: String(normalized.date_utc || "").trim(),
    generated_at_utc: String(normalized.generated_at_utc || "").trim(),
    changed_count: toNonNegativeInt(normalized.changed_count, 0),
    by_policy: byPolicy,
    changed_sample: changedSample,
    pending_count: toNonNegativeInt(normalized.pending_count, 0),
    pending_by_policy: normalizeByPolicy(normalized.pending_by_policy),
    stale_pending_count: toNonNegativeInt(normalized.stale_pending_count, 0),
    volatile_pending_count: toNonNegativeInt(normalized.volatile_pending_count, 0),
    escalation_count: toNonNegativeInt(normalized.escalation_count, 0),
    coverage_gap_count: toNonNegativeInt(normalized.coverage_gap_count, 0),
    source: String(normalized.source || "check-policies.js").trim() || "check-policies.js",
  };

  result.by_policy_signature = buildByPolicySignature(result.by_policy);
  return result;
}

export function buildAlertSignature(entry) {
  const normalized = normalizeAlertEntry(entry);
  const canonicalPayload = {
    changed_count: normalized.changed_count,
    by_policy_signature: normalized.by_policy_signature,
    changed_sample: normalized.changed_sample,
    pending_count: normalized.pending_count,
    pending_by_policy: normalized.pending_by_policy,
    stale_pending_count: normalized.stale_pending_count,
    volatile_pending_count: normalized.volatile_pending_count,
    escalation_count: normalized.escalation_count,
    coverage_gap_count: normalized.coverage_gap_count,
    source: normalized.source,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalPayload))
    .digest("hex")
    .slice(0, 16);
}

export function isLowSignalAlert(entry, { lowSignalThreshold = DEFAULT_LOW_SIGNAL_THRESHOLD } = {}) {
  const normalized = normalizeAlertEntry(entry);
  return (
    normalized.changed_count <= Math.max(0, lowSignalThreshold) &&
    normalized.pending_count === 0 &&
    normalized.escalation_count === 0 &&
    normalized.coverage_gap_count === 0
  );
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  const deduped = [];
  for (const item of alerts) {
    const normalized = normalizeAlertEntry(item);
    const signature = String(item?.alert_signature || buildAlertSignature(normalized));
    const key = `${normalized.date_utc}|${signature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...normalized, alert_signature: signature });
  }
  return deduped;
}

export function mergePolicyAlertFeed({
  existingAlerts = [],
  entry,
  maxEntries = DEFAULT_MAX_ENTRIES,
  lowSignalThreshold = DEFAULT_LOW_SIGNAL_THRESHOLD,
  lowSignalLookback = DEFAULT_LOW_SIGNAL_LOOKBACK,
} = {}) {
  const normalizedExisting = dedupeAlerts(existingAlerts);
  const normalizedEntry = normalizeAlertEntry(entry);
  const nextSignature = buildAlertSignature(normalizedEntry);
  const nextAlert = { ...normalizedEntry, alert_signature: nextSignature };
  const duplicateIndex = normalizedExisting.findIndex((item) => item.alert_signature === nextSignature);

  if (duplicateIndex === 0) {
    return {
      alerts: normalizedExisting.slice(0, Math.max(1, maxEntries)),
      published: false,
      reason: "duplicate_latest",
      signature: nextSignature,
    };
  }

  if (isLowSignalAlert(nextAlert, { lowSignalThreshold })) {
    const lookback = normalizedExisting.slice(0, Math.max(1, lowSignalLookback));
    const repeatedLowSignal = lookback.some((item) => {
      if (!isLowSignalAlert(item, { lowSignalThreshold })) return false;
      return item.by_policy_signature === nextAlert.by_policy_signature;
    });
    if (repeatedLowSignal) {
      return {
        alerts: normalizedExisting.slice(0, Math.max(1, maxEntries)),
        published: false,
        reason: "low_signal_repeat",
        signature: nextSignature,
      };
    }
  }

  const merged = [nextAlert, ...normalizedExisting.filter((item) => item.alert_signature !== nextSignature)];
  return {
    alerts: merged.slice(0, Math.max(1, maxEntries)),
    published: true,
    reason: "",
    signature: nextSignature,
  };
}
