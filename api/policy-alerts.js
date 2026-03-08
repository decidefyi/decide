import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const STRICT_FEED_PATH = join(ROOT_DIR, "rules", "policy-alert-feed.json");
const REVIEW_FEED_PATH = join(ROOT_DIR, "rules", "policy-alert-review-feed.json");
const POLICY_ALERTS_API_SCHEMA_VERSION = "policy_alerts_v2";
const POLICY_ALERTS_API_SCHEMA_PUBLISHED_UTC = "2026-03-08";

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readQueryValue(req, key, fallback = "") {
  const value = req?.query?.[key];
  if (Array.isArray(value)) return String(value[0] || "").trim() || fallback;
  return String(value || "").trim() || fallback;
}

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseLimit(rawValue, fallback = 20) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(100, parsed);
}

function parseIncludeZero(rawValue, fallback = true) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveStatusAndState({ status = "", state = "", strictEligible = true } = {}) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedState = String(state || "").trim().toLowerCase();
  const resolvedStatus = normalizedStatus || (strictEligible ? "confirmed" : "review");
  const resolvedState = normalizedState || (resolvedStatus === "review" ? "needs_review" : "verified");
  return { status: resolvedStatus, state: resolvedState };
}

function resolveStrictEligible(value, status = "", state = "") {
  if (typeof value === "boolean") return value;
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedState = String(state || "").trim().toLowerCase();
  return normalizedStatus !== "review" && normalizedState !== "needs_review";
}

function normalizeState(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "review" || normalized === "needs_review") return "review";
  return "confirmed";
}

function normalizeDateOnly(value = "") {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function toAlertObjectFromDailyRow(row = {}) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
  const strictEligible = resolveStrictEligible(
    typeof row?.strict_eligible === "boolean" ? row.strict_eligible : raw?.strict_eligible,
    row?.status || raw?.status || "",
    row?.state || raw?.state || ""
  );
  const statusAndState = resolveStatusAndState({
    status: row?.status || raw?.status || "",
    state: row?.state || raw?.state || "",
    strictEligible,
  });

  return {
    ...raw,
    date_utc: String(row?.date_utc || raw?.date_utc || "").trim(),
    generated_at_utc: String(row?.generated_at_utc || raw?.generated_at_utc || "").trim(),
    changed_count: toNumber(row?.changed_count ?? raw?.changed_count, 0),
    dedupe_changed_count: toNumber(row?.dedupe_changed_count ?? raw?.dedupe_changed_count, 0),
    reported_changed_count: toNumber(row?.reported_changed_count ?? raw?.reported_changed_count, 0),
    repeated_count: toNumber(row?.repeated_count ?? raw?.repeated_count, 0),
    by_policy: row?.by_policy && typeof row.by_policy === "object" ? row.by_policy : raw?.by_policy || {},
    changed_sample: Array.isArray(row?.changed_sample) ? row.changed_sample : Array.isArray(raw?.changed_sample) ? raw.changed_sample : [],
    pending_count: toNumber(row?.pending_count ?? raw?.pending_count, 0),
    volatile_pending_count: toNumber(row?.volatile_pending_count ?? raw?.volatile_pending_count, 0),
    escalation_count: toNumber(row?.escalation_count ?? raw?.escalation_count, 0),
    coverage_gap_count: toNumber(row?.coverage_gap_count ?? raw?.coverage_gap_count, 0),
    fetch_failure_count: toNumber(row?.fetch_failure_count ?? raw?.fetch_failure_count, 0),
    fetch_health_status: String(row?.fetch_health_status || raw?.fetch_health_status || "unknown"),
    fetch_blocked_pending_count: toNumber(row?.fetch_blocked_pending_count ?? raw?.fetch_blocked_pending_count, 0),
    quality_gate_held_count: toNumber(row?.quality_gate_held_count ?? raw?.quality_gate_held_count, 0),
    metadata_stability_held_count: toNumber(row?.metadata_stability_held_count ?? raw?.metadata_stability_held_count, 0),
    material_oscillation_suppressed_count: toNumber(
      row?.material_oscillation_suppressed_count ?? raw?.material_oscillation_suppressed_count,
      0
    ),
    source_migration_reset_count: toNumber(row?.source_migration_reset_count ?? raw?.source_migration_reset_count, 0),
    strict_eligible: strictEligible,
    signal_confidence: String(row?.signal_confidence || raw?.signal_confidence || "manual-review"),
    signal_confidence_reason: String(row?.signal_confidence_reason || raw?.signal_confidence_reason || ""),
    status: statusAndState.status,
    state: statusAndState.state,
    run_id: String(row?.run_id || raw?.run_id || "").trim(),
    run_attempt: String(row?.run_attempt || raw?.run_attempt || "").trim(),
    commit_sha: String(row?.commit_sha || raw?.commit_sha || "").trim(),
    run_url: String(row?.run_url || raw?.run_url || "").trim(),
    source: String(row?.source || raw?.source || "policy-alerts-api").trim() || "policy-alerts-api",
  };
}

