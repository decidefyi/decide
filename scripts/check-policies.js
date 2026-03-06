#!/usr/bin/env node

/**
 * Daily policy checker — fetches each vendor's policy pages (refund, cancel, return, trial),
 * hashes the text content, and compares against stored hashes.
 * If any page has changed, outputs a list of changed vendors.
 *
 * Usage:
 *   node scripts/check-policies.js           # check all vendors
 *   node scripts/check-policies.js --update   # update stored hashes without diffing
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKER_CONFIG = {
  batchSize: Number.parseInt(process.env.POLICY_CHECK_BATCH_SIZE || "3", 10),
  directAttempts: Number.parseInt(process.env.POLICY_CHECK_DIRECT_ATTEMPTS || "3", 10),
  fallbackAttempts: Number.parseInt(process.env.POLICY_CHECK_FALLBACK_ATTEMPTS || "2", 10),
  browserHookAttempts: Number.parseInt(process.env.POLICY_CHECK_BROWSER_HOOK_ATTEMPTS || "1", 10),
  timeoutMs: Number.parseInt(process.env.POLICY_CHECK_TIMEOUT_MS || "18000", 10),
  errorDetailLimit: Number.parseInt(process.env.POLICY_CHECK_ERROR_DETAIL_LIMIT || "12", 10),
  candidateTtlDays: Number.parseInt(process.env.POLICY_CHECK_CANDIDATE_TTL_DAYS || "7", 10),
  pendingDetailLimit: Number.parseInt(process.env.POLICY_CHECK_PENDING_DETAIL_LIMIT || "20", 10),
  sameRunRecheckPasses: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_PASSES || "2", 10),
  sameRunRecheckDelayMs: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_DELAY_MS || "1600", 10),
  sameRunRecheckBatchSize: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_BATCH_SIZE || "3", 10),
  sameRunMajorityMinVotes: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_MAJORITY_MIN_VOTES || "2", 10),
  crossRunWindowSize: Number.parseInt(process.env.POLICY_CHECK_CROSS_RUN_WINDOW_SIZE || "6", 10),
  crossRunWindowRequired: Number.parseInt(process.env.POLICY_CHECK_CROSS_RUN_WINDOW_REQUIRED || "3", 10),
  stalePendingDays: Number.parseInt(process.env.POLICY_CHECK_STALE_PENDING_DAYS || "3", 10),
  volatileFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_VOLATILE_FLIP_THRESHOLD || "2", 10),
  escalationPendingDays: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_PENDING_DAYS || "5", 10),
  escalationFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_FLIP_THRESHOLD || "4", 10),
  fetchFailureQuarantineStreak: Number.parseInt(process.env.POLICY_CHECK_FETCH_FAILURE_QUARANTINE_STREAK || "2", 10),
  noConfirmEscalationDays: Number.parseInt(process.env.POLICY_CHECK_NO_CONFIRM_ESCALATION_DAYS || "7", 10),
  materialCooldownDays: Number.parseInt(process.env.POLICY_CHECK_MATERIAL_COOLDOWN_DAYS || "14", 10),
  materialOscillationWindowDays: Number.parseInt(process.env.POLICY_CHECK_MATERIAL_OSCILLATION_WINDOW_DAYS || "21", 10),
  actualConfirmRuns: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_CONFIRM_RUNS || "2", 10),
  actualMinGapHours: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_MIN_GAP_HOURS || "4", 10),
  fetchQualityMinChars: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_CHARS || "140", 10),
  fetchQualityMinLines: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_LINES || "5", 10),
  fetchQualityMinPolicyHits: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_POLICY_HITS || "1", 10),
  alertLowSignalThreshold: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_THRESHOLD || "1", 10),
  alertLowSignalLookback: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_LOOKBACK || "6", 10),
  browserHookUrl: String(process.env.POLICY_CHECK_BROWSER_HOOK_URL || "").trim(),
  browserHookToken: String(process.env.POLICY_CHECK_BROWSER_HOOK_TOKEN || "").trim(),
  fetchLaneDefault: String(process.env.POLICY_CHECK_FETCH_LANES_DEFAULT || "").trim(),
};
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
];

const POLICY_SETS = [
  {
    name: "refund",
    sourcesPath: join(__dirname, "..", "rules", "policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "policy-semantic-state.json"),
    rulesFile: "v1_us_individual.json",
  },
  {
    name: "cancel",
    sourcesPath: join(__dirname, "..", "rules", "cancel-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "cancel-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "cancel-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "cancel-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "cancel-policy-semantic-state.json"),
    rulesFile: "v1_us_individual_cancel.json",
  },
  {
    name: "return",
    sourcesPath: join(__dirname, "..", "rules", "return-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "return-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "return-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "return-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "return-policy-semantic-state.json"),
    rulesFile: "v1_us_individual_return.json",
  },
  {
    name: "trial",
    sourcesPath: join(__dirname, "..", "rules", "trial-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "trial-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "trial-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "trial-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "trial-policy-semantic-state.json"),
    rulesFile: "v1_us_individual_trial.json",
  },
];

const POLICY_FOCUS_KEYWORDS = {
  default: [
    "policy",
    "terms",
    "subscription",
    "billing",
    "payment",
    "membership",
    "renew",
    "renewal",
    "auto-renew",
    "cancel",
    "refund",
    "return",
    "trial",
  ],
  refund: [
    "refund",
    "reimbursement",
    "money back",
    "chargeback",
    "credited",
    "credited back",
  ],
  cancel: [
    "cancel",
    "cancellation",
    "terminate",
    "termination",
    "opt out",
    "end subscription",
  ],
  return: [
    "return",
    "returned",
    "eligibility",
    "window",
    "days",
    "exchange",
  ],
  trial: [
    "trial",
    "free trial",
    "introductory",
    "intro offer",
    "after trial",
    "billed after",
    "promo",
  ],
};
const BASELINE_SIGNAL = "__baseline__";
const VENDOR_STABILITY_KEYWORDS = {
  canva: ["canva pro", "canva teams", "manage billing", "cancel canva", "subscription"],
  espn_plus: ["espn+", "subscription", "bundle", "billing", "cancel"],
  myfitnesspal_premium: ["myfitnesspal premium", "premium subscription", "renewal", "cancel premium"],
  substack: ["substack", "subscription", "paid subscription", "cancel", "refund"],
  twitch: ["twitch turbo", "subscription renews", "cancel recurring", "subscription payment"],
  fitbit_premium: ["fitbit premium", "subscription", "google payments", "renews"],
  paramount_plus: ["paramount+", "subscription", "cancel", "billing"],
  audible: ["audible membership", "audible premium plus", "cancel", "billing"],
  grammarly: ["grammarly premium", "subscription", "billing", "renewal", "cancel"],
  evernote: ["evernote personal", "evernote professional", "subscription", "billing", "cancel"],
  nfl_plus: ["nfl+", "subscription", "billing", "cancel", "trial"],
  dashlane: ["dashlane premium", "subscription", "billing", "auto-renew", "cancel"],
  headspace: ["headspace", "subscription", "billing", "cancel", "renewal"],
  soundcloud_go: ["soundcloud go", "soundcloud go+", "subscription", "billing", "cancel"],
  roblox_premium: ["roblox premium", "subscription", "billing", "cancel", "renewal"],
  x_premium: ["x premium", "premium+", "subscription", "billing", "cancel"],
  calm: ["calm premium", "subscription", "billing", "cancel", "renewal"],
  hinge: ["hinge+", "hinge x", "subscription", "refund", "cancel"],
  midjourney: ["midjourney", "subscription", "billing", "cancel"],
  crunchyroll: ["crunchyroll premium", "subscription", "cancel", "billing"],
};
// Targeted noise-reduction overrides for persistently volatile vendors.
// Keep this list intentionally small and explicit.
const ESCALATION_FLIP_THRESHOLD_OVERRIDES = {
  refund: {
    myfitnesspal_premium: 30,
  },
  cancel: {
    audible: 30,
    canva: 30,
    fitbit_premium: 30,
    paramount_plus: 30,
    twitch: 30,
  },
  return: {
    myfitnesspal_premium: 30,
  },
};
const ACTUAL_CONFIRM_RUN_OVERRIDES = {
  myfitnesspal_premium: 3,
  canva: 3,
  fitbit_premium: 3,
  paramount_plus: 3,
  twitch: 3,
};
const HASH_PROFILE_ID = process.env.POLICY_CHECK_HASH_PROFILE || "focus-v1";
export const LEGACY_PENDING_MODEL_ID = "legacy-v1";
export const PENDING_MODEL_ID = process.env.POLICY_CHECK_PENDING_MODEL || "signal-v2";
const POLICY_ALERT_FEED_PATH = join(__dirname, "..", "rules", "policy-alert-feed.json");
const POLICY_EVENT_LOG_PATH = join(__dirname, "..", "rules", "policy-events.ndjson");
const POLICY_TIER1_VENDORS_PATH = join(__dirname, "..", "rules", "policy-tier1-vendors.json");
const POLICY_COUNT_KEYS = ["refund", "cancel", "return", "trial"];

const isUpdate = process.argv.includes("--update");

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  return Math.floor(Math.random() * ms);
}

const SUPPORTED_FETCH_LANES = new Set(["direct", "zendesk_api", "mirror", "browser_hook"]);

function normalizeFetchLane(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFetchLaneList(values) {
  if (!Array.isArray(values)) return [];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const lane = normalizeFetchLane(value);
    if (!lane || !SUPPORTED_FETCH_LANES.has(lane) || seen.has(lane)) continue;
    seen.add(lane);
    unique.push(lane);
  }
  return unique;
}

function parseFetchLaneCsv(value) {
  return normalizeFetchLaneList(String(value || "").split(","));
}

function getDefaultFetchLanes() {
  const configured = parseFetchLaneCsv(CHECKER_CONFIG.fetchLaneDefault);
  if (configured.length > 0) return configured;
  if (CHECKER_CONFIG.browserHookUrl) {
    return ["browser_hook", "direct", "zendesk_api", "mirror"];
  }
  return ["direct", "zendesk_api", "mirror"];
}

function getVendorFetchLanes(vendorConfig) {
  const configured = normalizeFetchLaneList(vendorConfig?.fetch_lanes);
  if (configured.length > 0) return configured;
  return getDefaultFetchLanes();
}

function normalizeTier1VendorList(value) {
  if (!Array.isArray(value)) return [];
  const unique = [];
  const seen = new Set();
  for (const vendorRaw of value) {
    const vendor = String(vendorRaw || "").trim();
    if (!vendor || seen.has(vendor)) continue;
    seen.add(vendor);
    unique.push(vendor);
  }
  return unique;
}

function loadTier1VendorsConfig() {
  const raw = readJson(POLICY_TIER1_VENDORS_PATH, {});
  const defaults = normalizeTier1VendorList(raw?.default);
  const byPolicy = {};
  for (const policyType of POLICY_COUNT_KEYS) {
    byPolicy[policyType] = normalizeTier1VendorList(raw?.[policyType]);
  }
  return { default: defaults, byPolicy };
}

function getTier1TargetForPolicy(policyType, availableVendors, tier1Config) {
  const defaultVendors = tier1Config?.default || [];
  const policyVendors = tier1Config?.byPolicy?.[policyType] || [];
  const configured = normalizeTier1VendorList([...defaultVendors, ...policyVendors]);
  const available = new Set(Array.isArray(availableVendors) ? availableVendors : []);
  const target = configured.filter((vendor) => available.has(vendor));
  const missingConfigured = configured.filter((vendor) => !available.has(vendor));
  return { configured, target, missingConfigured };
}

function utcIsoTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function summarizePolicyCounts(changedItems) {
  const counts = {};
  for (const item of changedItems) {
    const policyType = item?.policyType || "unknown";
    counts[policyType] = (counts[policyType] || 0) + 1;
  }
  return counts;
}

function toPolicyCountObject(changedItems) {
  const counts = summarizePolicyCounts(changedItems);
  const result = {};
  for (const key of POLICY_COUNT_KEYS) {
    const value = Number.parseInt(String(counts[key] ?? 0), 10);
    result[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  return result;
}

function getPolicyAlertFeedMaxEntries() {
  const parsed = Number.parseInt(process.env.POLICY_ALERT_FEED_MAX_ENTRIES || "120", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.min(366, parsed);
}

function getPolicyAlertLowSignalThreshold() {
  if (!Number.isFinite(CHECKER_CONFIG.alertLowSignalThreshold)) return 1;
  return Math.max(0, CHECKER_CONFIG.alertLowSignalThreshold);
}

function getPolicyAlertLowSignalLookback() {
  if (!Number.isFinite(CHECKER_CONFIG.alertLowSignalLookback)) return 6;
  return Math.max(1, CHECKER_CONFIG.alertLowSignalLookback);
}

function getPolicyAlertIncludeZeroChange() {
  const value = String(process.env.POLICY_ALERT_INCLUDE_ZERO_CHANGE || "0").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function buildRunUrl() {
  const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
  const runId = String(process.env.GITHUB_RUN_ID || "").trim();
  if (!repository || !runId) return "";
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

function updatePolicyAlertFeed(entry) {
  const existing = readJson(POLICY_ALERT_FEED_PATH, { alerts: [] });
  const existingAlerts = Array.isArray(existing.alerts) ? existing.alerts : [];
  const merged = mergePolicyAlertFeed({
    existingAlerts,
    entry,
    maxEntries: getPolicyAlertFeedMaxEntries(),
    lowSignalThreshold: getPolicyAlertLowSignalThreshold(),
    lowSignalLookback: getPolicyAlertLowSignalLookback(),
  });
  const nextAlerts = merged.alerts;
  const previousSerialized = JSON.stringify(existingAlerts);
  const nextSerialized = JSON.stringify(nextAlerts);
  const feedChanged = previousSerialized !== nextSerialized;

  const nextPayload = {
    schema_version: 1,
    updated_utc: utcIsoTimestamp(),
    source: "check-policies.js",
    alerts: nextAlerts,
  };

  if (feedChanged) {
    writeFileSync(POLICY_ALERT_FEED_PATH, JSON.stringify(nextPayload, null, 2) + "\n");
  }

  return {
    published: Boolean(merged.published),
    reason: String(merged.reason || ""),
    signature: String(merged.signature || ""),
    feedChanged,
  };
}

function readNdjson(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = String(readFileSync(filePath, "utf8") || "");
  if (!raw.trim()) return [];
  const parsed = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object") {
        parsed.push(value);
      }
    } catch {
      // Ignore malformed historic lines and continue.
    }
  }
  return parsed;
}

function buildPolicyEventId(item) {
  const policyType = String(item?.policyType || item?.policy || "").trim();
  const vendor = String(item?.vendor || "").trim();
  const confirmedHash = String(item?.confirmed_hash || item?.hash || "").trim();
  if (!policyType || !vendor || !confirmedHash) return "";
  return `${policyType}:${vendor}:${confirmedHash}`;
}

function appendPolicyEventLog(changedItems, generatedAtUtc = utcIsoTimestamp()) {
  const existingEvents = readNdjson(POLICY_EVENT_LOG_PATH);
  const existingIds = new Set();
  for (const event of existingEvents) {
    const eventId = String(event?.event_id || "").trim() || buildPolicyEventId(event);
    if (eventId) existingIds.add(eventId);
  }

  const runId = String(process.env.GITHUB_RUN_ID || "").trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || "").trim();
  const commitSha = String(process.env.GITHUB_SHA || "").trim();
  const runUrl = buildRunUrl();
  const newEvents = [];
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const item of changedItems || []) {
    const eventId = buildPolicyEventId(item);
    if (!eventId) {
      skippedInvalid += 1;
      continue;
    }
    if (existingIds.has(eventId)) {
      skippedExisting += 1;
      continue;
    }

    const event = {
      event_id: eventId,
      emitted_at_utc: generatedAtUtc,
      policy: String(item.policyType || "").trim(),
      vendor: String(item.vendor || "").trim(),
      confirmed_hash: String(item.confirmed_hash || "").trim(),
      previous_hash: String(item.previous_hash || "").trim(),
      semantic_diff_summary: String(item.semantic_diff_summary || "").trim(),
      source_url: String(item.url || "").trim(),
      rules_file: String(item.rulesFile || "").trim(),
      run_id: runId,
      run_attempt: runAttempt,
      commit_sha: commitSha,
      run_url: runUrl,
    };
    if (item.semantic_diff && typeof item.semantic_diff === "object") {
      event.semantic_diff = item.semantic_diff;
    }
    newEvents.push(event);
    existingIds.add(eventId);
  }

  if (newEvents.length > 0) {
    const existingRaw = existsSync(POLICY_EVENT_LOG_PATH)
      ? String(readFileSync(POLICY_EVENT_LOG_PATH, "utf8") || "").trimEnd()
      : "";
    const appendedRaw = newEvents.map((event) => JSON.stringify(event)).join("\n");
    const nextRaw = existingRaw ? `${existingRaw}\n${appendedRaw}\n` : `${appendedRaw}\n`;
    writeFileSync(POLICY_EVENT_LOG_PATH, nextRaw, "utf8");
  }

  return {
    appended_count: newEvents.length,
    skipped_existing_count: skippedExisting,
    skipped_invalid_count: skippedInvalid,
    total_count: existingIds.size,
  };
}

function updateJsonStringField(filePath, fieldName, nextValue) {
  const raw = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"[^"]*"`);
  if (pattern.test(raw)) {
    const updated = raw.replace(pattern, `"${fieldName}": "${nextValue}"`);
    if (updated !== raw) {
      writeFileSync(filePath, updated, "utf8");
      return true;
    }
    return false;
  }

  return false;
}

function detectFetchInterstitial(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "empty";

  const normalized = raw.toLowerCase();
  const checks = [
    ["cloudflare_challenge", normalized.includes("cf_chl_opt") || normalized.includes("/cdn-cgi/challenge-platform/")],
    ["js_cookie_challenge", normalized.includes("enable javascript and cookies to continue")],
    ["just_a_moment", normalized.includes("<title>just a moment") || normalized.includes("title: just a moment")],
    ["captcha_interstitial", normalized.includes("captcha") && normalized.includes("attention required")],
    ["akamai_access_denied", normalized.includes("access denied") && normalized.includes("reference #")],
  ];

  for (const [reason, matched] of checks) {
    if (matched) return reason;
  }

  return "";
}

function normalizeFetchFailureReasonToken(errorMessage) {
  const normalized = String(errorMessage || "").trim().toLowerCase();
  if (!normalized) return "";
  if (/^http\s+\d{3}$/.test(normalized)) {
    return normalized.replace(/\s+/g, "_");
  }
  return normalized.replace(/\s+/g, "_");
}

function parseFetchFailureSegments(failureReason) {
  return String(failureReason || "")
    .split(";")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)
    .map((segment) => {
      const match = /^(.*?)\s+\[([^\]]+)\]\s+\((.*)\)$/.exec(segment);
      if (!match) {
        return {
          lane: "",
          error: segment,
        };
      }
      return {
        lane: String(match[2] || "").trim().toLowerCase(),
        error: String(match[3] || "").trim(),
      };
    });
}

function isImmediateFetchBlockErrorMessage(errorMessage) {
  const normalized = String(errorMessage || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("interstitial:")) return true;
  return ["http 401", "http 403", "http 429", "http 451", "http 1020"].includes(normalized);
}

function isAuxiliaryFetchFailureSegment(segment) {
  if (!segment || typeof segment !== "object") return false;
  const lane = String(segment.lane || "").trim().toLowerCase();
  const error = String(segment.error || "").trim().toLowerCase();
  return lane === "zendesk_api" && error === "http 404";
}

export function classifyFetchFailureBlock(failureReason) {
  const segments = parseFetchFailureSegments(failureReason);
  if (segments.length === 0) {
    return { immediateBlock: false, reason: "" };
  }

  let strongBlockSeen = false;
  const reasonTokens = [];
  for (const segment of segments) {
    if (isImmediateFetchBlockErrorMessage(segment.error)) {
      strongBlockSeen = true;
      const token = normalizeFetchFailureReasonToken(segment.error);
      if (token) {
        reasonTokens.push(token);
      }
      continue;
    }
    if (isAuxiliaryFetchFailureSegment(segment)) {
      continue;
    }
    return { immediateBlock: false, reason: "" };
  }

  if (!strongBlockSeen) {
    return { immediateBlock: false, reason: "" };
  }

  const uniqueTokens = [...new Set(reasonTokens)];
  return {
    immediateBlock: true,
    reason: uniqueTokens.length > 0 ? `known_fetch_blocker:${uniqueTokens.join("|")}` : "known_fetch_blocker",
  };
}

export function getCandidatePendingModelId(candidate) {
  const configured =
    typeof candidate?.pending_model_id === "string" && candidate.pending_model_id.trim()
      ? candidate.pending_model_id.trim()
      : "";
  return configured || LEGACY_PENDING_MODEL_ID;
}

export function isLegacyPendingCandidate(candidate) {
  return getCandidatePendingModelId(candidate) !== PENDING_MODEL_ID;
}

function getPendingModelFirstObservedUtc(candidate, fallback = "") {
  if (typeof candidate?.pending_model_first_observed_utc === "string" && candidate.pending_model_first_observed_utc.trim()) {
    return candidate.pending_model_first_observed_utc.trim();
  }
  return String(fallback || "").trim();
}

function markCandidatePendingModel(candidate, firstObservedUtc) {
  return {
    ...(candidate && typeof candidate === "object" ? candidate : {}),
    pending_model_id: PENDING_MODEL_ID,
    pending_model_first_observed_utc: getPendingModelFirstObservedUtc(candidate, firstObservedUtc),
  };
}

function decodeHtmlEntities(input) {
  if (!input) return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPolicyKeywordRegex(policyType) {
  const typedKeywords = POLICY_FOCUS_KEYWORDS[policyType] || [];
  const keywords = [...new Set([...POLICY_FOCUS_KEYWORDS.default, ...typedKeywords])];
  if (keywords.length === 0) return null;
  const pattern = keywords
    .filter((keyword) => typeof keyword === "string" && keyword.trim())
    .map((keyword) => escapeRegexLiteral(keyword.trim()))
    .join("|");
  if (!pattern) return null;
  return new RegExp(`\\b(?:${pattern})\\b`, "i");
}

function getPolicyKeywords(policyType) {
  const typedKeywords = POLICY_FOCUS_KEYWORDS[policyType] || [];
  return [...new Set([...POLICY_FOCUS_KEYWORDS.default, ...typedKeywords])]
    .map((keyword) => String(keyword || "").trim().toLowerCase())
    .filter(Boolean);
}

function getVendorKeywordRegex(vendorKey) {
  const keywords = VENDOR_STABILITY_KEYWORDS[vendorKey];
  if (!Array.isArray(keywords) || keywords.length === 0) return null;
  const pattern = keywords
    .filter((keyword) => typeof keyword === "string" && keyword.trim())
    .map((keyword) => escapeRegexLiteral(keyword.trim()))
    .join("|");
  if (!pattern) return null;
  return new RegExp(`\\b(?:${pattern})\\b`, "i");
}

function extractVendorStableText(lines, vendorKey) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const vendorRegex = getVendorKeywordRegex(vendorKey);
  if (!vendorRegex) return "";

  const selectedIndexes = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!vendorRegex.test(lines[i])) continue;
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j += 1) {
      selectedIndexes.add(j);
    }
  }

  if (selectedIndexes.size < 6) return "";
  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .join("\n");
}

function extractPolicyFocusedText(lines, policyType) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const keywordRegex = getPolicyKeywordRegex(policyType);
  if (!keywordRegex) return "";

  const selectedIndexes = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!keywordRegex.test(lines[i])) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j += 1) {
      selectedIndexes.add(j);
    }
  }

  if (selectedIndexes.size < 6) {
    return "";
  }

  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .join("\n");
}

function normalizeFetchedText(rawText, policyType = "default", vendorKey = "") {
  let text = String(rawText || "");
  if (!text.trim()) return "";

  text = text
    .replace(/\r/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|canvas|header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text)
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, " ")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, " ")
    .replace(/\b[a-f0-9]{24,}\b/gi, " ")
    .replace(/\b(v|version)\s*\d+(?:\.\d+){1,3}\b/gi, " ")
    .replace(/[ \t]+/g, " ");

  const lines = text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 8);

  const deduped = [];
  for (const line of lines) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }

  const vendorStable = extractVendorStableText(deduped, vendorKey);
  if (vendorStable) return vendorStable;

  const focused = extractPolicyFocusedText(deduped, policyType);
  if (focused) return focused;
  return deduped.join("\n");
}

function getFetchQualityMinChars() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinChars)) return 140;
  return Math.max(40, CHECKER_CONFIG.fetchQualityMinChars);
}

function getFetchQualityMinLines() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinLines)) return 5;
  return Math.max(2, CHECKER_CONFIG.fetchQualityMinLines);
}

function getFetchQualityMinPolicyHits() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinPolicyHits)) return 1;
  return Math.max(1, CHECKER_CONFIG.fetchQualityMinPolicyHits);
}

function countPolicyKeywordHits(text, policyType) {
  const normalizedText = String(text || "").toLowerCase();
  if (!normalizedText.trim()) return 0;
  const keywords = getPolicyKeywords(policyType);
  let hits = 0;
  for (const keyword of keywords) {
    if (keyword && normalizedText.includes(keyword)) {
      hits += 1;
    }
  }
  return hits;
}

function assessFetchQuality({ rawText, normalizedText, policyType }) {
  const reasons = [];
  const interstitialReason = detectFetchInterstitial(rawText) || detectFetchInterstitial(normalizedText);
  if (interstitialReason) {
    reasons.push(`interstitial:${interstitialReason}`);
  }

  const normalized = String(normalizedText || "").trim();
  const normalizedLength = normalized.length;
  const lineCount = normalized ? normalized.split("\n").filter(Boolean).length : 0;
  const policyKeywordHits = countPolicyKeywordHits(normalized, policyType);

  const minChars = getFetchQualityMinChars();
  const minLines = getFetchQualityMinLines();
  const minPolicyHits = getFetchQualityMinPolicyHits();

  if (normalizedLength < minChars) {
    reasons.push(`short_text:${normalizedLength}<${minChars}`);
  }
  if (lineCount < minLines) {
    reasons.push(`short_lines:${lineCount}<${minLines}`);
  }
  if (policyKeywordHits < minPolicyHits) {
    reasons.push(`weak_policy_terms:${policyKeywordHits}<${minPolicyHits}`);
  }

  return {
    passed: reasons.length === 0,
    reason: reasons.join("&"),
    normalizedLength,
    lineCount,
    policyKeywordHits,
  };
}

function normalizePageMetadata(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    source_kind: typeof source.source_kind === "string" ? source.source_kind.trim().toLowerCase() : "",
    source_title: typeof source.source_title === "string" ? source.source_title.trim() : "",
    display_last_updated_label:
      typeof source.display_last_updated_label === "string" ? source.display_last_updated_label.trim() : "",
    display_last_updated_date_utc:
      typeof source.display_last_updated_date_utc === "string" ? source.display_last_updated_date_utc.trim() : "",
    display_effective_date_label:
      typeof source.display_effective_date_label === "string" ? source.display_effective_date_label.trim() : "",
    display_effective_date_utc:
      typeof source.display_effective_date_utc === "string" ? source.display_effective_date_utc.trim() : "",
    source_updated_at_utc:
      typeof source.source_updated_at_utc === "string" ? source.source_updated_at_utc.trim() : "",
    source_edited_at_utc:
      typeof source.source_edited_at_utc === "string" ? source.source_edited_at_utc.trim() : "",
  };
}

function toIsoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function buildPageMetadataSignature(input) {
  const metadata = normalizePageMetadata(input);
  const canonical = {
    source_kind: metadata.source_kind,
    source_title: metadata.source_title,
    display_last_updated_label: metadata.display_last_updated_label,
    display_last_updated_date_utc: metadata.display_last_updated_date_utc,
    display_effective_date_label: metadata.display_effective_date_label,
    display_effective_date_utc: metadata.display_effective_date_utc,
    source_updated_at_utc: metadata.source_updated_at_utc,
    source_edited_at_utc: metadata.source_edited_at_utc,
  };
  if (!Object.values(canonical).some((value) => String(value || "").trim().length > 0)) {
    return "";
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 16);
}

function extractMetadataText(rawText) {
  return decodeHtmlEntities(
    String(rawText || "")
      .replace(/\r/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

function extractDateLabelFromText(text, labelPattern) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const pattern = new RegExp(`${labelPattern}\\s*:?\\s*([a-z]{3,9}\\s+\\d{1,2},\\s+\\d{4})`, "i");
  const match = pattern.exec(raw);
  return match ? String(match[1] || "").trim() : "";
}

function extractTitleFromText(rawText) {
  const raw = String(rawText || "");
  const titleMatch = /<title[^>]*>([^<]{2,220})<\/title>/i.exec(raw);
  if (titleMatch) {
    return decodeHtmlEntities(String(titleMatch[1] || "")).replace(/\s+/g, " ").trim();
  }
  const headingMatch = /<h1[^>]*>([\s\S]{2,220}?)<\/h1>/i.exec(raw);
  if (headingMatch) {
    return decodeHtmlEntities(String(headingMatch[1] || ""))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function extractPageMetadata({ rawText, sourceMetadata } = {}) {
  const normalizedSourceMetadata = normalizePageMetadata(sourceMetadata);
  const text = extractMetadataText(rawText);
  const lastUpdatedLabel =
    normalizedSourceMetadata.display_last_updated_label || extractDateLabelFromText(text, "last\\s+updated");
  const effectiveDateLabel =
    normalizedSourceMetadata.display_effective_date_label || extractDateLabelFromText(text, "effective\\s+date");

  const metadata = normalizePageMetadata({
    ...normalizedSourceMetadata,
    source_kind: normalizedSourceMetadata.source_kind || "html",
    source_title: normalizedSourceMetadata.source_title || extractTitleFromText(rawText),
    display_last_updated_label: lastUpdatedLabel,
    display_last_updated_date_utc:
      normalizedSourceMetadata.display_last_updated_date_utc || toIsoDateOnly(lastUpdatedLabel),
    display_effective_date_label: effectiveDateLabel,
    display_effective_date_utc:
      normalizedSourceMetadata.display_effective_date_utc || toIsoDateOnly(effectiveDateLabel),
  });
  return {
    ...metadata,
    metadata_signature: buildPageMetadataSignature(metadata),
  };
}

function normalizeSemanticTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  const normalized = tokens
    .map((token) => String(token || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function semanticTokenSignature(profile) {
  const tokens = normalizeSemanticTokens(profile?.tokens);
  return tokens.join("|");
}

export function semanticSignaturesStable(previousSignature, nextSignature) {
  const previous = typeof previousSignature === "string" ? previousSignature : "";
  const next = typeof nextSignature === "string" ? nextSignature : "";
  if (!previous && !next) return true;
  return Boolean(previous && next && previous === next);
}

export function buildChangeKey(hashValue, semanticSignature) {
  const semantic = typeof semanticSignature === "string" ? semanticSignature.trim() : "";
  if (semantic) return semantic;
  const hashText = typeof hashValue === "string" ? hashValue.trim() : "";
  return hashText;
}

function getCandidateChangeKey(candidate, fallback = {}) {
  const explicit =
    typeof candidate?.change_key === "string" && candidate.change_key.trim()
      ? candidate.change_key.trim()
      : "";
  if (explicit) return explicit;
  const fallbackHash =
    typeof fallback.hash === "string" && fallback.hash.trim()
      ? fallback.hash.trim()
      : "";
  const fallbackSemanticSignature =
    typeof fallback.semanticSignature === "string" && fallback.semanticSignature.trim()
      ? fallback.semanticSignature.trim()
      : "";
  return buildChangeKey(
    typeof candidate?.hash === "string" ? candidate.hash : fallbackHash,
    typeof candidate?.semantic_signature === "string"
      ? candidate.semantic_signature
      : fallbackSemanticSignature
  );
}

function getCandidateSignalWindowDecision(candidate) {
  if (typeof candidate?.signal_window_change_decision === "string" && candidate.signal_window_change_decision.trim()) {
    return candidate.signal_window_change_decision.trim();
  }
  if (typeof candidate?.signal_window_hash_decision === "string" && candidate.signal_window_hash_decision.trim()) {
    return candidate.signal_window_hash_decision.trim();
  }
  return "";
}

function extractDurationTokens(text, anchors = [], tokenPrefix = "window_days") {
  const output = new Set();
  if (!text) return output;
  const anchorPattern = anchors
    .filter((anchor) => typeof anchor === "string" && anchor.trim())
    .map((anchor) => escapeRegexLiteral(anchor.trim()))
    .join("|");
  const anchorRegex = anchorPattern ? new RegExp(`\\b(?:${anchorPattern})\\b`, "i") : null;
  const durationRegex = /(\d{1,3})\s*(day|days|week|weeks|month|months|year|years)\b/gi;
  let match;
  while ((match = durationRegex.exec(text)) !== null) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = String(match[2] || "").toLowerCase();
    let days = value;
    if (unit.startsWith("week")) days = value * 7;
    if (unit.startsWith("month")) days = value * 30;
    if (unit.startsWith("year")) days = value * 365;
    if (days <= 0 || days > 366) continue;
    const contextStart = Math.max(0, match.index - 80);
    const contextEnd = Math.min(text.length, durationRegex.lastIndex + 80);
    const context = text.slice(contextStart, contextEnd);
    if (anchorRegex && !anchorRegex.test(context)) continue;
    output.add(`${tokenPrefix}:${days}`);
  }
  return output;
}

function extractSemanticTokens(text, policyType = "default") {
  const normalizedText = String(text || "").toLowerCase();
  const tokens = new Set();
  if (!normalizedText.trim()) return [];

  const addIfMatch = (token, regex) => {
    if (regex.test(normalizedText)) tokens.add(token);
  };

  // Cross-policy structural tokens.
  addIfMatch("billing:auto_renew", /\b(auto[-\s]?renew|renews?\s+automatically|automatic renewal)\b/i);
  addIfMatch("restriction:no_refund_or_final_sale", /\b(no refunds?|non[-\s]?refundable|final sale|all sales final)\b/i);
  addIfMatch("risk:chargeback_or_dispute", /\b(chargeback|dispute)\b/i);
  addIfMatch("flow:support_request", /\b(contact support|support request|submit (a )?(request|ticket)|reach out to support)\b/i);
  addIfMatch("billing:prorated", /\b(pro[-\s]?rated|prorated|pro rata)\b/i);

  if (policyType === "refund") {
    addIfMatch("refund:allowed_language", /\b(refunds?\s+(are|is)\s+(available|eligible)|eligible for refunds?|money[-\s]?back)\b/i);
    addIfMatch("refund:partial_allowed", /\b(partial refunds?|pro[-\s]?rated refunds?)\b/i);
    addIfMatch("refund:store_credit_only", /\b(store credit|account credit|credits? only)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["refund", "money back", "chargeback", "dispute", "purchase", "billing"],
      "refund_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "cancel") {
    addIfMatch("cancel:anytime", /\b(cancel any ?time|cancel at any time|can cancel anytime)\b/i);
    addIfMatch("cancel:non_cancellable", /\b(cannot cancel|can't cancel|non[-\s]?cancellable|no cancellation)\b/i);
    addIfMatch("cancel:fee_or_penalty", /\b(cancellation fee|cancel(?:lation)? penalty|early termination fee|termination fee|penalty fee)\b/i);
    addIfMatch("cancel:effective_end_of_term", /\b(end of (the )?(current )?(billing|subscription) period)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["cancel", "cancellation", "terminate", "termination", "renew", "billing"],
      "cancel_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "return") {
    addIfMatch("return:restocking_fee", /\b(restocking fee)\b/i);
    addIfMatch("return:shipping_costs", /\b(return shipping|shipping costs?|shipping fee)\b/i);
    addIfMatch("return:condition_unopened_or_unused", /\b(unopened|unused|original packaging|in original condition)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["return", "returned", "exchange", "item", "product", "delivery"],
      "return_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "trial") {
    addIfMatch("trial:auto_converts_to_paid", /\b(trial.*(auto[-\s]?renew|billed|charged)|after (the )?trial.*(billed|charged|renews?))\b/i);
    addIfMatch("trial:payment_method_required", /\b(card required|credit card required|payment method required)\b/i);
    addIfMatch("trial:cancel_before_end", /\b(cancel before .*trial (ends?|end)|before trial ends?\s*,?\s*cancel)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["trial", "free trial", "introductory", "promo", "promotion"],
      "trial_window_days"
    )) {
      tokens.add(token);
    }
  }

  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function buildSemanticProfile(text, policyType, metadata = {}) {
  const sourceHash = typeof metadata.hash === "string" ? metadata.hash : "";
  const sourceUrl = typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : "";
  const extractedAtUtc =
    typeof metadata.extractedAtUtc === "string" && metadata.extractedAtUtc
      ? metadata.extractedAtUtc
      : utcIsoTimestamp();
  const pageMetadata = normalizePageMetadata(metadata.pageMetadata || metadata.page_metadata);
  const metadataSignature = buildPageMetadataSignature(pageMetadata);
  return {
    hash: sourceHash,
    source_url: sourceUrl,
    extracted_at_utc: extractedAtUtc,
    tokens: normalizeSemanticTokens(extractSemanticTokens(text, policyType)),
    page_metadata: pageMetadata,
    metadata_signature: metadataSignature,
  };
}

function normalizeSemanticProfile(input, metadata = {}) {
  if (!input || typeof input !== "object") {
    return buildSemanticProfile("", "default", metadata);
  }
  return {
    hash: typeof input.hash === "string" && input.hash ? input.hash : (metadata.hash || ""),
    source_url:
      typeof input.source_url === "string"
        ? input.source_url
        : (typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : ""),
    extracted_at_utc:
      typeof input.extracted_at_utc === "string" && input.extracted_at_utc
        ? input.extracted_at_utc
        : (typeof metadata.extractedAtUtc === "string" ? metadata.extractedAtUtc : utcIsoTimestamp()),
    tokens: normalizeSemanticTokens(input.tokens),
    page_metadata: normalizePageMetadata(input.page_metadata || metadata.pageMetadata || metadata.page_metadata),
    metadata_signature:
      typeof input.metadata_signature === "string" && input.metadata_signature
        ? input.metadata_signature
        : buildPageMetadataSignature(input.page_metadata || metadata.pageMetadata || metadata.page_metadata),
  };
}

function diffSemanticProfiles(previousProfile, nextProfile) {
  const hasPrevious = Boolean(previousProfile && Array.isArray(previousProfile.tokens));
  const previousTokens = hasPrevious ? normalizeSemanticTokens(previousProfile.tokens) : [];
  const nextTokens = normalizeSemanticTokens(nextProfile?.tokens);
  if (!hasPrevious) {
    return {
      material: false,
      baselineMissing: true,
      added: [],
      removed: [],
    };
  }
  const previousSet = new Set(previousTokens);
  const nextSet = new Set(nextTokens);
  const added = nextTokens.filter((token) => !previousSet.has(token));
  const removed = previousTokens.filter((token) => !nextSet.has(token));
  return {
    material: added.length > 0 || removed.length > 0,
    baselineMissing: false,
    added,
    removed,
  };
}

function formatSemanticDiffSummary(semanticDiff) {
  if (!semanticDiff || semanticDiff.baselineMissing) return "semantic-baseline-missing";
  const added = Array.isArray(semanticDiff.added) ? semanticDiff.added : [];
  const removed = Array.isArray(semanticDiff.removed) ? semanticDiff.removed : [];
  const parts = [];
  if (added.length > 0) parts.push(`+${added.join(",+")}`);
  if (removed.length > 0) parts.push(`-${removed.join(",-")}`);
  return parts.length > 0 ? parts.join(" | ") : "no-material-diff";
}

function buildSemanticDiffSignature(semanticDiff) {
  if (!semanticDiff || semanticDiff.baselineMissing || !semanticDiff.material) return "";
  const added = Array.isArray(semanticDiff.added) ? [...semanticDiff.added].sort((a, b) => a.localeCompare(b)) : [];
  const removed = Array.isArray(semanticDiff.removed) ? [...semanticDiff.removed].sort((a, b) => a.localeCompare(b)) : [];
  return `added:${added.join("|")}::removed:${removed.join("|")}`;
}

function getActualConfirmRuns() {
  if (!Number.isFinite(CHECKER_CONFIG.actualConfirmRuns)) return 2;
  return Math.max(2, CHECKER_CONFIG.actualConfirmRuns);
}

function getActualConfirmRunsForVendor(vendorConfig, vendor) {
  let required = getActualConfirmRuns();
  if (vendorConfig && typeof vendorConfig === "object") {
    const configured = Number.parseInt(vendorConfig.confirm_runs, 10);
    if (Number.isFinite(configured)) {
      required = Math.max(required, configured);
    }
  }
  if (typeof vendor === "string" && vendor) {
    const override = Number(ACTUAL_CONFIRM_RUN_OVERRIDES[vendor]);
    if (Number.isFinite(override)) {
      required = Math.max(required, Math.floor(override));
    }
  }
  return Math.max(2, required);
}

function getActualMinGapMs() {
  if (!Number.isFinite(CHECKER_CONFIG.actualMinGapHours)) return 4 * 60 * 60 * 1000;
  const hours = Math.max(0, CHECKER_CONFIG.actualMinGapHours);
  return Math.floor(hours * 60 * 60 * 1000);
}

function getActualMinGapHours() {
  const gapMs = getActualMinGapMs();
  return Math.floor(gapMs / (60 * 60 * 1000));
}

function getCandidateTtlDays() {
  if (!Number.isFinite(CHECKER_CONFIG.candidateTtlDays)) return 7;
  return Math.max(0, CHECKER_CONFIG.candidateTtlDays);
}

function getPendingDetailLimit() {
  if (!Number.isFinite(CHECKER_CONFIG.pendingDetailLimit)) return 20;
  return Math.max(1, CHECKER_CONFIG.pendingDetailLimit);
}

function getSameRunRecheckPasses() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckPasses)) return 2;
  return Math.max(0, CHECKER_CONFIG.sameRunRecheckPasses);
}

function getSameRunRecheckDelayMs() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckDelayMs)) return 1600;
  return Math.max(0, CHECKER_CONFIG.sameRunRecheckDelayMs);
}

function getSameRunRecheckBatchSize(defaultSize = 3) {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckBatchSize)) return defaultSize;
  return Math.max(1, CHECKER_CONFIG.sameRunRecheckBatchSize);
}

function getSameRunMajorityMinVotes() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunMajorityMinVotes)) return 2;
  return Math.max(2, CHECKER_CONFIG.sameRunMajorityMinVotes);
}

function getCrossRunWindowSize() {
  if (!Number.isFinite(CHECKER_CONFIG.crossRunWindowSize)) return 6;
  return Math.max(2, CHECKER_CONFIG.crossRunWindowSize);
}

function getCrossRunWindowRequired() {
  const windowSize = getCrossRunWindowSize();
  if (!Number.isFinite(CHECKER_CONFIG.crossRunWindowRequired)) {
    return Math.min(3, windowSize);
  }
  return Math.max(2, Math.min(windowSize, CHECKER_CONFIG.crossRunWindowRequired));
}

function getStalePendingDays() {
  if (!Number.isFinite(CHECKER_CONFIG.stalePendingDays)) return 3;
  return Math.max(1, CHECKER_CONFIG.stalePendingDays);
}

function getVolatileFlipThreshold() {
  if (!Number.isFinite(CHECKER_CONFIG.volatileFlipThreshold)) return 2;
  return Math.max(1, CHECKER_CONFIG.volatileFlipThreshold);
}

function getEscalationPendingDays() {
  if (!Number.isFinite(CHECKER_CONFIG.escalationPendingDays)) return 5;
  return Math.max(1, CHECKER_CONFIG.escalationPendingDays);
}

function getEscalationFlipThreshold() {
  if (!Number.isFinite(CHECKER_CONFIG.escalationFlipThreshold)) return 4;
  return Math.max(1, CHECKER_CONFIG.escalationFlipThreshold);
}

function getFetchFailureQuarantineStreak() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchFailureQuarantineStreak)) return 2;
  return Math.max(1, CHECKER_CONFIG.fetchFailureQuarantineStreak);
}

function getEscalationFlipThresholdForVendor(policyName, vendor) {
  const defaultThreshold = getEscalationFlipThreshold();
  if (typeof policyName !== "string" || typeof vendor !== "string") {
    return { threshold: defaultThreshold, overridden: false };
  }
  const policyOverrides = ESCALATION_FLIP_THRESHOLD_OVERRIDES[policyName];
  if (!policyOverrides || typeof policyOverrides !== "object") {
    return { threshold: defaultThreshold, overridden: false };
  }
  const overrideValue = Number(policyOverrides[vendor]);
  if (!Number.isFinite(overrideValue)) {
    return { threshold: defaultThreshold, overridden: false };
  }
  return {
    threshold: Math.max(1, Math.floor(overrideValue)),
    overridden: true,
  };
}

function getNoConfirmEscalationDays() {
  if (!Number.isFinite(CHECKER_CONFIG.noConfirmEscalationDays)) return 7;
  return Math.max(1, CHECKER_CONFIG.noConfirmEscalationDays);
}

function getMaterialCooldownDays() {
  if (!Number.isFinite(CHECKER_CONFIG.materialCooldownDays)) return 14;
  return Math.max(0, CHECKER_CONFIG.materialCooldownDays);
}

function getMaterialOscillationWindowDays() {
  if (!Number.isFinite(CHECKER_CONFIG.materialOscillationWindowDays)) return 21;
  return Math.max(0, CHECKER_CONFIG.materialOscillationWindowDays);
}

function getCandidatePendingSinceUtc(candidate) {
  if (!candidate || typeof candidate !== "object") return "";
  if (typeof candidate.pending_since_utc === "string" && candidate.pending_since_utc) {
    return candidate.pending_since_utc;
  }
  if (typeof candidate.first_seen_utc === "string" && candidate.first_seen_utc) {
    return candidate.first_seen_utc;
  }
  return "";
}

function getCandidateAgeDays(candidate, nowMs = Date.now()) {
  const pendingSinceUtc = getCandidatePendingSinceUtc(candidate);
  if (!pendingSinceUtc) return 0;
  const pendingSinceMs = Date.parse(pendingSinceUtc);
  if (!Number.isFinite(pendingSinceMs)) return 0;
  return Math.max(0, Math.floor((nowMs - pendingSinceMs) / (24 * 60 * 60 * 1000)));
}

function toMsOrNaN(isoValue) {
  if (typeof isoValue !== "string" || !isoValue) return Number.NaN;
  return Date.parse(isoValue);
}

function appendSignalWindow(coverageEntry, signal) {
  const existing = Array.isArray(coverageEntry?.signal_window)
    ? coverageEntry.signal_window.filter((value) => typeof value === "string" && value)
    : [];
  const next = [...existing, signal];
  const windowSize = getCrossRunWindowSize();
  const trimmed = next.slice(Math.max(0, next.length - windowSize));
  if (coverageEntry && typeof coverageEntry === "object") {
    coverageEntry.signal_window = trimmed;
  }
  return trimmed;
}

function evaluateSignalWindow(signalWindow) {
  const list = Array.isArray(signalWindow) ? signalWindow : [];
  const required = getCrossRunWindowRequired();
  let baselineVotes = 0;
  const hashVotes = {};
  for (const signal of list) {
    if (signal === BASELINE_SIGNAL) {
      baselineVotes += 1;
      continue;
    }
    hashVotes[signal] = Number(hashVotes[signal] || 0) + 1;
  }

  const sortedHashes = Object.entries(hashVotes).sort((a, b) => b[1] - a[1]);
  const [topHash, topVotesRaw] = sortedHashes[0] || ["", 0];
  const topVotes = Number(topVotesRaw || 0);
  const secondVotes = Number(sortedHashes[1]?.[1] || 0);
  const hashDecision = topHash && topVotes >= required && topVotes > secondVotes
    ? topHash
    : "";
  const baselineDecision = baselineVotes >= required && baselineVotes > topVotes;

  return {
    required,
    baselineVotes,
    hashDecision,
    topVotes,
  };
}

function getRunMajorityDecision(observations) {
  if (!observations || typeof observations !== "object") return null;
  const baselineVotes = Number(observations.baselineVotes || 0);
  const hashVotes = observations.hashVotes || {};
  const nonBaselineEntries = Object.entries(hashVotes);
  const nonBaselineVotes = nonBaselineEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const totalVotes = baselineVotes + nonBaselineVotes;
  if (totalVotes < 2) return null;

  let winnerHash = "";
  let winnerVotes = 0;
  let runnerUpVotes = 0;
  for (const [hashValue, countRaw] of nonBaselineEntries) {
    const count = Number(countRaw || 0);
    if (count > winnerVotes) {
      runnerUpVotes = winnerVotes;
      winnerVotes = count;
      winnerHash = hashValue;
    } else if (count > runnerUpVotes) {
      runnerUpVotes = count;
    }
  }

  const majorityThreshold = Math.floor(totalVotes / 2) + 1;
  const requiredVotes = Math.max(getSameRunMajorityMinVotes(), majorityThreshold);

  if (baselineVotes >= requiredVotes && baselineVotes > winnerVotes) {
    return { type: "baseline", requiredVotes, baselineVotes, totalVotes };
  }

  if (winnerHash && winnerVotes >= requiredVotes && winnerVotes > Math.max(baselineVotes, runnerUpVotes)) {
    return { type: "hash", hash: winnerHash, requiredVotes, winnerVotes, baselineVotes, totalVotes };
  }

  return null;
}

function sortedLimitedVendors(vendors, limit = getPendingDetailLimit()) {
  const sorted = [...vendors].sort((a, b) => a.localeCompare(b));
  return sorted.slice(0, Math.max(1, limit));
}

function isStaleCandidate(candidate, nowMs = Date.now()) {
  const ttlDays = getCandidateTtlDays();
  if (ttlDays <= 0) return false;

  const lastSeen = candidate?.last_seen_utc || candidate?.first_seen_utc;
  if (!lastSeen) return false;

  const seenMs = Date.parse(lastSeen);
  if (!Number.isFinite(seenMs)) return false;

  return nowMs - seenMs > ttlDays * 24 * 60 * 60 * 1000;
}

async function fetchText(url, attempts = 3) {
  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        lastErrorMessage = `HTTP ${res.status}`;
        throw new Error(lastErrorMessage);
      }
      const text = await res.text();
      if (!text || !text.trim()) {
        lastErrorMessage = "empty body";
        throw new Error(lastErrorMessage);
      }
      return text;
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { text: null, error: lastErrorMessage };
}

async function fetchBrowserHookText({ url, vendor, policyType }, attempts = 1) {
  if (!CHECKER_CONFIG.browserHookUrl) {
    return { text: null, error: "browser_hook_disabled", skipped: true };
  }
  const target = String(url || "").trim();
  if (!target) {
    return { text: null, error: "missing source URL" };
  }

  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
      };
      if (CHECKER_CONFIG.browserHookToken) {
        headers.Authorization = `Bearer ${CHECKER_CONFIG.browserHookToken}`;
        headers["x-hook-token"] = CHECKER_CONFIG.browserHookToken;
      }

      const response = await fetch(CHECKER_CONFIG.browserHookUrl, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          url: target,
          vendor: String(vendor || "").trim(),
          policy_type: String(policyType || "").trim(),
          timeout_ms: CHECKER_CONFIG.timeoutMs,
        }),
      });
      if (!response.ok) {
        lastErrorMessage = `HTTP ${response.status}`;
        throw new Error(lastErrorMessage);
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null);
        const textCandidate = typeof payload?.text === "string" ? payload.text : "";
        if (!textCandidate.trim()) {
          lastErrorMessage = "missing text in browser hook response";
          throw new Error(lastErrorMessage);
        }
        return {
          text: textCandidate,
          sourceUrl: String(payload?.source_url || payload?.final_url || target).trim() || target,
          sourceMetadata: {
            source_kind: "browser_hook",
            source_provider: String(payload?.provider || "browser_hook").trim(),
            source_status: String(payload?.status || "").trim(),
          },
        };
      }

      const text = await response.text();
      if (!text || !text.trim()) {
        lastErrorMessage = "empty body";
        throw new Error(lastErrorMessage);
      }
      return {
        text,
        sourceUrl: target,
        sourceMetadata: { source_kind: "browser_hook" },
      };
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { text: null, error: lastErrorMessage };
}

function toJinaMirrorUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function toZendeskHelpCenterApiTarget(url) {
  try {
    const parsed = new URL(url);
    const articleMatch = /^\/hc\/([^/]+)\/articles\/(\d+)(?:-[^/?#]+)?\/?$/i.exec(parsed.pathname);
    if (articleMatch) {
      const locale = String(articleMatch[1] || "").trim().toLowerCase();
      const articleId = String(articleMatch[2] || "").trim();
      if (!locale || !articleId) return null;
      return {
        kind: "article",
        apiUrl: `${parsed.origin}/api/v2/help_center/${locale}/articles/${articleId}.json`,
      };
    }

    const sectionMatch = /^\/hc\/([^/]+)\/sections\/(\d+)(?:-[^/?#]+)?\/?$/i.exec(parsed.pathname);
    if (sectionMatch) {
      const locale = String(sectionMatch[1] || "").trim().toLowerCase();
      const sectionId = String(sectionMatch[2] || "").trim();
      if (!locale || !sectionId) return null;
      return {
        kind: "section",
        apiUrl: `${parsed.origin}/api/v2/help_center/${locale}/sections/${sectionId}/articles.json?per_page=100`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchZendeskHelpCenterJson(apiTarget, attempts = 2) {
  if (!apiTarget?.apiUrl || !apiTarget?.kind) {
    return { text: null, error: "invalid zendesk target" };
  }

  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const response = await fetch(apiTarget.apiUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!response.ok) {
        lastErrorMessage = `HTTP ${response.status}`;
        throw new Error(lastErrorMessage);
      }
      const payload = await response.json().catch(() => null);
      if (apiTarget.kind === "article") {
        const article = payload && typeof payload === "object" ? payload.article : null;
        const body = typeof article?.body === "string" ? article.body : "";
        if (!body.trim()) {
          lastErrorMessage = "missing article body";
          throw new Error(lastErrorMessage);
        }
        const title = typeof article?.title === "string" ? article.title.trim() : "";
        const htmlUrl =
          typeof article?.html_url === "string" && article.html_url.trim()
            ? article.html_url.trim()
            : "";
        const composedText = title ? `<h1>${title}</h1>\n${body}` : body;
        return {
          text: composedText,
          sourceUrl: htmlUrl,
          sourceMetadata: {
            source_kind: "zendesk_article_json",
            source_title: title,
            source_updated_at_utc: typeof article?.updated_at === "string" ? article.updated_at.trim() : "",
            source_edited_at_utc: typeof article?.edited_at === "string" ? article.edited_at.trim() : "",
          },
        };
      }

      if (apiTarget.kind === "section") {
        const section = payload && typeof payload === "object" ? payload.section : null;
        const articles = Array.isArray(payload?.articles) ? payload.articles : [];
        const articleSegments = [];
        for (const article of articles) {
          const body = typeof article?.body === "string" ? article.body.trim() : "";
          if (!body) continue;
          const title = typeof article?.title === "string" ? article.title.trim() : "";
          articleSegments.push(title ? `<h2>${title}</h2>\n${body}` : body);
        }
        if (articleSegments.length === 0) {
          lastErrorMessage = "missing section article bodies";
          throw new Error(lastErrorMessage);
        }

        const sectionName = typeof section?.name === "string" ? section.name.trim() : "";
        const sectionHeader = sectionName ? `<h1>${sectionName}</h1>\n\n` : "";
        const sectionUrl =
          typeof section?.html_url === "string" && section.html_url.trim() ? section.html_url.trim() : "";
        return {
          text: `${sectionHeader}${articleSegments.join("\n\n")}`,
          sourceUrl: sectionUrl,
          sourceMetadata: {
            source_kind: "zendesk_section_json",
            source_title: sectionName,
            source_article_count: String(articles.length),
            source_article_with_body_count: String(articleSegments.length),
            source_updated_at_utc: typeof section?.updated_at === "string" ? section.updated_at.trim() : "",
          },
        };
      }

      lastErrorMessage = "unsupported zendesk target";
      throw new Error(lastErrorMessage);
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { text: null, error: lastErrorMessage };
}

function buildCandidateUrls(vendorConfig) {
  const candidateSet = new Set();
  const config = typeof vendorConfig === "string" ? { url: vendorConfig } : vendorConfig || {};

  if (typeof config.url === "string" && config.url.trim()) {
    candidateSet.add(config.url.trim());
  }

  const backupUrls = Array.isArray(config.backup_urls) ? config.backup_urls : [];
  for (const backupUrl of backupUrls) {
    if (typeof backupUrl === "string" && backupUrl.trim()) {
      candidateSet.add(backupUrl.trim());
    }
  }

  return [...candidateSet];
}

async function attemptFetchLane({ lane, candidateUrl, context }) {
  if (lane === "direct") {
    const directResult = await fetchText(candidateUrl, CHECKER_CONFIG.directAttempts);
    if (typeof directResult === "string") {
      const interstitialReason = detectFetchInterstitial(directResult);
      if (!interstitialReason) {
        return { ok: true, text: directResult, sourceUrl: candidateUrl };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: directResult.error || "request failed" };
  }

  if (lane === "zendesk_api") {
    const zendeskApiTarget = toZendeskHelpCenterApiTarget(candidateUrl);
    if (!zendeskApiTarget) {
      return { ok: false, skip: true };
    }
    const zendeskResult = await fetchZendeskHelpCenterJson(zendeskApiTarget, CHECKER_CONFIG.fallbackAttempts);
    if (zendeskResult?.text) {
      return {
        ok: true,
        text: zendeskResult.text,
        sourceUrl: zendeskResult.sourceUrl || candidateUrl,
        sourceMetadata: zendeskResult.sourceMetadata || {},
      };
    }
    return { ok: false, error: zendeskResult.error || "request failed" };
  }

  if (lane === "mirror") {
    const mirrorUrl = toJinaMirrorUrl(candidateUrl);
    if (!mirrorUrl) {
      return { ok: false, skip: true };
    }
    const mirrorResult = await fetchText(mirrorUrl, CHECKER_CONFIG.fallbackAttempts);
    if (typeof mirrorResult === "string") {
      const interstitialReason = detectFetchInterstitial(mirrorResult);
      if (!interstitialReason) {
        return { ok: true, text: mirrorResult, sourceUrl: candidateUrl };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: mirrorResult.error || "request failed" };
  }

  if (lane === "browser_hook") {
    const browserResult = await fetchBrowserHookText(
      {
        url: candidateUrl,
        vendor: context?.vendor || "",
        policyType: context?.policyType || "",
      },
      CHECKER_CONFIG.browserHookAttempts
    );
    if (browserResult?.skipped) {
      return { ok: false, skip: true };
    }
    if (browserResult?.text) {
      const interstitialReason = detectFetchInterstitial(browserResult.text);
      if (!interstitialReason) {
        return {
          ok: true,
          text: browserResult.text,
          sourceUrl: browserResult.sourceUrl || candidateUrl,
          sourceMetadata: browserResult.sourceMetadata || {},
        };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: browserResult?.error || "request failed" };
  }

  return { ok: false, skip: true };
}

async function fetchWithFallback(vendorConfig, context = {}) {
  const candidates = buildCandidateUrls(vendorConfig);
  if (candidates.length === 0) {
    return { text: null, error: "missing source URL" };
  }
  const lanes = getVendorFetchLanes(vendorConfig);
  if (lanes.length === 0) {
    return { text: null, error: "no fetch lanes configured", attemptedLanes: [] };
  }

  const failures = [];
  const attemptedLanes = [];
  const attemptedLaneSet = new Set();
  for (const candidateUrl of candidates) {
    for (const lane of lanes) {
      if (!attemptedLaneSet.has(lane)) {
        attemptedLaneSet.add(lane);
        attemptedLanes.push(lane);
      }
      const laneResult = await attemptFetchLane({ lane, candidateUrl, context });
      if (laneResult?.skip) {
        continue;
      }
      if (laneResult?.ok && typeof laneResult.text === "string" && laneResult.text.trim()) {
        return {
          text: laneResult.text,
          sourceUrl: laneResult.sourceUrl || candidateUrl,
          sourceMetadata: laneResult.sourceMetadata || {},
          fetchLane: lane,
          attemptedLanes,
        };
      }
      failures.push(`${candidateUrl} [${lane}] (${laneResult?.error || "request failed"})`);
    }
  }

  return {
    text: null,
    error: failures.length > 0 ? failures.join("; ") : "no applicable fetch lanes",
    attemptedLanes,
  };
}

async function checkPolicySet({ name, sourcesPath, hashesPath, candidatesPath, coveragePath, semanticPath, rulesFile }) {
  if (!existsSync(sourcesPath)) {
    console.log(`::warning::Sources file not found for ${name}: ${sourcesPath}`);
    return {
      name,
      observedChanged: [],
      materialChanged: [],
      materialRepeatSuppressed: [],
      materialVersionRepeatSuppressed: [],
      materialOscillationSuppressed: [],
      pending: [],
      errors: [],
      errorReasons: {},
      rulesFile,
      successfulChecks: 0,
      totalChecks: 0,
      staleDropped: [],
      rebaselineForProfile: false,
      stalePending: [],
      volatilePending: [],
      recheckConfirmed: [],
      recheckResolved: [],
      recheckFetchFailures: [],
      crossRunWindowConfirmed: [],
      crossRunWindowHeld: [],
      metadataStabilityHeld: [],
      noiseSuppressed: [],
      escalatedPending: [],
      escalatedReasons: {},
      escalationFlipOverrides: {},
      coverageGaps: [],
      qualityGateHeld: [],
      fetchBlockedPending: [],
      legacyPending: [],
    };
  }

  const sources = readJson(sourcesPath, { vendors: {} });
  const storedHashProfile =
    typeof sources.hash_profile === "string" && sources.hash_profile.trim()
      ? sources.hash_profile.trim()
      : "";
  const rebaselineForProfile = storedHashProfile !== HASH_PROFILE_ID;
  const storedHashes = readJson(hashesPath, {});
  const storedCandidates = readJson(candidatesPath, {});
  const storedCoverage = readJson(coveragePath, { vendors: {} });
  const storedSemanticState = readJson(semanticPath, { vendors: {} });
  const storedSemanticProfilesRaw =
    storedSemanticState && typeof storedSemanticState.vendors === "object" && storedSemanticState.vendors
      ? storedSemanticState.vendors
      : (storedSemanticState && typeof storedSemanticState === "object" ? storedSemanticState : {});
  const storedSemanticProfiles = {};
  for (const [vendorKey, profileValue] of Object.entries(storedSemanticProfilesRaw)) {
    storedSemanticProfiles[vendorKey] = normalizeSemanticProfile(profileValue);
  }
  const coverageVendors = storedCoverage && typeof storedCoverage.vendors === "object" && storedCoverage.vendors
    ? { ...storedCoverage.vendors }
    : {};
  const activeStoredCandidates = {};
  const staleDropped = [];

  if (rebaselineForProfile) {
    const fromProfile = storedHashProfile || "legacy";
    console.log(
      `::notice::${name}: hash_profile migration ${fromProfile} -> ${HASH_PROFILE_ID}; rebaselining hashes for this run.`
    );
  }

  const nowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(storedCandidates)) {
    if (isStaleCandidate(candidate, nowMs)) {
      staleDropped.push(vendor);
      continue;
    }
    activeStoredCandidates[vendor] = {
      ...candidate,
      pending_model_id: getCandidatePendingModelId(candidate),
      pending_model_first_observed_utc: getPendingModelFirstObservedUtc(candidate, candidate?.pending_since_utc || ""),
      change_key: getCandidateChangeKey(candidate),
      signal_window_change_decision: getCandidateSignalWindowDecision(candidate),
    };
  }

  const vendors = Object.entries(sources.vendors);
  const observedChanged = [];
  const materialChanged = [];
  const materialRepeatSuppressed = [];
  const materialVersionRepeatSuppressed = [];
  const materialOscillationSuppressed = [];
  const pendingSet = new Set();
  const pendingMetadata = {};
  const errors = [];
  const errorReasons = {};
  const newHashes = { ...storedHashes };
  const newCandidates = {};
  const newSemanticProfiles = { ...storedSemanticProfilesRaw };
  const runObservations = {};
  const recheckConfirmedSet = new Set();
  const recheckResolvedSet = new Set();
  const recheckFetchFailureSet = new Set();
  const crossRunWindowConfirmedSet = new Set();
  const crossRunWindowHeldSet = new Set();
  const metadataStabilityHeldSet = new Set();
  const qualityGateHeldSet = new Set();
  const noiseSuppressedSet = new Set();
  let successfulChecks = 0;

  const ensureCoverageEntry = (vendor) => {
    if (!coverageVendors[vendor] || typeof coverageVendors[vendor] !== "object") {
      coverageVendors[vendor] = {};
    }
    return coverageVendors[vendor];
  };

  const markSuccessfulFetch = (vendor, whenUtc, fetchLane = "") => {
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_successful_fetch_utc = whenUtc;
    if (fetchLane) {
      coverage.last_successful_fetch_lane = fetchLane;
    }
  };

  const markConfirmedChange = (vendor, whenUtc) => {
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_confirmed_change_utc = whenUtc;
  };

  const registerConfirmedChange = ({ vendor, sourceUrl, confirmedHash, confirmedProfile, confirmedAtUtc }) => {
    const normalizedProfile = normalizeSemanticProfile(confirmedProfile, {
      hash: confirmedHash,
      sourceUrl,
      extractedAtUtc: confirmedAtUtc,
    });
    const previousProfile = storedSemanticProfiles[vendor];
    const previousHash = typeof previousProfile?.hash === "string" ? previousProfile.hash : "";
    const semanticDiff = diffSemanticProfiles(previousProfile, normalizedProfile);
    const entry = {
      vendor,
      url: sourceUrl,
      confirmed_hash: confirmedHash || "",
      previous_hash: previousHash,
      confirmed_at_utc: confirmedAtUtc,
      semantic_diff: semanticDiff,
      semantic_diff_summary: formatSemanticDiffSummary(semanticDiff),
    };
    const coverage = ensureCoverageEntry(vendor);

    if (semanticDiff.material) {
      const previousEmittedHash =
        typeof coverage.last_material_emitted_hash === "string" ? coverage.last_material_emitted_hash : "";
      const suppressRepeatedHashVersion = Boolean(confirmedHash && previousEmittedHash && confirmedHash === previousEmittedHash);
      if (suppressRepeatedHashVersion) {
        materialVersionRepeatSuppressed.push({
          ...entry,
          suppressed_hash: confirmedHash,
          last_material_emitted_hash: previousEmittedHash,
          last_material_emitted_utc:
            typeof coverage.last_material_emitted_utc === "string" ? coverage.last_material_emitted_utc : "",
        });
        coverage.last_material_hash_repeat_suppressed_utc = confirmedAtUtc;
        coverage.last_material_hash_repeat_suppressed_hash = confirmedHash;
        newSemanticProfiles[vendor] = normalizedProfile;
        markConfirmedChange(vendor, confirmedAtUtc);
        return;
      }
    }

    observedChanged.push(entry);
    if (semanticDiff.material) {
      const diffSignature = buildSemanticDiffSignature(semanticDiff);
      const previousSignature =
        typeof coverage.last_material_signature === "string" ? coverage.last_material_signature : "";
      const previousEmittedUtc =
        typeof coverage.last_material_emitted_utc === "string" ? coverage.last_material_emitted_utc : "";
      const previousEmittedHash =
        typeof coverage.last_material_emitted_hash === "string" ? coverage.last_material_emitted_hash : "";
      const previousSignaturePrev =
        typeof coverage.last_material_signature_prev === "string" ? coverage.last_material_signature_prev : "";
      const previousEmittedPrevUtc =
        typeof coverage.last_material_emitted_prev_utc === "string" ? coverage.last_material_emitted_prev_utc : "";
      const previousEmittedHashPrev =
        typeof coverage.last_material_emitted_hash_prev === "string" ? coverage.last_material_emitted_hash_prev : "";
      const cooldownDays = getMaterialCooldownDays();
      const oscillationWindowDays = getMaterialOscillationWindowDays();
      const nowMs = toMsOrNaN(confirmedAtUtc);
      const previousMs = toMsOrNaN(previousEmittedUtc);
      const previousPrevMs = toMsOrNaN(previousEmittedPrevUtc);
      const suppressRepeatedSignature =
        cooldownDays > 0 &&
        diffSignature &&
        previousSignature &&
        diffSignature === previousSignature &&
        Number.isFinite(nowMs) &&
        Number.isFinite(previousMs) &&
        (nowMs - previousMs) < cooldownDays * 24 * 60 * 60 * 1000;
      const oscillationWindowMs = oscillationWindowDays * 24 * 60 * 60 * 1000;
      const hasOscillationWindowContext =
        oscillationWindowDays > 0 &&
        Number.isFinite(nowMs) &&
        Number.isFinite(previousMs) &&
        Number.isFinite(previousPrevMs) &&
        (nowMs - previousMs) < oscillationWindowMs &&
        (nowMs - previousPrevMs) < oscillationWindowMs;
      const suppressOscillationBySignature =
        hasOscillationWindowContext &&
        diffSignature &&
        previousSignature &&
        previousSignaturePrev &&
        diffSignature === previousSignaturePrev &&
        diffSignature !== previousSignature;
      const suppressOscillationByHash =
        hasOscillationWindowContext &&
        confirmedHash &&
        previousEmittedHash &&
        previousEmittedHashPrev &&
        confirmedHash === previousEmittedHashPrev &&
        confirmedHash !== previousEmittedHash;

      if (suppressRepeatedSignature) {
        materialRepeatSuppressed.push({
          ...entry,
          semantic_diff_signature: diffSignature,
          last_material_emitted_utc: previousEmittedUtc,
        });
        coverage.last_material_repeat_suppressed_utc = confirmedAtUtc;
        coverage.last_material_repeat_suppressed_signature = diffSignature;
      } else if (suppressOscillationBySignature || suppressOscillationByHash) {
        materialOscillationSuppressed.push({
          ...entry,
          semantic_diff_signature: diffSignature,
          oscillation_window_days: oscillationWindowDays,
          last_material_signature: previousSignature,
          previous_material_signature: previousSignaturePrev,
          last_material_emitted_utc: previousEmittedUtc,
          previous_material_emitted_utc: previousEmittedPrevUtc,
        });
        coverage.last_material_oscillation_suppressed_utc = confirmedAtUtc;
        coverage.last_material_oscillation_suppressed_signature = diffSignature;
      } else {
        materialChanged.push(entry);
        if (diffSignature) {
          if (previousSignature) {
            coverage.last_material_signature_prev = previousSignature;
            coverage.last_material_emitted_prev_utc = previousEmittedUtc || "";
            coverage.last_material_emitted_hash_prev = previousEmittedHash || "";
          } else {
            delete coverage.last_material_signature_prev;
            delete coverage.last_material_emitted_prev_utc;
            delete coverage.last_material_emitted_hash_prev;
          }
          coverage.last_material_signature = diffSignature;
          coverage.last_material_emitted_utc = confirmedAtUtc;
          coverage.last_material_emitted_hash = confirmedHash || previousEmittedHash || "";
        }
        delete coverage.last_material_repeat_suppressed_utc;
        delete coverage.last_material_repeat_suppressed_signature;
        delete coverage.last_material_oscillation_suppressed_utc;
        delete coverage.last_material_oscillation_suppressed_signature;
        delete coverage.last_material_hash_repeat_suppressed_utc;
        delete coverage.last_material_hash_repeat_suppressed_hash;
      }
    }
    newSemanticProfiles[vendor] = normalizedProfile;
    markConfirmedChange(vendor, confirmedAtUtc);
  };

  // Process in gentler batches to reduce bot-defense blocks and rate limits.
  const batchSize = Number.isFinite(CHECKER_CONFIG.batchSize) && CHECKER_CONFIG.batchSize > 0
    ? CHECKER_CONFIG.batchSize
    : 3;
  for (let i = 0; i < vendors.length; i += batchSize) {
    const batch = vendors.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ([vendor, vendorConfig]) => {
        const fetchResult = await fetchWithFallback(vendorConfig, { vendor, policyType: name });
        if (!fetchResult.text) {
          errors.push(vendor);
          const failureReason = fetchResult.error || "request failed";
          errorReasons[vendor] = failureReason;
          const coverage = ensureCoverageEntry(vendor);
          const failureAtUtc = utcIsoTimestamp();
          const priorFailureStreak = Number(
            activeStoredCandidates[vendor]?.fetch_failure_streak || coverage.consecutive_fetch_failures || 0
          );
          const nextFailureStreak = priorFailureStreak + 1;
          const fetchBlockClassification = classifyFetchFailureBlock(failureReason);
          const isFetchBlocked = fetchBlockClassification.immediateBlock || nextFailureStreak >= getFetchFailureQuarantineStreak();
          coverage.last_fetch_failure_utc = failureAtUtc;
          coverage.last_fetch_failure_reason = failureReason;
          if (Array.isArray(fetchResult.attemptedLanes) && fetchResult.attemptedLanes.length > 0) {
            coverage.last_fetch_failure_lanes = fetchResult.attemptedLanes.join(",");
          } else {
            delete coverage.last_fetch_failure_lanes;
          }
          coverage.consecutive_fetch_failures = nextFailureStreak;
          coverage.pending_fetch_blocked = isFetchBlocked;
          if (isFetchBlocked) {
            coverage.pending_fetch_blocked_reason =
              fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
          } else {
            delete coverage.pending_fetch_blocked_reason;
          }
          if (activeStoredCandidates[vendor]) {
            newCandidates[vendor] = {
              ...activeStoredCandidates[vendor],
              run_confirmations: 0,
              last_fetch_failure_utc: failureAtUtc,
              fetch_failure_streak: nextFailureStreak,
              fetch_blocked: isFetchBlocked,
              fetch_blocked_reason: isFetchBlocked
                ? (fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`)
                : "",
            };
          }
          return;
        }
        const normalized = normalizeFetchedText(fetchResult.text, name, vendor);
        const h = hash(normalized || fetchResult.text);
        successfulChecks += 1;
        const fetchedAtUtc = utcIsoTimestamp();
        markSuccessfulFetch(vendor, fetchedAtUtc, fetchResult.fetchLane || "");
        const coverage = ensureCoverageEntry(vendor);
        delete coverage.last_fetch_failure_utc;
        delete coverage.last_fetch_failure_reason;
        delete coverage.last_fetch_failure_lanes;
        coverage.consecutive_fetch_failures = 0;
        coverage.pending_fetch_blocked = false;
        delete coverage.pending_fetch_blocked_reason;
        const actualConfirmRuns = getActualConfirmRunsForVendor(vendorConfig, vendor);

        const sourceUrl =
          typeof vendorConfig?.url === "string" && vendorConfig.url
            ? vendorConfig.url
            : fetchResult.sourceUrl;
        const pageMetadata = extractPageMetadata({
          rawText: fetchResult.text,
          sourceMetadata: fetchResult.sourceMetadata,
        });
        if (pageMetadata.display_last_updated_label) {
          coverage.last_observed_last_updated_label = pageMetadata.display_last_updated_label;
        }
        if (pageMetadata.display_last_updated_date_utc) {
          coverage.last_observed_last_updated_date_utc = pageMetadata.display_last_updated_date_utc;
        }
        if (pageMetadata.source_updated_at_utc) {
          coverage.last_observed_source_updated_at_utc = pageMetadata.source_updated_at_utc;
        }
        const semanticProfile = buildSemanticProfile(normalized || fetchResult.text, name, {
          hash: h,
          sourceUrl: sourceUrl || "",
          extractedAtUtc: fetchedAtUtc,
          pageMetadata,
        });
        const semanticSignature = semanticTokenSignature(semanticProfile);
        const previousSemanticProfile = storedSemanticProfiles[vendor] || null;
        const semanticDiffAgainstPrevious = diffSemanticProfiles(previousSemanticProfile, semanticProfile);
        const metadataSignature = String(semanticProfile.metadata_signature || "");
        const previousMetadataSignature = String(previousSemanticProfile?.metadata_signature || "");
        const metadataSignalStable =
          semanticDiffAgainstPrevious.material &&
          metadataSignature &&
          previousMetadataSignature &&
          metadataSignature === previousMetadataSignature;
        const quality = assessFetchQuality({
          rawText: fetchResult.text,
          normalizedText: normalized,
          policyType: name,
        });
        if (!quality.passed) {
          qualityGateHeldSet.add(vendor);
          coverage.last_quality_gate_failure_utc = fetchedAtUtc;
          coverage.last_quality_gate_failure_reason = quality.reason;
        } else {
          delete coverage.last_quality_gate_failure_utc;
          delete coverage.last_quality_gate_failure_reason;
        }

        const priorCandidate = activeStoredCandidates[vendor];
        const previousHash = storedHashes[vendor];
        const priorSemanticSignature =
          typeof priorCandidate?.semantic_signature === "string" ? priorCandidate.semantic_signature : "";
        const currentChangeKey = buildChangeKey(h, semanticSignature);
        const signal = previousHash && previousHash === h ? BASELINE_SIGNAL : currentChangeKey;
        const signalWindow = appendSignalWindow(coverage, signal);
        const signalWindowDecision = evaluateSignalWindow(signalWindow);
        const signalWindowChangeDecision =
          typeof signalWindowDecision.hashDecision === "string"
            ? signalWindowDecision.hashDecision
            : "";

        if (isUpdate || rebaselineForProfile || !previousHash) {
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = semanticProfile;
          delete newCandidates[vendor];
          return;
        }

        if (previousHash === h) {
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = storedSemanticProfiles[vendor] || semanticProfile;
          delete newCandidates[vendor];
          return;
        }

        if (
          quality.passed &&
          !semanticDiffAgainstPrevious.baselineMissing &&
          !semanticDiffAgainstPrevious.material
        ) {
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = semanticProfile;
          delete newCandidates[vendor];
          noiseSuppressedSet.add(vendor);
          coverage.last_noise_suppressed_utc = fetchedAtUtc;
          coverage.last_noise_suppressed_reason = "non_material_repeat";
          coverage.last_noise_suppressed_hash = h;
          coverage.last_noise_suppressed_change_key = currentChangeKey;
          coverage.last_noise_suppressed_source_url = sourceUrl || "";
          return;
        }

        const priorCount = Number(priorCandidate?.count || 0);
        const priorFlipCount = Number(priorCandidate?.flip_count || 0);
        const priorHash = typeof priorCandidate?.hash === "string" ? priorCandidate.hash : "";
        const priorChangeKey = getCandidateChangeKey(priorCandidate, {
          hash: priorHash,
          semanticSignature: priorSemanticSignature,
        });
        const nextCount = priorHash === h ? Math.max(1, priorCount) + 1 : 1;
        const nextFlipCount =
          priorChangeKey && priorChangeKey !== currentChangeKey
            ? priorFlipCount + 1
            : priorFlipCount;
        const priorRunConfirmations = Number(priorCandidate?.run_confirmations || 0);
        const priorSemanticRunConfirmations = Number(priorCandidate?.semantic_run_confirmations || 0);
        const priorQualityPasses = Number(priorCandidate?.quality_gate_passes || 0);
        const priorQualityFailures = Number(priorCandidate?.quality_gate_failures || 0);
        const nextQualityPasses = (priorHash === h ? priorQualityPasses : 0) + (quality.passed ? 1 : 0);
        const nextQualityFailures = (priorHash === h ? priorQualityFailures : 0) + (quality.passed ? 0 : 1);
        const priorObservedMs = toMsOrNaN(priorCandidate?.last_run_observed_utc || "");
        const currentObservedMs = toMsOrNaN(fetchedAtUtc);
        const minGapMs = getActualMinGapMs();
        const gapSatisfied =
          minGapMs <= 0 ||
          (Number.isFinite(priorObservedMs) &&
            Number.isFinite(currentObservedMs) &&
            currentObservedMs - priorObservedMs >= minGapMs);
        let nextRunConfirmations = 1;
        if (priorHash === h && priorRunConfirmations > 0) {
          nextRunConfirmations = gapSatisfied ? priorRunConfirmations + 1 : priorRunConfirmations;
        }
        const semanticStableAcrossRuns =
          priorHash === h &&
          priorSemanticRunConfirmations > 0 &&
          semanticSignaturesStable(priorSemanticSignature, semanticSignature);
        let nextSemanticRunConfirmations = 1;
        if (semanticStableAcrossRuns) {
          nextSemanticRunConfirmations = gapSatisfied ? priorSemanticRunConfirmations + 1 : priorSemanticRunConfirmations;
        }
        if (!quality.passed) {
          nextRunConfirmations = priorHash === h ? priorRunConfirmations : 0;
          nextSemanticRunConfirmations = priorHash === h ? priorSemanticRunConfirmations : 0;
        }
        const hasSemanticEvidence = Boolean(priorSemanticSignature || semanticSignature);
        const semanticConfirmReady =
          !hasSemanticEvidence || nextSemanticRunConfirmations >= actualConfirmRuns;
        const metadataConfirmRunsRequired = metadataSignalStable
          ? actualConfirmRuns + 1
          : actualConfirmRuns;
        if (
          metadataSignalStable &&
          quality.passed &&
          nextRunConfirmations >= actualConfirmRuns &&
          nextRunConfirmations < metadataConfirmRunsRequired
        ) {
          metadataStabilityHeldSet.add(vendor);
          coverage.last_metadata_stability_hold_utc = fetchedAtUtc;
          coverage.last_metadata_stability_hold_reason =
            "semantic_changed_without_metadata_signature_change";
        } else {
          delete coverage.last_metadata_stability_hold_utc;
          delete coverage.last_metadata_stability_hold_reason;
        }
        const signalWindowConfirmed =
          Boolean(signalWindowChangeDecision) &&
          signalWindowChangeDecision === currentChangeKey;

        if (
          quality.passed &&
          nextRunConfirmations >= metadataConfirmRunsRequired &&
          semanticConfirmReady &&
          signalWindowConfirmed
        ) {
          registerConfirmedChange({
            vendor,
            sourceUrl: sourceUrl || "",
            confirmedHash: h,
            confirmedProfile: semanticProfile,
            confirmedAtUtc: fetchedAtUtc,
          });
          newHashes[vendor] = h;
          crossRunWindowConfirmedSet.add(vendor);
          return;
        }

        if (
          !quality.passed ||
          (!gapSatisfied && priorHash === h && priorRunConfirmations > 0) ||
          (metadataSignalStable && nextRunConfirmations < metadataConfirmRunsRequired) ||
          (nextRunConfirmations >= actualConfirmRuns && !signalWindowConfirmed) ||
          (nextRunConfirmations >= actualConfirmRuns && !semanticConfirmReady)
        ) {
          crossRunWindowHeldSet.add(vendor);
        }

        newHashes[vendor] = previousHash;
        pendingSet.add(vendor);
        newCandidates[vendor] = markCandidatePendingModel({
          hash: h,
          count: nextCount,
          flip_count: nextFlipCount,
          fetch_failure_streak: 0,
          fetch_blocked: false,
          run_confirmations: nextRunConfirmations,
          semantic_run_confirmations: nextSemanticRunConfirmations,
          semantic_signature: semanticSignature,
          change_key: currentChangeKey,
          signal_window_hash_decision: signalWindowChangeDecision || "",
          signal_window_change_decision: signalWindowChangeDecision || "",
          signal_window_required_votes: Number(signalWindowDecision.required || 0),
          signal_window_top_hash_votes: Number(signalWindowDecision.topVotes || 0),
          signal_window_baseline_votes: Number(signalWindowDecision.baselineVotes || 0),
          actual_confirm_runs_required: actualConfirmRuns,
          metadata_confirm_runs_required: metadataConfirmRunsRequired,
          metadata_signature: metadataSignature,
          previous_metadata_signature: previousMetadataSignature,
          metadata_signal_stable: Boolean(metadataSignalStable),
          last_run_observed_utc: fetchedAtUtc,
          source_url: sourceUrl || "",
          pending_since_utc: getCandidatePendingSinceUtc(priorCandidate) || fetchedAtUtc,
          first_seen_utc: priorHash === h && priorCandidate.first_seen_utc
            ? priorCandidate.first_seen_utc
            : fetchedAtUtc,
          last_seen_utc: fetchedAtUtc,
          baseline_observations: 0,
          profile: semanticProfile,
          quality_gate_passes: nextQualityPasses,
          quality_gate_failures: nextQualityFailures,
          quality_gate_last_reason: quality.passed ? "" : quality.reason,
          quality_gate_last_observed_utc: fetchedAtUtc,
          quality_gate_policy_hits: quality.policyKeywordHits,
          quality_gate_lines: quality.lineCount,
          quality_gate_chars: quality.normalizedLength,
        }, fetchedAtUtc);
        pendingMetadata[vendor] = {
          vendorConfig,
          previousHash,
          sourceUrl: sourceUrl || priorCandidate?.source_url || "",
        };
        runObservations[vendor] = {
          baselineVotes: 0,
          hashVotes: { [h]: 1 },
          hashProfiles: { [h]: semanticProfile },
        };
      })
    );
    if (i + batchSize < vendors.length) {
      await sleep(250 + jitter(350));
    }
  }

  const sameRunRecheckPasses = getSameRunRecheckPasses();
  const sameRunRecheckDelayMs = getSameRunRecheckDelayMs();
  const sameRunRecheckBatchSize = getSameRunRecheckBatchSize(batchSize);
  for (let pass = 0; pass < sameRunRecheckPasses && pendingSet.size > 0; pass += 1) {
    if (sameRunRecheckDelayMs > 0) {
      await sleep(sameRunRecheckDelayMs + jitter(Math.min(400, sameRunRecheckDelayMs)));
    }

    const vendorsToRecheck = [...pendingSet];
    for (let i = 0; i < vendorsToRecheck.length; i += sameRunRecheckBatchSize) {
      const batch = vendorsToRecheck.slice(i, i + sameRunRecheckBatchSize);
      await Promise.all(
        batch.map(async (vendor) => {
          const metadata = pendingMetadata[vendor];
          const candidate = newCandidates[vendor];
          if (!metadata || !candidate) return;
          if (!runObservations[vendor]) {
            runObservations[vendor] = {
              baselineVotes: 0,
              hashVotes: { [candidate.hash]: 1 },
              hashProfiles: candidate.hash && candidate.profile
                ? { [candidate.hash]: candidate.profile }
                : {},
            };
          }

          const recheckResult = await fetchWithFallback(metadata.vendorConfig, { vendor, policyType: name });
          if (!recheckResult.text) {
            recheckFetchFailureSet.add(vendor);
            const coverage = ensureCoverageEntry(vendor);
            const failureReason = recheckResult.error || "request failed";
            const priorFailureStreak = Number(candidate.fetch_failure_streak || coverage.consecutive_fetch_failures || 0);
            const nextFailureStreak = priorFailureStreak + 1;
            const fetchBlockClassification = classifyFetchFailureBlock(failureReason);
            const isFetchBlocked = fetchBlockClassification.immediateBlock || nextFailureStreak >= getFetchFailureQuarantineStreak();
            coverage.last_fetch_failure_utc = utcIsoTimestamp();
            coverage.last_fetch_failure_reason = failureReason;
            if (Array.isArray(recheckResult.attemptedLanes) && recheckResult.attemptedLanes.length > 0) {
              coverage.last_fetch_failure_lanes = recheckResult.attemptedLanes.join(",");
            } else {
              delete coverage.last_fetch_failure_lanes;
            }
            coverage.consecutive_fetch_failures = nextFailureStreak;
            coverage.pending_fetch_blocked = isFetchBlocked;
            if (isFetchBlocked) {
              coverage.pending_fetch_blocked_reason =
                fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
            } else {
              delete coverage.pending_fetch_blocked_reason;
            }
            candidate.fetch_failure_streak = nextFailureStreak;
            candidate.fetch_blocked = isFetchBlocked;
            candidate.fetch_blocked_reason = isFetchBlocked
              ? (fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`)
              : "";
            return;
          }

          const fetchedAtUtc = utcIsoTimestamp();
          markSuccessfulFetch(vendor, fetchedAtUtc, recheckResult.fetchLane || "");
          const coverage = ensureCoverageEntry(vendor);
          delete coverage.last_fetch_failure_utc;
          delete coverage.last_fetch_failure_reason;
          delete coverage.last_fetch_failure_lanes;
          coverage.consecutive_fetch_failures = 0;
          coverage.pending_fetch_blocked = false;
          delete coverage.pending_fetch_blocked_reason;
          candidate.fetch_failure_streak = 0;
          candidate.fetch_blocked = false;
          delete candidate.fetch_blocked_reason;

          const normalized = normalizeFetchedText(recheckResult.text, name, vendor);
          const h = hash(normalized || recheckResult.text);
          const sourceUrl = recheckResult.sourceUrl || metadata.sourceUrl || "";
          const pageMetadata = extractPageMetadata({
            rawText: recheckResult.text,
            sourceMetadata: recheckResult.sourceMetadata,
          });
          if (pageMetadata.display_last_updated_label) {
            coverage.last_observed_last_updated_label = pageMetadata.display_last_updated_label;
          }
          if (pageMetadata.display_last_updated_date_utc) {
            coverage.last_observed_last_updated_date_utc = pageMetadata.display_last_updated_date_utc;
          }
          if (pageMetadata.source_updated_at_utc) {
            coverage.last_observed_source_updated_at_utc = pageMetadata.source_updated_at_utc;
          }
          const semanticProfile = buildSemanticProfile(normalized || recheckResult.text, name, {
            hash: h,
            sourceUrl,
            extractedAtUtc: fetchedAtUtc,
            pageMetadata,
          });
          const semanticSignature = semanticTokenSignature(semanticProfile);
          const currentChangeKey = buildChangeKey(h, semanticSignature);
          const metadataSignature = String(semanticProfile.metadata_signature || "");
          const quality = assessFetchQuality({
            rawText: recheckResult.text,
            normalizedText: normalized,
            policyType: name,
          });
          if (!quality.passed) {
            qualityGateHeldSet.add(vendor);
            coverage.last_quality_gate_failure_utc = fetchedAtUtc;
            coverage.last_quality_gate_failure_reason = quality.reason;
            candidate.quality_gate_failures = Number(candidate.quality_gate_failures || 0) + 1;
            candidate.quality_gate_last_reason = quality.reason;
            candidate.quality_gate_last_observed_utc = fetchedAtUtc;
            candidate.quality_gate_policy_hits = quality.policyKeywordHits;
            candidate.quality_gate_lines = quality.lineCount;
            candidate.quality_gate_chars = quality.normalizedLength;
            candidate.metadata_signature = metadataSignature;
            newCandidates[vendor] = candidate;
            return;
          }
          delete coverage.last_quality_gate_failure_utc;
          delete coverage.last_quality_gate_failure_reason;
          candidate.quality_gate_passes = Number(candidate.quality_gate_passes || 0) + 1;
          candidate.quality_gate_last_reason = "";
          candidate.quality_gate_last_observed_utc = fetchedAtUtc;
          candidate.quality_gate_policy_hits = quality.policyKeywordHits;
          candidate.quality_gate_lines = quality.lineCount;
          candidate.quality_gate_chars = quality.normalizedLength;
          candidate.metadata_signature = metadataSignature;
          const observations = runObservations[vendor];
          if (h === metadata.previousHash) {
            observations.baselineVotes = Number(observations.baselineVotes || 0) + 1;
          } else {
            observations.hashVotes[h] = Number(observations.hashVotes[h] || 0) + 1;
            if (!observations.hashProfiles || typeof observations.hashProfiles !== "object") {
              observations.hashProfiles = {};
            }
            observations.hashProfiles[h] = semanticProfile;
          }

          const majorityDecision = getRunMajorityDecision(observations);
          if (majorityDecision?.type === "baseline") {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }
          if (majorityDecision?.type === "hash" && majorityDecision.hash) {
            const previousCandidateHash = candidate.hash;
            const previousCandidateChangeKey = getCandidateChangeKey(candidate, {
              hash: previousCandidateHash,
              semanticSignature: typeof candidate.semantic_signature === "string" ? candidate.semantic_signature : "",
            });
            candidate.hash = majorityDecision.hash;
            candidate.profile =
              observations.hashProfiles?.[majorityDecision.hash] || candidate.profile || semanticProfile;
            const majoritySemanticSignature = semanticTokenSignature(candidate.profile);
            const majorityChangeKey = buildChangeKey(candidate.hash, majoritySemanticSignature);
            candidate.count = Math.max(Number(candidate.count || 1), Number(majorityDecision.winnerVotes || 1));
            candidate.last_seen_utc = fetchedAtUtc;
            if (sourceUrl) candidate.source_url = sourceUrl;
            candidate.run_confirmations = previousCandidateHash === majorityDecision.hash
              ? Number(candidate.run_confirmations || 1)
              : 1;
            candidate.semantic_signature = majoritySemanticSignature;
            candidate.semantic_run_confirmations = previousCandidateHash === majorityDecision.hash
              ? Number(candidate.semantic_run_confirmations || 1)
              : 1;
            if (
              previousCandidateHash !== majorityDecision.hash &&
              previousCandidateChangeKey &&
              previousCandidateChangeKey !== majorityChangeKey
            ) {
              candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            }
            candidate.change_key = majorityChangeKey;
            candidate.metadata_signature = String(candidate.profile?.metadata_signature || candidate.metadata_signature || "");
            newCandidates[vendor] = candidate;
            return;
          }

          if (h === metadata.previousHash) {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }

          const previousCandidateChangeKey = getCandidateChangeKey(candidate, {
            hash: typeof candidate.hash === "string" ? candidate.hash : "",
            semanticSignature: typeof candidate.semantic_signature === "string" ? candidate.semantic_signature : "",
          });
          if (candidate.hash === h) {
            candidate.count = Number(candidate.count || 1) + 1;
            candidate.semantic_signature = semanticSignature;
            candidate.change_key = currentChangeKey;
            candidate.metadata_signature = metadataSignature;
          } else {
            candidate.hash = h;
            candidate.count = 1;
            if (previousCandidateChangeKey && previousCandidateChangeKey !== currentChangeKey) {
              candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            }
            candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
            candidate.first_seen_utc = utcIsoTimestamp();
            candidate.profile = semanticProfile;
            candidate.semantic_signature = semanticSignature;
            candidate.change_key = currentChangeKey;
            candidate.semantic_run_confirmations = 1;
            candidate.metadata_signature = metadataSignature;
          }
          candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
          candidate.profile = candidate.hash === h ? semanticProfile : candidate.profile;
          candidate.semantic_signature = candidate.hash === h ? semanticSignature : candidate.semantic_signature;
          candidate.change_key = buildChangeKey(candidate.hash, candidate.semantic_signature);
          candidate.metadata_signature = candidate.hash === h ? metadataSignature : candidate.metadata_signature;
          if (sourceUrl) candidate.source_url = sourceUrl;
          candidate.last_seen_utc = fetchedAtUtc;
          candidate.run_confirmations = Number(candidate.run_confirmations || 1);
          candidate.semantic_run_confirmations = Number(candidate.semantic_run_confirmations || 1);
          candidate.fetch_failure_streak = 0;
          candidate.fetch_blocked = false;

          newCandidates[vendor] = candidate;
        })
      );
      if (i + sameRunRecheckBatchSize < vendorsToRecheck.length) {
        await sleep(180 + jitter(220));
      }
    }
  }

  const pending = [...pendingSet].sort((a, b) => a.localeCompare(b));
  const stalePending = [];
  const volatilePending = [];
  const escalatedPending = [];
  const escalatedReasons = {};
  const escalationFlipOverrides = {};
  const coverageGaps = [];
  const fetchBlockedPending = [];
  const legacyPending = [];
  const fetchBlockedSet = new Set();
  const summaryNowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(newCandidates)) {
    const coverage = ensureCoverageEntry(vendor);
    const pendingModelId = getCandidatePendingModelId(candidate);
    const legacyPendingCandidate = isLegacyPendingCandidate(candidate);
    const ageDays = getCandidateAgeDays(candidate, summaryNowMs);
    const flipCount = Number(candidate?.flip_count || 0);
    const candidateChangeKey = getCandidateChangeKey(candidate);
    const fetchFailureStreak = Number(
      candidate?.fetch_failure_streak || coverage.consecutive_fetch_failures || 0
    );
    const fetchBlockClassification = classifyFetchFailureBlock(coverage.last_fetch_failure_reason);
    const isFetchBlocked = Boolean(candidate?.fetch_blocked) ||
      fetchBlockClassification.immediateBlock ||
      fetchFailureStreak >= getFetchFailureQuarantineStreak();
    coverage.pending_model_id = pendingModelId;
    coverage.pending_model_first_observed_utc = getPendingModelFirstObservedUtc(candidate, coverage.pending_model_first_observed_utc || "");
    const escalationFlipConfig = getEscalationFlipThresholdForVendor(name, vendor);
    if (escalationFlipConfig.overridden) {
      escalationFlipOverrides[vendor] = {
        threshold: escalationFlipConfig.threshold,
        flipCount,
      };
    }
    coverage.last_pending_seen_utc = utcIsoTimestamp();
    coverage.last_pending_age_days = ageDays;
    coverage.last_pending_flip_count = flipCount;
    coverage.last_pending_source_url = candidate?.source_url || coverage.last_pending_source_url || "";
    coverage.last_pending_change_key = candidateChangeKey || coverage.last_pending_change_key || "";
    coverage.pending_fetch_failure_streak = fetchFailureStreak;
    if (legacyPendingCandidate) {
      coverage.pending_legacy = true;
      coverage.pending_fetch_blocked = false;
      delete coverage.pending_fetch_blocked_reason;
      coverage.last_pending_bucket = "legacy_pending";
      legacyPending.push(vendor);
      continue;
    }
    coverage.pending_legacy = false;
    if (isFetchBlocked) {
      fetchBlockedPending.push(vendor);
      fetchBlockedSet.add(vendor);
      coverage.pending_fetch_blocked = true;
      coverage.last_pending_bucket = "fetch_blocked_pending";
      coverage.pending_fetch_blocked_reason =
        candidate?.fetch_blocked_reason ||
        fetchBlockClassification.reason ||
        `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
      continue;
    }
    coverage.pending_fetch_blocked = false;
    delete coverage.pending_fetch_blocked_reason;
    coverage.last_pending_bucket = "active_pending";

    if (ageDays >= getStalePendingDays()) {
      stalePending.push(vendor);
    }
    if (flipCount >= getVolatileFlipThreshold()) {
      volatilePending.push(vendor);
    }

    const ageEscalationThreshold = getEscalationPendingDays();
    const hasEscalationAge = ageDays >= ageEscalationThreshold;
    const hasEscalationFlip = flipCount >= escalationFlipConfig.threshold;
    const signalWindowDecision = getCandidateSignalWindowDecision(candidate);
    const hasEscalationSignalSupport =
      Boolean(signalWindowDecision) &&
      Boolean(candidateChangeKey) &&
      signalWindowDecision === candidateChangeKey;
    const escalationReasons = [];
    if (hasEscalationAge) {
      escalationReasons.push(`pending_age_days>=${ageEscalationThreshold}`);
    }
    if (hasEscalationFlip) {
      escalationReasons.push(
        escalationFlipConfig.overridden
          ? `flip_count>=${escalationFlipConfig.threshold}(override)`
          : `flip_count>=${escalationFlipConfig.threshold}`
      );
    }
    if (hasEscalationSignalSupport) {
      escalationReasons.push("cross_run_signal_confirmed");
    }
    if (hasEscalationAge && hasEscalationFlip && hasEscalationSignalSupport) {
      escalatedPending.push(vendor);
      escalatedReasons[vendor] = escalationReasons.join("&");
      coverage.last_escalated_utc = utcIsoTimestamp();
    }

    const pendingSinceMs = toMsOrNaN(getCandidatePendingSinceUtc(candidate));
    const lastConfirmedMs = toMsOrNaN(coverage?.last_confirmed_change_utc);
    const lastEscalatedMs = toMsOrNaN(coverage?.last_escalated_utc);
    const resolutionMs = [lastConfirmedMs, lastEscalatedMs].filter((value) => Number.isFinite(value));
    const latestResolutionMs = resolutionMs.length > 0 ? Math.max(...resolutionMs) : Number.NaN;
    if (
      ageDays >= getNoConfirmEscalationDays() &&
      Number.isFinite(pendingSinceMs) &&
      (!Number.isFinite(latestResolutionMs) || latestResolutionMs < pendingSinceMs)
    ) {
      coverageGaps.push(vendor);
    }
  }
  fetchBlockedPending.sort((a, b) => a.localeCompare(b));
  legacyPending.sort((a, b) => a.localeCompare(b));
  const actionablePending = pending.filter((vendor) => !fetchBlockedSet.has(vendor));
  stalePending.sort((a, b) => a.localeCompare(b));
  volatilePending.sort((a, b) => a.localeCompare(b));
  escalatedPending.sort((a, b) => a.localeCompare(b));
  coverageGaps.sort((a, b) => a.localeCompare(b));

  const verifiedAtUtc = utcIsoTimestamp();
  if (vendors.length > 0 && successfulChecks === 0) {
    console.log(`::warning::No successful checks for ${name}; preserving existing last_verified_utc.`);
  } else if (successfulChecks > 0) {
    sources.last_verified_utc = verifiedAtUtc;
    sources.hash_profile = HASH_PROFILE_ID;
    const updatedLastVerified = updateJsonStringField(sourcesPath, "last_verified_utc", verifiedAtUtc);
    const updatedHashProfile = updateJsonStringField(sourcesPath, "hash_profile", HASH_PROFILE_ID);
    if (!updatedLastVerified || !updatedHashProfile) {
      writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
    }
  }

  const retainedPendingVendors = new Set(Object.keys(newCandidates));
  for (const [vendor] of vendors) {
    if (retainedPendingVendors.has(vendor)) continue;
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_pending_age_days = 0;
    coverage.last_pending_flip_count = 0;
    coverage.pending_fetch_blocked = false;
    coverage.pending_fetch_failure_streak = 0;
    delete coverage.pending_legacy;
    delete coverage.pending_fetch_blocked_reason;
    delete coverage.last_pending_source_url;
    delete coverage.last_pending_change_key;
    delete coverage.last_pending_bucket;
    delete coverage.pending_model_id;
    delete coverage.pending_model_first_observed_utc;
  }

  // Write updated hashes and state artifacts.
  writeFileSync(hashesPath, JSON.stringify(newHashes, null, 2) + "\n");
  writeFileSync(candidatesPath, JSON.stringify(newCandidates, null, 2) + "\n");
  writeFileSync(
    semanticPath,
    JSON.stringify(
      {
        updated_utc: verifiedAtUtc,
        policy: name,
        hash_profile: HASH_PROFILE_ID,
        vendors: newSemanticProfiles,
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(
    coveragePath,
    JSON.stringify(
      {
        updated_utc: verifiedAtUtc,
        policy: name,
        vendors: coverageVendors,
      },
      null,
      2
    ) + "\n"
  );

  return {
    name,
    vendorKeys: vendors.map(([vendor]) => vendor).sort((a, b) => a.localeCompare(b)),
    observedChanged,
    materialChanged,
    materialRepeatSuppressed,
    materialVersionRepeatSuppressed,
    materialOscillationSuppressed,
    pending: actionablePending,
    fetchBlockedPending,
    errors,
    errorReasons,
    rulesFile,
    successfulChecks,
    totalChecks: vendors.length,
    staleDropped,
    rebaselineForProfile,
    stalePending,
    volatilePending,
    recheckConfirmed: [...recheckConfirmedSet].sort((a, b) => a.localeCompare(b)),
    recheckResolved: [...recheckResolvedSet].sort((a, b) => a.localeCompare(b)),
    recheckFetchFailures: [...recheckFetchFailureSet].sort((a, b) => a.localeCompare(b)),
    crossRunWindowConfirmed: [...crossRunWindowConfirmedSet].sort((a, b) => a.localeCompare(b)),
    crossRunWindowHeld: [...crossRunWindowHeldSet].sort((a, b) => a.localeCompare(b)),
    metadataStabilityHeld: [...metadataStabilityHeldSet].sort((a, b) => a.localeCompare(b)),
    noiseSuppressed: [...noiseSuppressedSet].sort((a, b) => a.localeCompare(b)),
    escalatedPending,
    escalatedReasons,
    escalationFlipOverrides,
    coverageGaps,
    qualityGateHeld: [...qualityGateHeldSet].sort((a, b) => a.localeCompare(b)),
    legacyPending,
  };
}

async function main() {
  const tier1Config = loadTier1VendorsConfig();
  const allObservedChanged = [];
  const allMaterialChanged = [];
  const allMaterialRepeatSuppressed = [];
  const allMaterialVersionRepeatSuppressed = [];
  const allMaterialOscillationSuppressed = [];
  const allQualityGateHeld = [];
  const allMetadataStabilityHeld = [];
  const allNoiseSuppressed = [];
  const allErrors = [];
  const allPending = [];
  const allFetchBlockedPending = [];
  const allLegacyPending = [];
  const allStalePending = [];
  const allVolatilePending = [];
  const allEscalatedPending = [];
  const allCoverageGaps = [];
  const allTier1Failed = [];
  const allTier1MissingConfigured = [];
  const pendingDetailByPolicy = {};
  const escalationDetailByPolicy = {};
  const tier1ByPolicy = {};

  for (const policySet of POLICY_SETS) {
    const result = await checkPolicySet(policySet);
    const tier1Target = getTier1TargetForPolicy(result.name, result.vendorKeys || [], tier1Config);
    const errorSet = new Set(result.errors || []);
    const tier1FailedVendors = tier1Target.target.filter((vendor) => errorSet.has(vendor));
    const tier1FetchedVendors = tier1Target.target.filter((vendor) => !errorSet.has(vendor));
    tier1ByPolicy[result.name] = {
      total: tier1Target.target.length,
      fetched: tier1FetchedVendors.length,
      failed: tier1FailedVendors.length,
    };
    for (const vendor of tier1FailedVendors) {
      allTier1Failed.push({ policyType: result.name, vendor });
    }
    for (const vendor of tier1Target.missingConfigured) {
      allTier1MissingConfigured.push({ policyType: result.name, vendor });
    }
    if (tier1FailedVendors.length > 0) {
      console.log(
        `::notice::${result.name}: tier1_failed=${tier1FailedVendors.length}; vendors: ${tier1FailedVendors.join(", ")}`
      );
    }

    if (result.errors.length > 0) {
      console.log(`::warning::Could not fetch ${result.errors.length} ${result.name} vendor(s): ${result.errors.join(", ")}`);
      const detailLimit = Number.isFinite(CHECKER_CONFIG.errorDetailLimit) && CHECKER_CONFIG.errorDetailLimit > 0
        ? CHECKER_CONFIG.errorDetailLimit
        : 12;
      for (const vendor of result.errors.slice(0, detailLimit)) {
        if (result.errorReasons[vendor]) {
          console.log(`::notice::${result.name}:${vendor} -> ${result.errorReasons[vendor]}`);
        }
      }
      if (result.errors.length > detailLimit) {
        console.log(
          `::notice::${result.name}: ${result.errors.length - detailLimit} additional vendor fetch failures omitted from detailed output.`
        );
      }
      allErrors.push(...result.errors.map((vendor) => ({ policyType: result.name, vendor })));
    }
    if (result.pending.length > 0) {
      console.log(
        `::notice::${result.name}: ${result.pending.length} candidate change(s) observed; waiting for confirmation in next run.`
      );
      const pendingNames = sortedLimitedVendors(result.pending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: pending vendors (first ${pendingNames.length}): ${pendingNames.join(", ")}`
      );
    }
    if (result.legacyPending.length > 0) {
      const legacyNames = sortedLimitedVendors(result.legacyPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: legacy_pending=${result.legacyPending.length} (predates ${PENDING_MODEL_ID}; excluded from primary pending metrics until reobserved); first ${legacyNames.length}: ${legacyNames.join(", ")}`
      );
    }
    if (result.fetchBlockedPending.length > 0) {
      const blockedNames = sortedLimitedVendors(result.fetchBlockedPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: fetch_blocked_pending=${result.fetchBlockedPending.length} (consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}); first ${blockedNames.length}: ${blockedNames.join(", ")}`
      );
    }
    if (result.recheckConfirmed.length > 0 || result.recheckResolved.length > 0 || result.recheckFetchFailures.length > 0) {
      console.log(
        `::notice::${result.name}: same_run_recheck confirmed=${result.recheckConfirmed.length}, resolved=${result.recheckResolved.length}, fetch_failures=${result.recheckFetchFailures.length}.`
      );
    }
    if (result.recheckConfirmed.length > 0) {
      const confirmedNames = sortedLimitedVendors(result.recheckConfirmed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_confirmed vendors (first ${confirmedNames.length}): ${confirmedNames.join(", ")}`
      );
    }
    if (result.recheckResolved.length > 0) {
      const resolvedNames = sortedLimitedVendors(result.recheckResolved, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_resolved_to_baseline vendors (first ${resolvedNames.length}): ${resolvedNames.join(", ")}`
      );
    }
    if (result.recheckFetchFailures.length > 0) {
      const failureNames = sortedLimitedVendors(result.recheckFetchFailures, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_fetch_failures vendors (first ${failureNames.length}): ${failureNames.join(", ")}`
      );
    }
    if (result.crossRunWindowConfirmed.length > 0) {
      const names = sortedLimitedVendors(result.crossRunWindowConfirmed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stable_change_confirmed=${result.crossRunWindowConfirmed.length} (required_runs>=${getActualConfirmRuns()}, min_gap_hours>=${getActualMinGapHours()}, window_required>=${getCrossRunWindowRequired()}); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.crossRunWindowHeld.length > 0) {
      const names = sortedLimitedVendors(result.crossRunWindowHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stability_held_pending=${result.crossRunWindowHeld.length} (gap/window/semantic stability checks not yet met); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.metadataStabilityHeld.length > 0) {
      const names = sortedLimitedVendors(result.metadataStabilityHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: metadata_stability_held=${result.metadataStabilityHeld.length} (semantic changed while metadata signature stayed stable; extra confirm run required); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.noiseSuppressed.length > 0) {
      const names = sortedLimitedVendors(result.noiseSuppressed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: noise_suppressed=${result.noiseSuppressed.length} (hash changed but semantic meaning stayed stable); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.staleDropped.length > 0) {
      console.log(
        `::notice::${result.name}: stale_pending_dropped=${result.staleDropped.length} (older than ${getCandidateTtlDays()} day(s)).`
      );
    }
    if (result.stalePending.length > 0) {
      const staleNames = sortedLimitedVendors(result.stalePending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stale_pending=${result.stalePending.length} (>=${getStalePendingDays()} day(s)); first ${staleNames.length}: ${staleNames.join(", ")}`
      );
    }
    if (result.volatilePending.length > 0) {
      const volatileNames = sortedLimitedVendors(result.volatilePending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: volatile_pending=${result.volatilePending.length} (change_key_flip_count>=${getVolatileFlipThreshold()}); first ${volatileNames.length}: ${volatileNames.join(", ")}`
      );
    }
    const escalationOverrideEntries = Object.entries(result.escalationFlipOverrides || {});
    if (escalationOverrideEntries.length > 0) {
      const sampledOverrideEntries = escalationOverrideEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, getPendingDetailLimit())
        .map(([vendor, details]) => `${vendor}(flip=${details.flipCount},threshold=${details.threshold})`);
      console.log(
        `::notice::${result.name}: escalation_flip_threshold_override_applied=${escalationOverrideEntries.length}; first ${sampledOverrideEntries.length}: ${sampledOverrideEntries.join(", ")}`
      );
    }
    if (result.escalatedPending.length > 0) {
      const escalatedNames = sortedLimitedVendors(result.escalatedPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: hard_escalation=${result.escalatedPending.length}; first ${escalatedNames.length}: ${escalatedNames.join(", ")}`
      );
    }
    if (result.coverageGaps.length > 0) {
      const gapNames = sortedLimitedVendors(result.coverageGaps, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: pending_without_confirm_or_escalation=${result.coverageGaps.length} (>=${getNoConfirmEscalationDays()} day(s)); first ${gapNames.length}: ${gapNames.join(", ")}`
      );
    }
    if (result.rebaselineForProfile) {
      console.log(
        `::notice::${result.name}: hash_profile_rebaselined=${HASH_PROFILE_ID}; pending candidates reset for this policy set.`
      );
    }

    console.log(
      `Checked ${result.name}: ${result.successfulChecks}/${result.totalChecks} vendors fetched successfully.`
    );

    for (const c of result.observedChanged) {
      allObservedChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialChanged) {
      allMaterialChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialRepeatSuppressed) {
      allMaterialRepeatSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialVersionRepeatSuppressed) {
      allMaterialVersionRepeatSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialOscillationSuppressed) {
      allMaterialOscillationSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const vendor of result.qualityGateHeld) {
      allQualityGateHeld.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.metadataStabilityHeld) {
      allMetadataStabilityHeld.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.noiseSuppressed) {
      allNoiseSuppressed.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.pending) {
      allPending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.fetchBlockedPending) {
      allFetchBlockedPending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.legacyPending) {
      allLegacyPending.push({ policyType: result.name, vendor });
    }
    if (result.pending.length > 0) {
      pendingDetailByPolicy[result.name] = [...result.pending];
    }
    if (result.qualityGateHeld.length > 0) {
      const qualityHeldNames = sortedLimitedVendors(result.qualityGateHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: quality_gate_held=${result.qualityGateHeld.length}; first ${qualityHeldNames.length}: ${qualityHeldNames.join(", ")}`
      );
    }
    for (const vendor of result.stalePending) {
      allStalePending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.volatilePending) {
      allVolatilePending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.escalatedPending) {
      const reason = result.escalatedReasons?.[vendor] || "unknown";
      allEscalatedPending.push({ policyType: result.name, vendor, reason });
    }
    if (result.escalatedPending.length > 0) {
      escalationDetailByPolicy[result.name] = result.escalatedPending
        .map((vendor) => `${vendor}(${result.escalatedReasons?.[vendor] || "unknown"})`);
    }
    for (const vendor of result.coverageGaps) {
      allCoverageGaps.push({ policyType: result.name, vendor });
    }
  }

  const toPolicyCountString = (items) => Object.entries(summarizePolicyCounts(items))
    .map(([policy, count]) => `${policy}:${count}`)
    .join(",");

  const pendingByPolicy = toPolicyCountString(allPending);
  const pendingSample = allPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const legacyPendingByPolicy = toPolicyCountString(allLegacyPending);
  const legacyPendingSample = allLegacyPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fetchBlockedPendingByPolicy = toPolicyCountString(allFetchBlockedPending);
  const fetchBlockedPendingSample = allFetchBlockedPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const pendingDetail = Object.entries(pendingDetailByPolicy)
    .map(([policy, vendors]) => `${policy}:${sortedLimitedVendors(vendors, getPendingDetailLimit()).join("|")}`)
    .join(";");

  const stalePendingByPolicy = toPolicyCountString(allStalePending);
  const stalePendingSample = allStalePending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");

  const volatilePendingByPolicy = toPolicyCountString(allVolatilePending);
  const volatilePendingSample = allVolatilePending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");

  const escalationByPolicy = toPolicyCountString(allEscalatedPending);
  const escalationSample = allEscalatedPending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const escalationDetail = Object.entries(escalationDetailByPolicy)
    .map(([policy, vendors]) => `${policy}:${sortedLimitedVendors(vendors, getPendingDetailLimit()).join("|")}`)
    .join(";");

  const coverageGapByPolicy = toPolicyCountString(allCoverageGaps);
  const coverageGapSample = allCoverageGaps
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const observedByPolicy = toPolicyCountString(allObservedChanged);
  const observedSample = allObservedChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const actualByPolicyObject = toPolicyCountObject(allMaterialChanged);
  const actualByPolicy = toPolicyCountString(allMaterialChanged);
  const actualSampleList = allMaterialChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`);
  const actualSample = allMaterialChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const actualDiffSample = allMaterialChanged
    .slice(0, 10)
    .map((item) => `${item.policyType}:${item.vendor}:${item.semantic_diff_summary}`)
    .join(",");
  const materialRepeatSuppressedByPolicy = toPolicyCountString(allMaterialRepeatSuppressed);
  const materialRepeatSuppressedSample = allMaterialRepeatSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const materialVersionRepeatSuppressedByPolicy = toPolicyCountString(allMaterialVersionRepeatSuppressed);
  const materialVersionRepeatSuppressedSample = allMaterialVersionRepeatSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const materialOscillationSuppressedByPolicy = toPolicyCountString(allMaterialOscillationSuppressed);
  const materialOscillationSuppressedSample = allMaterialOscillationSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const qualityGateHeldByPolicy = toPolicyCountString(allQualityGateHeld);
  const qualityGateHeldSample = allQualityGateHeld
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const metadataStabilityHeldByPolicy = toPolicyCountString(allMetadataStabilityHeld);
  const metadataStabilityHeldSample = allMetadataStabilityHeld
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const noiseSuppressedByPolicy = toPolicyCountString(allNoiseSuppressed);
  const noiseSuppressedSample = allNoiseSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const pendingByPolicyObject = toPolicyCountObject(allPending);
  const fetchFailureByPolicy = toPolicyCountString(allErrors);
  const fetchFailureSample = allErrors
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fetchHealthStatus = allErrors.length > 0 ? "degraded" : "healthy";
  const tier1Total = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.total || 0), 0);
  const tier1Fetched = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.fetched || 0), 0);
  const tier1Failed = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.failed || 0), 0);
  const tier1CoveragePct = tier1Total > 0 ? ((tier1Fetched / tier1Total) * 100).toFixed(2) : "0.00";
  const tier1ByPolicyValue = POLICY_COUNT_KEYS
    .map((policyType) => {
      const stats = tier1ByPolicy[policyType] || { fetched: 0, total: 0, failed: 0 };
      return `${policyType}:${stats.fetched}/${stats.total}`;
    })
    .join(",");
  const tier1FailedSample = allTier1Failed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const tier1MissingConfiguredSample = allTier1MissingConfigured
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const generatedAtUtc = utcIsoTimestamp();
  const changedDateUtc = generatedAtUtc.slice(0, 10);
  let alertFeedPublishState = {
    published: false,
    reason: "skipped_update_mode",
    signature: "",
    feedChanged: false,
  };

  const includeZeroChangeAlerts = getPolicyAlertIncludeZeroChange();
  const shouldPublishAlertFeed = allMaterialChanged.length > 0 || includeZeroChangeAlerts;

  if (!isUpdate && shouldPublishAlertFeed) {
    alertFeedPublishState = updatePolicyAlertFeed({
      date_utc: changedDateUtc,
      generated_at_utc: generatedAtUtc,
      changed_count: allMaterialChanged.length,
      by_policy: actualByPolicyObject,
      changed_sample: actualSampleList,
      pending_count: allPending.length,
      pending_by_policy: pendingByPolicyObject,
      fetch_blocked_pending_count: allFetchBlockedPending.length,
      stale_pending_count: allStalePending.length,
      volatile_pending_count: allVolatilePending.length,
      escalation_count: allEscalatedPending.length,
      coverage_gap_count: allCoverageGaps.length,
      quality_gate_held_count: allQualityGateHeld.length,
      metadata_stability_held_count: allMetadataStabilityHeld.length,
      material_oscillation_suppressed_count: allMaterialOscillationSuppressed.length,
      run_url: buildRunUrl(),
      run_id: String(process.env.GITHUB_RUN_ID || "").trim(),
      run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || "").trim(),
      commit_sha: String(process.env.GITHUB_SHA || "").trim(),
      source: "check-policies.js",
    });
  } else if (!isUpdate && !shouldPublishAlertFeed) {
    alertFeedPublishState = {
      published: false,
      reason: "no_confirmed_changes",
      signature: "",
      feedChanged: false,
    };
  }
  const policyEventLogResult = !isUpdate
    ? appendPolicyEventLog(allMaterialChanged, generatedAtUtc)
    : {
      appended_count: 0,
      skipped_existing_count: 0,
      skipped_invalid_count: 0,
      total_count: readNdjson(POLICY_EVENT_LOG_PATH).length,
    };
  console.log(`ALERT_FEED_PUBLISHED=${alertFeedPublishState.published ? "1" : "0"}`);
  console.log(`ALERT_FEED_REASON=${alertFeedPublishState.reason}`);
  console.log(`ALERT_FEED_SIGNATURE=${alertFeedPublishState.signature}`);
  console.log(`ALERT_FEED_CHANGED=${alertFeedPublishState.feedChanged ? "1" : "0"}`);
  console.log(`FETCH_FAILURE_COUNT=${allErrors.length}`);
  console.log(`FETCH_FAILURE_BY_POLICY=${fetchFailureByPolicy}`);
  console.log(`FETCH_FAILURE_SAMPLE=${fetchFailureSample}`);
  console.log(`FETCH_HEALTH_STATUS=${fetchHealthStatus}`);
  console.log(`TIER1_TOTAL=${tier1Total}`);
  console.log(`TIER1_FETCHED=${tier1Fetched}`);
  console.log(`TIER1_FAILED=${tier1Failed}`);
  console.log(`TIER1_COVERAGE_PCT=${tier1CoveragePct}`);
  console.log(`TIER1_BY_POLICY=${tier1ByPolicyValue}`);
  console.log(`TIER1_FAILED_SAMPLE=${tier1FailedSample}`);
  console.log(`TIER1_MISSING_CONFIGURED_COUNT=${allTier1MissingConfigured.length}`);
  console.log(`TIER1_MISSING_CONFIGURED_SAMPLE=${tier1MissingConfiguredSample}`);

  console.log(`PENDING_COUNT=${allPending.length}`);
  console.log(`PENDING_BY_POLICY=${pendingByPolicy}`);
  console.log(`PENDING_SAMPLE=${pendingSample}`);
  console.log(`PENDING_DETAIL=${pendingDetail}`);
  console.log(`LEGACY_PENDING_COUNT=${allLegacyPending.length}`);
  console.log(`LEGACY_PENDING_BY_POLICY=${legacyPendingByPolicy}`);
  console.log(`LEGACY_PENDING_SAMPLE=${legacyPendingSample}`);
  console.log(`FETCH_BLOCKED_PENDING_COUNT=${allFetchBlockedPending.length}`);
  console.log(`FETCH_BLOCKED_PENDING_BY_POLICY=${fetchBlockedPendingByPolicy}`);
  console.log(`FETCH_BLOCKED_PENDING_SAMPLE=${fetchBlockedPendingSample}`);
  console.log(`STALE_PENDING_COUNT=${allStalePending.length}`);
  console.log(`STALE_PENDING_BY_POLICY=${stalePendingByPolicy}`);
  console.log(`STALE_PENDING_SAMPLE=${stalePendingSample}`);
  console.log(`VOLATILE_PENDING_COUNT=${allVolatilePending.length}`);
  console.log(`VOLATILE_PENDING_BY_POLICY=${volatilePendingByPolicy}`);
  console.log(`VOLATILE_PENDING_SAMPLE=${volatilePendingSample}`);
  console.log(`ESCALATION_COUNT=${allEscalatedPending.length}`);
  console.log(`ESCALATION_BY_POLICY=${escalationByPolicy}`);
  console.log(`ESCALATION_SAMPLE=${escalationSample}`);
  console.log(`ESCALATION_DETAIL=${escalationDetail}`);
  console.log(`COVERAGE_GAP_COUNT=${allCoverageGaps.length}`);
  console.log(`COVERAGE_GAP_BY_POLICY=${coverageGapByPolicy}`);
  console.log(`COVERAGE_GAP_SAMPLE=${coverageGapSample}`);
  console.log(`OBSERVED_CHANGED_COUNT=${allObservedChanged.length}`);
  console.log(`OBSERVED_CHANGED_BY_POLICY=${observedByPolicy}`);
  console.log(`OBSERVED_CHANGED_SAMPLE=${observedSample}`);
  console.log(`ACTUAL_CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`ACTUAL_CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`ACTUAL_CHANGED_SAMPLE=${actualSample}`);
  console.log(`ACTUAL_DIFF_SAMPLE=${actualDiffSample}`);
  // Backward-compatible aliases consumed by existing tooling.
  console.log(`MATERIAL_CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`MATERIAL_CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`MATERIAL_CHANGED_SAMPLE=${actualSample}`);
  console.log(`MATERIAL_DIFF_SAMPLE=${actualDiffSample}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_COUNT=${allMaterialRepeatSuppressed.length}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_BY_POLICY=${materialRepeatSuppressedByPolicy}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_SAMPLE=${materialRepeatSuppressedSample}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_COUNT=${allMaterialVersionRepeatSuppressed.length}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_BY_POLICY=${materialVersionRepeatSuppressedByPolicy}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_SAMPLE=${materialVersionRepeatSuppressedSample}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_COUNT=${allMaterialOscillationSuppressed.length}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_BY_POLICY=${materialOscillationSuppressedByPolicy}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_SAMPLE=${materialOscillationSuppressedSample}`);
  console.log(`QUALITY_GATE_HELD_COUNT=${allQualityGateHeld.length}`);
  console.log(`QUALITY_GATE_HELD_BY_POLICY=${qualityGateHeldByPolicy}`);
  console.log(`QUALITY_GATE_HELD_SAMPLE=${qualityGateHeldSample}`);
  console.log(`METADATA_STABILITY_HELD_COUNT=${allMetadataStabilityHeld.length}`);
  console.log(`METADATA_STABILITY_HELD_BY_POLICY=${metadataStabilityHeldByPolicy}`);
  console.log(`METADATA_STABILITY_HELD_SAMPLE=${metadataStabilityHeldSample}`);
  console.log(`NOISE_SUPPRESSED_COUNT=${allNoiseSuppressed.length}`);
  console.log(`NOISE_SUPPRESSED_BY_POLICY=${noiseSuppressedByPolicy}`);
  console.log(`NOISE_SUPPRESSED_SAMPLE=${noiseSuppressedSample}`);
  console.log(`POLICY_EVENT_APPENDED_COUNT=${policyEventLogResult.appended_count}`);
  console.log(`POLICY_EVENT_SKIPPED_EXISTING_COUNT=${policyEventLogResult.skipped_existing_count}`);
  console.log(`POLICY_EVENT_SKIPPED_INVALID_COUNT=${policyEventLogResult.skipped_invalid_count}`);
  console.log(`POLICY_EVENT_TOTAL_COUNT=${policyEventLogResult.total_count}`);
  // Canonical public aliases: "changed" means actual policy changes.
  console.log(`CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`CHANGED_SAMPLE=${actualSample}`);

  if (isUpdate) {
    console.log(`Hashes updated for all policy sets.`);
    return;
  }

  if (allObservedChanged.length === 0) {
    console.log("No policy page-content updates observed.");
  } else {
    const preview = allObservedChanged
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> rules/${c.rulesFile}`)
      .join("\n");
    console.log(
      `::notice::Observed page-content updates (first ${Math.min(allObservedChanged.length, 20)}):\n${preview}`
    );
  }

  if (allMaterialChanged.length === 0) {
    console.log("No policy changes confirmed.");
  } else {
    const policyPreview = allMaterialChanged
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> ${c.semantic_diff_summary}`)
      .join("\n");
    console.log(
      `::notice::Policy change preview (first ${Math.min(allMaterialChanged.length, 20)}):\n${policyPreview}`
    );
  }
  if (allMaterialRepeatSuppressed.length > 0) {
    const suppressedPreview = allMaterialRepeatSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> repeated semantic diff (suppressed by cooldown)`)
      .join("\n");
    console.log(
      `::notice::Suppressed repeated semantic diffs (first ${Math.min(allMaterialRepeatSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (allMaterialVersionRepeatSuppressed.length > 0) {
    const suppressedPreview = allMaterialVersionRepeatSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> repeated hash version (suppressed)`)
      .join("\n");
    console.log(
      `::notice::Suppressed repeated material hash versions (first ${Math.min(allMaterialVersionRepeatSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (allMaterialOscillationSuppressed.length > 0) {
    const suppressedPreview = allMaterialOscillationSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> oscillation pattern A/B/A (suppressed)`)
      .join("\n");
    console.log(
      `::notice::Suppressed oscillating semantic diffs (first ${Math.min(allMaterialOscillationSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (policyEventLogResult.appended_count > 0) {
    console.log(
      `::notice::Policy event log appended ${policyEventLogResult.appended_count} event(s) (total=${policyEventLogResult.total_count}).`
    );
  }
  process.exitCode = 0;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
