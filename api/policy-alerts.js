import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const STRICT_FEED_PATH = join(ROOT_DIR, "rules", "policy-alert-feed.json");
const REVIEW_FEED_PATH = join(ROOT_DIR, "rules", "policy-alert-review-feed.json");

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
  return {
    ...raw,
    date_utc: String(row?.date_utc || raw?.date_utc || "").trim(),
    generated_at_utc: String(row?.generated_at_utc || raw?.generated_at_utc || "").trim(),
    changed_count: Number(row?.changed_count ?? raw?.changed_count ?? 0),
    dedupe_changed_count: Number(row?.dedupe_changed_count ?? raw?.dedupe_changed_count ?? 0),
    reported_changed_count: Number(row?.reported_changed_count ?? raw?.reported_changed_count ?? 0),
    repeated_count: Number(row?.repeated_count ?? raw?.repeated_count ?? 0),
    by_policy: row?.by_policy && typeof row.by_policy === "object" ? row.by_policy : raw?.by_policy || {},
    changed_sample: Array.isArray(row?.changed_sample) ? row.changed_sample : Array.isArray(raw?.changed_sample) ? raw.changed_sample : [],
    pending_count: Number(row?.pending_count ?? raw?.pending_count ?? 0),
    volatile_pending_count: Number(row?.volatile_pending_count ?? raw?.volatile_pending_count ?? 0),
    escalation_count: Number(row?.escalation_count ?? raw?.escalation_count ?? 0),
    coverage_gap_count: Number(row?.coverage_gap_count ?? raw?.coverage_gap_count ?? 0),
    fetch_failure_count: Number(row?.fetch_failure_count ?? raw?.fetch_failure_count ?? 0),
    fetch_health_status: String(row?.fetch_health_status || raw?.fetch_health_status || "unknown"),
    fetch_blocked_pending_count: Number(row?.fetch_blocked_pending_count ?? raw?.fetch_blocked_pending_count ?? 0),
    quality_gate_held_count: Number(row?.quality_gate_held_count ?? raw?.quality_gate_held_count ?? 0),
    metadata_stability_held_count: Number(row?.metadata_stability_held_count ?? raw?.metadata_stability_held_count ?? 0),
    material_oscillation_suppressed_count: Number(
      row?.material_oscillation_suppressed_count ?? raw?.material_oscillation_suppressed_count ?? 0
    ),
    source_migration_reset_count: Number(row?.source_migration_reset_count ?? raw?.source_migration_reset_count ?? 0),
    strict_eligible: Boolean(row?.strict_eligible),
    signal_confidence: String(row?.signal_confidence || raw?.signal_confidence || "manual-review"),
    signal_confidence_reason: String(row?.signal_confidence_reason || raw?.signal_confidence_reason || ""),
    status: String(row?.status || raw?.status || (row?.strict_eligible ? "confirmed" : "review")),
    state: String(row?.state || raw?.state || (row?.strict_eligible ? "verified" : "needs_review")),
    run_id: String(row?.run_id || raw?.run_id || "").trim(),
    run_attempt: String(row?.run_attempt || raw?.run_attempt || "").trim(),
    commit_sha: String(row?.commit_sha || raw?.commit_sha || "").trim(),
    run_url: String(row?.run_url || raw?.run_url || "").trim(),
    source: String(row?.source || raw?.source || "policy-alerts-api").trim() || "policy-alerts-api",
  };
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

function loadAlertsFromFiles({ state = "confirmed", dateFrom = "", dateTo = "", limit = 20 } = {}) {
  const strictFeed = readJson(STRICT_FEED_PATH, { alerts: [] });
  const reviewFeed = readJson(REVIEW_FEED_PATH, { alerts: [] });
  const strictAlerts = Array.isArray(strictFeed?.alerts) ? strictFeed.alerts : [];
  const reviewAlerts = Array.isArray(reviewFeed?.alerts) ? reviewFeed.alerts : [];

  let alerts = [];
  if (state === "review") {
    alerts = reviewAlerts.filter((entry) => String(entry?.status || "").toLowerCase() === "review");
  } else if (state === "all") {
    alerts = reviewAlerts.length > 0 ? reviewAlerts : strictAlerts;
  } else {
    alerts = strictAlerts;
  }

  const filtered = filterByDateRange(alerts, dateFrom, dateTo);
  return sortAlertsNewest(filtered).slice(0, limit);
}

async function loadAlertsFromSupabase({
  state = "confirmed",
  dateFrom = "",
  dateTo = "",
  limit = 20,
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
    params.changed_count = "gt.0";
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
  return {
    ok: true,
    alerts: rows.map((row) => toAlertObjectFromDailyRow(row)),
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
  const dateFrom = normalizeDateOnly(readQueryValue(req, "date_from", ""));
  const dateTo = normalizeDateOnly(readQueryValue(req, "date_to", ""));
  const supabaseConfig = getPolicySupabaseConfig();

  if (supabaseConfig.syncEnabled) {
    const supabaseResult = await loadAlertsFromSupabase({
      state,
      dateFrom,
      dateTo,
      limit,
      supabaseConfig,
    });
    if (supabaseResult.ok) {
      return send(res, 200, {
        ok: true,
        source: "supabase",
        state,
        limit,
        date_from: dateFrom,
        date_to: dateTo,
        alerts: supabaseResult.alerts,
      });
    }
  }

  const fileAlerts = loadAlertsFromFiles({ state, dateFrom, dateTo, limit });
  return send(res, 200, {
    ok: true,
    source: "file_fallback",
    state,
    limit,
    date_from: dateFrom,
    date_to: dateTo,
    alerts: fileAlerts,
  });
}