function toAlertObjectFromFeedEntry(entry = {}, fallbackStatus = "confirmed") {
  const strictEligible = resolveStrictEligible(
    typeof entry?.strict_eligible === "boolean" ? entry.strict_eligible : undefined,
    entry?.status || "",
    entry?.state || ""
  );
  const statusAndState = resolveStatusAndState({
    status: entry?.status || "",
    state: entry?.state || "",
    strictEligible: fallbackStatus === "review" ? false : strictEligible,
  });

  return {
    ...entry,
    date_utc: String(entry?.date_utc || "").trim(),
    generated_at_utc: String(entry?.generated_at_utc || "").trim(),
    changed_count: toNumber(entry?.changed_count, 0),
    dedupe_changed_count: toNumber(entry?.dedupe_changed_count, toNumber(entry?.changed_count, 0)),
    reported_changed_count: toNumber(entry?.reported_changed_count, toNumber(entry?.changed_count, 0)),
    repeated_count: toNumber(entry?.repeated_count, 0),
    pending_count: toNumber(entry?.pending_count, 0),
    volatile_pending_count: toNumber(entry?.volatile_pending_count, 0),
    escalation_count: toNumber(entry?.escalation_count, 0),
    coverage_gap_count: toNumber(entry?.coverage_gap_count, 0),
    fetch_failure_count: toNumber(entry?.fetch_failure_count, 0),
    fetch_blocked_pending_count: toNumber(entry?.fetch_blocked_pending_count, 0),
    quality_gate_held_count: toNumber(entry?.quality_gate_held_count, 0),
    metadata_stability_held_count: toNumber(entry?.metadata_stability_held_count, 0),
    material_oscillation_suppressed_count: toNumber(entry?.material_oscillation_suppressed_count, 0),
    source_migration_reset_count: toNumber(entry?.source_migration_reset_count, 0),
    by_policy: entry?.by_policy && typeof entry.by_policy === "object" ? entry.by_policy : {},
    changed_sample: Array.isArray(entry?.changed_sample) ? entry.changed_sample : [],
    strict_eligible: fallbackStatus === "review" ? false : strictEligible,
    signal_confidence: String(entry?.signal_confidence || "manual-review"),
    signal_confidence_reason: String(entry?.signal_confidence_reason || ""),
    status: statusAndState.status,
    state: statusAndState.state,
    run_id: String(entry?.run_id || "").trim(),
    run_attempt: String(entry?.run_attempt || "").trim(),
    commit_sha: String(entry?.commit_sha || "").trim(),
    run_url: String(entry?.run_url || "").trim(),
    source: String(entry?.source || "policy-alerts-api").trim() || "policy-alerts-api",
  };
}

function buildSuccessPayload({
  source = "unknown",
  state = "confirmed",
  limit = 20,
  includeZero = true,
  dateFrom = "",
  dateTo = "",
  alerts = [],
  fallbackReason = "",
} = {}) {
  const payload = {
    ok: true,
    schema_version: POLICY_ALERTS_API_SCHEMA_VERSION,
    schema_published_on_utc: POLICY_ALERTS_API_SCHEMA_PUBLISHED_UTC,
    source,
    state,
    limit,
    include_zero: includeZero,
    date_from: dateFrom,
    date_to: dateTo,
    alerts,
  };
  if (fallbackReason) payload.fallback_reason = String(fallbackReason);
  return payload;
}

function filterByDateRange(alerts = [], dateFrom = "", dateTo = "") {
  return alerts.filter((alert) => {
    const dateUtc = String(alert?.date_utc || "").trim();
    if (!dateUtc) return false;
    if (dateFrom && dateUtc < dateFrom) return false;
    if (dateTo && dateUtc > dateTo) return false;
    return true;
  });
}

function sortAlertsNewest(alerts = []) {
  return [...alerts].sort((left, right) => {
    const leftValue = String(left?.generated_at_utc || left?.date_utc || "");
    const rightValue = String(right?.generated_at_utc || right?.date_utc || "");
    return rightValue.localeCompare(leftValue);
  });
}

