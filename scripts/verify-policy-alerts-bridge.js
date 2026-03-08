#!/usr/bin/env node

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFlag(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestUrl(baseUrl, state, limit) {
  const url = new URL(baseUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("limit", String(limit));
  return url;
}

function isLegacyPayload(payload) {
  const source = payload?.source;
  return Boolean(source && typeof source === "object" && ("owner" in source || "feed_endpoint" in source));
}

function extractRunId(runUrl = "") {
  const match = String(runUrl).match(/\/actions\/runs\/(\d+)/i);
  return match ? match[1] : "";
}

function validatePayload(payload, options) {
  const errors = [];
  const {
    state,
    limit,
    expectedSchemaVersion,
    requireSupabase,
    allowFileFallback,
    minAlerts,
    expectedRunUrl,
    requireLiveRun,
    expectedDate,
  } = options;

  if (!payload || typeof payload !== "object") {
    errors.push("response is not a JSON object");
    return errors;
  }
  if (payload.ok !== true) errors.push("ok must be true");
  if (isLegacyPayload(payload)) errors.push("legacy source object detected (old endpoint deployment)");
  if (typeof payload.source !== "string") errors.push("source must be a string");
  if (payload.state !== state) errors.push(`state mismatch: expected ${state}, got ${String(payload.state)}`);
  if (payload.limit !== limit) errors.push(`limit mismatch: expected ${limit}, got ${String(payload.limit)}`);
  if (payload.schema_version !== expectedSchemaVersion) {
    errors.push(
      `schema_version mismatch: expected ${expectedSchemaVersion}, got ${String(payload.schema_version || "<missing>")}`
    );
  }
  if (!Array.isArray(payload.alerts)) errors.push("alerts must be an array");
  if (Array.isArray(payload.alerts) && payload.alerts.length < minAlerts) {
    errors.push(`alerts length ${payload.alerts.length} below minimum ${minAlerts}`);
  }
  if (requireSupabase && payload.source !== "supabase") {
    errors.push(`source mismatch: expected supabase, got ${String(payload.source || "<missing>")}`);
  }
  if (!allowFileFallback && payload.source === "file_fallback") {
    errors.push("unexpected file_fallback source");
  }

  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  if (alerts.length > 0) {
    const first = alerts[0];
    if (!first || typeof first !== "object") {
      errors.push("first alert is not an object");
    } else {
      if (typeof first.changed_count !== "number") errors.push("first alert changed_count must be numeric");
      if (typeof first.pending_count !== "number") errors.push("first alert pending_count must be numeric");
      if (typeof first.state !== "string" || !first.state) errors.push("first alert state must be non-empty string");
      if (typeof first.status !== "string" || !first.status) errors.push("first alert status must be non-empty string");
      if (typeof first.run_url !== "string") errors.push("first alert run_url must be string");
    }
  }

  if (expectedDate) {
    const hasExpectedDate = alerts.some((alert) => {
      const rawDate = String(alert?.date_utc || alert?.changed_date || "").trim();
      if (!rawDate) return false;
      if (rawDate === expectedDate) return true;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed.toISOString().slice(0, 10) === expectedDate;
    });
    if (!hasExpectedDate) {
      errors.push(`no alert found for expected date ${expectedDate}`);
    }
  }

  if (requireLiveRun && expectedRunUrl) {
    const expectedRunId = extractRunId(expectedRunUrl);
    const hasExpectedRun = alerts.some((alert) => {
      const runUrl = String(alert?.run_url || "");
      if (!runUrl) return false;
      if (runUrl === expectedRunUrl) return true;
      if (!expectedRunId) return false;
      return extractRunId(runUrl) === expectedRunId;
    });
    if (!hasExpectedRun) {
      errors.push(`expected current run URL not present in alerts: ${expectedRunUrl}`);
    }
  }

  return errors;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    text,
    payload,
  };
}

async function main() {
  const baseUrl = String(process.env.POLICY_ALERTS_BRIDGE_URL || "https://www.decide.fyi/api/policy-alerts").trim();
  const state = String(process.env.POLICY_ALERTS_BRIDGE_STATE || "all").trim() || "all";
  const limit = Math.max(1, Math.min(100, toInt(process.env.POLICY_ALERTS_BRIDGE_LIMIT, 5)));
  const retries = Math.max(1, toInt(process.env.POLICY_ALERTS_BRIDGE_RETRIES, 12));
  const delayMs = Math.max(1000, toInt(process.env.POLICY_ALERTS_BRIDGE_DELAY_MS, 20000));
  const expectedSchemaVersion = String(
    process.env.POLICY_ALERTS_BRIDGE_EXPECT_SCHEMA_VERSION || "policy_alerts_v2"
  ).trim();
  const expectedRunUrl = String(process.env.POLICY_ALERTS_BRIDGE_EXPECT_RUN_URL || "").trim();
  const expectedDate = String(process.env.POLICY_ALERTS_BRIDGE_EXPECT_DATE || "").trim();
  const requireLiveRun = toFlag(process.env.POLICY_ALERTS_BRIDGE_REQUIRE_LIVE_RUN, Boolean(expectedRunUrl));
  const requireSupabase = toFlag(process.env.POLICY_ALERTS_BRIDGE_REQUIRE_SUPABASE, true);
  const allowFileFallback = toFlag(process.env.POLICY_ALERTS_BRIDGE_ALLOW_FILE_FALLBACK, false);
  const minAlerts = Math.max(0, toInt(process.env.POLICY_ALERTS_BRIDGE_MIN_ALERTS, 1));
  const requestUrl = buildRequestUrl(baseUrl, state, limit).toString();

  let lastError = "unknown_error";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchJson(requestUrl);
      if (!result.ok) {
        lastError = `http_${result.status}`;
      } else {
        const errors = validatePayload(result.payload, {
          state,
          limit,
          expectedSchemaVersion,
          requireSupabase,
          allowFileFallback,
          minAlerts,
          expectedRunUrl,
          requireLiveRun,
          expectedDate,
        });
        if (errors.length === 0) {
          console.log(`PASS bridge verification (${requestUrl})`);
          console.log(`source=${result.payload.source} alerts=${result.payload.alerts.length} schema=${result.payload.schema_version}`);
          return;
        }
        lastError = errors.join("; ");
      }
    } catch (error) {
      lastError = String(error?.message || error);
    }

    if (attempt < retries) {
      console.log(`Bridge verify attempt ${attempt}/${retries} failed: ${lastError}. Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  console.error(`Bridge verification failed after ${retries} attempts: ${lastError}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
