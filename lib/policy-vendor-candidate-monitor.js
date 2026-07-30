import { createHash } from "node:crypto";

const CHALLENGE_DOCUMENT_MARKERS = [
  "verify you are human",
  "checking your browser",
  "attention required! | cloudflare",
  "cf-chl-",
  "captcha",
  "access denied",
];

const SUPPORTED_DOCUMENT_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/xhtml+xml",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, " ")
    .trim();
}

function contentHash(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function toObservationSlot(now = new Date(), intervalHours = 6) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_observation_time");
  const interval = Math.max(1, Number(intervalHours || 6));
  const hour = Math.floor(date.getUTCHours() / interval) * interval;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00Z`;
}

function validateSourceUrl(sourceUrl, allowedHosts) {
  const url = new URL(String(sourceUrl || ""));
  if (url.protocol !== "https:") throw new Error("candidate_source_requires_https");
  const hosts = new Set((allowedHosts || []).map((host) => String(host || "").toLowerCase()));
  if (hosts.size === 0 || !hosts.has(url.hostname.toLowerCase())) {
    throw new Error(`candidate_source_host_not_allowed:${url.hostname}`);
  }
  return url;
}

function updatePolicyState(previous = {}, observation, observationWindow) {
  const observations = Array.isArray(previous.observations) ? [...previous.observations] : [];
  const existingIndex = observations.findIndex((entry) => entry?.slot === observation.slot);
  if (existingIndex >= 0) observations[existingIndex] = observation;
  else observations.push(observation);
  observations.sort((a, b) => String(a.slot || "").localeCompare(String(b.slot || "")));
  const retained = observations.slice(-Math.max(1, Number(observationWindow || 120)));
  const successCount = retained.filter((entry) => entry?.status === "success").length;
  const failureCount = retained.length - successCount;
  const latest = retained[retained.length - 1] || observation;
  let consecutiveFailures = 0;
  for (let index = retained.length - 1; index >= 0; index -= 1) {
    if (retained[index]?.status !== "failure") break;
    consecutiveFailures += 1;
  }
  const successHashes = retained
    .filter((entry) => entry?.status === "success" && String(entry?.content_hash || "").trim())
    .map((entry) => String(entry.content_hash));
  let hashChangeCount = 0;
  for (let index = 1; index < successHashes.length; index += 1) {
    if (successHashes[index] !== successHashes[index - 1]) hashChangeCount += 1;
  }
  const hashStabilityRate = successHashes.length <= 1
    ? 1
    : Number((1 - (hashChangeCount / (successHashes.length - 1))).toFixed(4));

  return {
    observations: retained,
    observation_count: retained.length,
    success_count: successCount,
    failure_count: failureCount,
    success_rate: retained.length > 0 ? Number((successCount / retained.length).toFixed(4)) : 0,
    distinct_content_hash_count: new Set(successHashes).size,
    hash_change_count: hashChangeCount,
    hash_stability_rate: hashStabilityRate,
    consecutive_failures: consecutiveFailures,
    last_status: latest.status,
    last_attempt_utc: latest.observed_at_utc,
    last_http_status: Number(latest.http_status || 0),
    last_error: String(latest.error || ""),
    last_content_hash: latest.status === "success"
      ? String(latest.content_hash || "")
      : String(previous.last_content_hash || ""),
    last_successful_fetch_utc: latest.status === "success"
      ? latest.observed_at_utc
      : String(previous.last_successful_fetch_utc || ""),
    source_updated_at: latest.status === "success"
      ? String(latest.source_updated_at || "")
      : String(previous.source_updated_at || ""),
  };
}

function responseHeader(response, name) {
  return String(response?.headers?.get?.(name) || "").trim();
}

function assertCandidateContent(text, source = {}) {
  const minChars = Math.max(1, Number(source?.min_chars || 140));
  if (text.length < minChars) throw new Error(`candidate_content_too_short:${text.length}_chars`);
  const lower = text.toLowerCase();
  for (const term of Array.isArray(source?.required_terms) ? source.required_terms : []) {
    const normalizedTerm = String(term || "").trim().toLowerCase();
    if (normalizedTerm && !lower.includes(normalizedTerm)) {
      throw new Error(`candidate_required_term_missing:${normalizedTerm}`);
    }
  }
}

async function fetchZendeskArticle({ fetchUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(fetchUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "Decide-Policy-Candidate-Monitor/1.0 (+https://decide.fyi)",
      },
      signal: controller.signal,
    });
    const httpStatus = Number(response?.status || 0);
    if (!response?.ok) throw Object.assign(new Error(`http_${httpStatus || "unknown"}`), { httpStatus });
    const payload = await response.json();
    const article = payload?.article;
    const text = normalizeText(`${article?.title || ""}\n${article?.body || ""}`);
    if (!article) throw Object.assign(new Error("invalid_article_payload"), { httpStatus });
    return {
      httpStatus,
      text,
      sourceUpdatedAt: String(article.updated_at || ""),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOfficialDocument({ fetchUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(fetchUrl, {
      headers: {
        accept: "text/html,text/plain,text/markdown,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": "Decide-Policy-Candidate-Monitor/1.0 (+https://decide.fyi)",
      },
      signal: controller.signal,
    });
    const httpStatus = Number(response?.status || 0);
    if (!response?.ok) throw Object.assign(new Error(`http_${httpStatus || "unknown"}`), { httpStatus });
    const contentType = responseHeader(response, "content-type").toLowerCase();
    if (contentType && !SUPPORTED_DOCUMENT_CONTENT_TYPES.some((type) => contentType.includes(type))) {
      throw Object.assign(new Error(`unsupported_document_content_type:${contentType}`), { httpStatus });
    }
    const raw = await response.text();
    const text = normalizeText(raw);
    const lower = text.toLowerCase();
    const challengeMarker = CHALLENGE_DOCUMENT_MARKERS.find((marker) => lower.includes(marker));
    if (challengeMarker) {
      throw Object.assign(new Error(`challenge_document_detected:${challengeMarker}`), { httpStatus });
    }
    return {
      httpStatus,
      text,
      sourceUpdatedAt: responseHeader(response, "last-modified"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function monitorPolicyVendorCandidates({
  registry = {},
  state = {},
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("candidate_monitor_fetch_unavailable");
  const current = clone(state);
  current.schema_version = "policy_vendor_candidate_state_v1";
  current.candidates = current.candidates && typeof current.candidates === "object" ? current.candidates : {};
  const observedAtUtc = new Date(now).toISOString();
  const intervalHours = Math.max(1, Number(registry?.admission?.observation_interval_hours || 6));
  const slot = toObservationSlot(now, intervalHours);
  const observationWindow = Math.max(1, Number(registry?.admission?.observation_window || 120));
  const results = [];
  const fetchCache = new Map();

  for (const [vendor, candidate] of Object.entries(registry?.candidates || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const vendorState = current.candidates[vendor] && typeof current.candidates[vendor] === "object"
      ? current.candidates[vendor]
      : { policies: {} };
    vendorState.policies = vendorState.policies && typeof vendorState.policies === "object" ? vendorState.policies : {};

    for (const [policy, source] of Object.entries(candidate?.policies || {}).sort(([a], [b]) => a.localeCompare(b))) {
      const monitor = String(source?.monitor || "").trim();
      if (monitor === "manual_review") {
        results.push({ vendor, policy, status: "manual_review", fetched: false });
        continue;
      }

      let observation;
      let cacheHit = false;
      try {
        const url = validateSourceUrl(source?.fetch_url, candidate?.allowed_hosts);
        const cacheKey = `${monitor}:${url.toString()}`;
        cacheHit = fetchCache.has(cacheKey);
        if (!cacheHit) {
          let fetchPromise;
          if (monitor === "zendesk_api") {
            fetchPromise = fetchZendeskArticle({
              fetchUrl: url.toString(),
              fetchImpl,
              timeoutMs,
            });
          } else if (monitor === "official_document") {
            fetchPromise = fetchOfficialDocument({
              fetchUrl: url.toString(),
              fetchImpl,
              timeoutMs,
            });
          } else {
            throw new Error(`unsupported_candidate_monitor:${monitor || "missing"}`);
          }
          fetchCache.set(cacheKey, fetchPromise);
        }
        const fetched = await fetchCache.get(cacheKey);
        assertCandidateContent(fetched.text, source);
        observation = {
          slot,
          observed_at_utc: observedAtUtc,
          status: "success",
          http_status: fetched.httpStatus,
          content_hash: contentHash(fetched.text),
          source_updated_at: fetched.sourceUpdatedAt,
          error: "",
        };
      } catch (error) {
        observation = {
          slot,
          observed_at_utc: observedAtUtc,
          status: "failure",
          http_status: Number(error?.httpStatus || 0),
          content_hash: "",
          source_updated_at: "",
          error: String(error?.name === "AbortError" ? "request_timeout" : error?.message || error),
        };
      }

      vendorState.policies[policy] = updatePolicyState(
        vendorState.policies[policy] || {},
        observation,
        observationWindow
      );
      results.push({
        vendor,
        policy,
        status: observation.status,
        fetched: true,
        cache_hit: cacheHit,
        http_status: observation.http_status,
        error: observation.error,
      });
    }

    current.candidates[vendor] = vendorState;
  }

  current.updated_utc = observedAtUtc;
  return { state: current, results, observation_slot: slot };
}