function filterByIncludeZero(alerts = [], includeZero = true) {
  if (includeZero) return [...alerts];
  return alerts.filter((entry) => toNumber(entry?.changed_count, 0) > 0);
}

function loadAlertsFromFiles({ state = "confirmed", dateFrom = "", dateTo = "", limit = 20, includeZero = true } = {}) {
  const strictFeed = readJson(STRICT_FEED_PATH, { alerts: [] });
  const reviewFeed = readJson(REVIEW_FEED_PATH, { alerts: [] });
  const strictAlerts = Array.isArray(strictFeed?.alerts)
    ? strictFeed.alerts.map((entry) => toAlertObjectFromFeedEntry(entry, "confirmed"))
    : [];
  const reviewAlerts = Array.isArray(reviewFeed?.alerts)
    ? reviewFeed.alerts.map((entry) => toAlertObjectFromFeedEntry(entry, "review"))
    : [];

  let alerts = [];
  if (state === "review") {
    alerts = reviewAlerts.filter(
      (entry) =>
        String(entry?.status || "").toLowerCase() === "review" || String(entry?.state || "").toLowerCase() === "needs_review"
    );
  } else if (state === "all") {
    alerts = reviewAlerts.length > 0 ? reviewAlerts : strictAlerts;
  } else {
    alerts = strictAlerts;
  }

  const dateFiltered = filterByDateRange(alerts, dateFrom, dateTo);
  const includeZeroFiltered = filterByIncludeZero(dateFiltered, includeZero);
  return sortAlertsNewest(includeZeroFiltered).slice(0, limit);
}

async function loadAlertsFromSupabase({
  state = "confirmed",
  dateFrom = "",
  dateTo = "",
  limit = 20,
  includeZero = true,
  supabaseConfig,
}) {
  const params = {
    select: "*",
    order: "date_utc.desc",
    limit,
  };

  if (state === "review") {
    params.strict_eligible = "eq.false";
  } else if (state === "confirmed") {
    params.strict_eligible = "eq.true";
    if (!includeZero) {
      params.changed_count = "gt.0";
    }
  }

  if (dateFrom && dateTo) {
    params.and = `(date_utc.gte.${dateFrom},date_utc.lte.${dateTo})`;
  } else if (dateFrom) {
    params.date_utc = `gte.${dateFrom}`;
  } else if (dateTo) {
    params.date_utc = `lte.${dateTo}`;
  }

  const result = await supabaseRestRequest(supabaseConfig, {
    method: "GET",
    path: "/rest/v1/policy_daily_alerts",
    params,
  });
  if (!result.ok) {
    return {
      ok: false,
      alerts: [],
      error: String(result.error || "supabase_alerts_fetch_failed"),
    };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const alerts = rows.map((row) => toAlertObjectFromDailyRow(row));
  return {
    ok: true,
    alerts: filterByIncludeZero(alerts, includeZero),
    error: "",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const state = normalizeState(readQueryValue(req, "state", "confirmed"));
  const limit = parseLimit(readQueryValue(req, "limit", "20"), 20);
  const includeZero = parseIncludeZero(readQueryValue(req, "include_zero", "1"), true);
  const dateFrom = normalizeDateOnly(readQueryValue(req, "date_from", ""));
  const dateTo = normalizeDateOnly(readQueryValue(req, "date_to", ""));
  const supabaseConfig = getPolicySupabaseConfig();
  let supabaseError = "";

  if (supabaseConfig.syncEnabled) {
    const supabaseResult = await loadAlertsFromSupabase({
      state,
      dateFrom,
      dateTo,
      limit,
      includeZero,
      supabaseConfig,
    });
    if (supabaseResult.ok) {
      return send(
        res,
        200,
        buildSuccessPayload({
          source: "supabase",
          state,
          limit,
          includeZero,
          dateFrom,
          dateTo,
          alerts: supabaseResult.alerts,
        })
      );
    }
    supabaseError = supabaseResult.error;
  }

  const fileAlerts = loadAlertsFromFiles({ state, dateFrom, dateTo, limit, includeZero });
  return send(
    res,
    200,
    buildSuccessPayload({
      source: "file_fallback",
      state,
      limit,
      includeZero,
      dateFrom,
      dateTo,
      alerts: fileAlerts,
      fallbackReason: supabaseError,
    })
  );
}
