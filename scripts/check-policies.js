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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKER_CONFIG = {
  batchSize: Number.parseInt(process.env.POLICY_CHECK_BATCH_SIZE || "3", 10),
  directAttempts: Number.parseInt(process.env.POLICY_CHECK_DIRECT_ATTEMPTS || "3", 10),
  fallbackAttempts: Number.parseInt(process.env.POLICY_CHECK_FALLBACK_ATTEMPTS || "2", 10),
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
  noConfirmEscalationDays: Number.parseInt(process.env.POLICY_CHECK_NO_CONFIRM_ESCALATION_DAYS || "7", 10),
  materialCooldownDays: Number.parseInt(process.env.POLICY_CHECK_MATERIAL_COOLDOWN_DAYS || "14", 10),
  actualConfirmRuns: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_CONFIRM_RUNS || "2", 10),
  actualMinGapHours: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_MIN_GAP_HOURS || "4", 10),
  alertLowSignalThreshold: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_THRESHOLD || "1", 10),
  alertLowSignalLookback: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_LOOKBACK || "6", 10),
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
const POLICY_ALERT_FEED_PATH = join(__dirname, "..", "rules", "policy-alert-feed.json");
const POLICY_EVENT_LOG_PATH = join(__dirname, "..", "rules", "policy-events.ndjson");
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
  return {
    hash: sourceHash,
    source_url: sourceUrl,
    extracted_at_utc: extractedAtUtc,
    tokens: normalizeSemanticTokens(extractSemanticTokens(text, policyType)),
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

function toJinaMirrorUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
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

async function fetchWithFallback(vendorConfig) {
  const candidates = buildCandidateUrls(vendorConfig);
  if (candidates.length === 0) {
    return { text: null, error: "missing source URL" };
  }

  const failures = [];
  for (const candidateUrl of candidates) {
    const directResult = await fetchText(candidateUrl, CHECKER_CONFIG.directAttempts);
    if (typeof directResult === "string") {
      const interstitialReason = detectFetchInterstitial(directResult);
      if (!interstitialReason) {
        return { text: directResult, sourceUrl: candidateUrl };
      }
      failures.push(`${candidateUrl} (interstitial:${interstitialReason})`);
    } else {
      failures.push(`${candidateUrl} (${directResult.error})`);
    }

    const mirrorUrl = toJinaMirrorUrl(candidateUrl);
    if (!mirrorUrl) continue;

    const mirrorResult = await fetchText(mirrorUrl, CHECKER_CONFIG.fallbackAttempts);
    if (typeof mirrorResult === "string") {
      const interstitialReason = detectFetchInterstitial(mirrorResult);
      if (!interstitialReason) {
        return { text: mirrorResult, sourceUrl: candidateUrl };
      }
      failures.push(`${candidateUrl} [mirror] (interstitial:${interstitialReason})`);
    } else {
      failures.push(`${candidateUrl} [mirror] (${mirrorResult.error})`);
    }
  }

  return { text: null, error: failures.join("; ") };
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
      escalatedPending: [],
      escalatedReasons: {},
      escalationFlipOverrides: {},
      coverageGaps: [],
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
    activeStoredCandidates[vendor] = candidate;
  }

  const vendors = Object.entries(sources.vendors);
  const observedChanged = [];
  const materialChanged = [];
  const materialRepeatSuppressed = [];
  const materialVersionRepeatSuppressed = [];
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
  let successfulChecks = 0;

  const ensureCoverageEntry = (vendor) => {
    if (!coverageVendors[vendor] || typeof coverageVendors[vendor] !== "object") {
      coverageVendors[vendor] = {};
    }
    return coverageVendors[vendor];
  };

  const markSuccessfulFetch = (vendor, whenUtc) => {
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_successful_fetch_utc = whenUtc;
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
      const cooldownDays = getMaterialCooldownDays();
      const nowMs = toMsOrNaN(confirmedAtUtc);
      const previousMs = toMsOrNaN(previousEmittedUtc);
      const suppressRepeatedSignature =
        cooldownDays > 0 &&
        diffSignature &&
        previousSignature &&
        diffSignature === previousSignature &&
        Number.isFinite(nowMs) &&
        Number.isFinite(previousMs) &&
        (nowMs - previousMs) < cooldownDays * 24 * 60 * 60 * 1000;

      if (suppressRepeatedSignature) {
        materialRepeatSuppressed.push({
          ...entry,
          semantic_diff_signature: diffSignature,
          last_material_emitted_utc: previousEmittedUtc,
        });
        coverage.last_material_repeat_suppressed_utc = confirmedAtUtc;
        coverage.last_material_repeat_suppressed_signature = diffSignature;
      } else {
        materialChanged.push(entry);
        if (diffSignature) {
          coverage.last_material_signature = diffSignature;
          coverage.last_material_emitted_utc = confirmedAtUtc;
          coverage.last_material_emitted_hash = confirmedHash || coverage.last_material_emitted_hash || "";
        }
        delete coverage.last_material_repeat_suppressed_utc;
        delete coverage.last_material_repeat_suppressed_signature;
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
        const fetchResult = await fetchWithFallback(vendorConfig);
        if (!fetchResult.text) {
          errors.push(vendor);
          errorReasons[vendor] = fetchResult.error || "request failed";
          const coverage = ensureCoverageEntry(vendor);
          const failureAtUtc = utcIsoTimestamp();
          coverage.last_fetch_failure_utc = failureAtUtc;
          coverage.last_fetch_failure_reason = fetchResult.error || "request failed";
          if (activeStoredCandidates[vendor]) {
            newCandidates[vendor] = {
              ...activeStoredCandidates[vendor],
              run_confirmations: 0,
              last_fetch_failure_utc: failureAtUtc,
            };
          }
          return;
        }
        const normalized = normalizeFetchedText(fetchResult.text, name, vendor);
        const h = hash(normalized || fetchResult.text);
        successfulChecks += 1;
        const fetchedAtUtc = utcIsoTimestamp();
        markSuccessfulFetch(vendor, fetchedAtUtc);
        const coverage = ensureCoverageEntry(vendor);
        delete coverage.last_fetch_failure_utc;
        delete coverage.last_fetch_failure_reason;
        const actualConfirmRuns = getActualConfirmRunsForVendor(vendorConfig, vendor);

        const sourceUrl =
          typeof vendorConfig?.url === "string" && vendorConfig.url
            ? vendorConfig.url
            : fetchResult.sourceUrl;
        const semanticProfile = buildSemanticProfile(normalized || fetchResult.text, name, {
          hash: h,
          sourceUrl: sourceUrl || "",
          extractedAtUtc: fetchedAtUtc,
        });
        const semanticSignature = semanticTokenSignature(semanticProfile);

        const priorCandidate = activeStoredCandidates[vendor];
        const previousHash = storedHashes[vendor];
        const signal = previousHash && previousHash === h ? BASELINE_SIGNAL : h;
        const signalWindow = appendSignalWindow(coverage, signal);
        const signalWindowDecision = evaluateSignalWindow(signalWindow);

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

        const priorCount = Number(priorCandidate?.count || 0);
        const priorFlipCount = Number(priorCandidate?.flip_count || 0);
        const priorHash = typeof priorCandidate?.hash === "string" ? priorCandidate.hash : "";
        const nextCount = priorHash === h ? Math.max(1, priorCount) + 1 : 1;
        const nextFlipCount = priorHash && priorHash !== h ? priorFlipCount + 1 : priorFlipCount;
        const priorRunConfirmations = Number(priorCandidate?.run_confirmations || 0);
        const priorSemanticRunConfirmations = Number(priorCandidate?.semantic_run_confirmations || 0);
        const priorSemanticSignature =
          typeof priorCandidate?.semantic_signature === "string" ? priorCandidate.semantic_signature : "";
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
        let nextSemanticRunConfirmations = 1;
        if (priorHash === h && priorSemanticSignature && priorSemanticSignature === semanticSignature && priorSemanticRunConfirmations > 0) {
          nextSemanticRunConfirmations = gapSatisfied ? priorSemanticRunConfirmations + 1 : priorSemanticRunConfirmations;
        }
        const hashWindowConfirmed =
          typeof signalWindowDecision.hashDecision === "string" &&
          signalWindowDecision.hashDecision &&
          signalWindowDecision.hashDecision === h;

        if (
          nextRunConfirmations >= actualConfirmRuns &&
          nextSemanticRunConfirmations >= actualConfirmRuns &&
          hashWindowConfirmed
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
          (!gapSatisfied && priorHash === h && priorRunConfirmations > 0) ||
          (nextRunConfirmations >= actualConfirmRuns && !hashWindowConfirmed) ||
          (nextRunConfirmations >= actualConfirmRuns && nextSemanticRunConfirmations < actualConfirmRuns)
        ) {
          crossRunWindowHeldSet.add(vendor);
        }

        newHashes[vendor] = previousHash;
        pendingSet.add(vendor);
        newCandidates[vendor] = {
          hash: h,
          count: nextCount,
          flip_count: nextFlipCount,
          run_confirmations: nextRunConfirmations,
          semantic_run_confirmations: nextSemanticRunConfirmations,
          semantic_signature: semanticSignature,
          signal_window_hash_decision: signalWindowDecision.hashDecision || "",
          signal_window_required_votes: Number(signalWindowDecision.required || 0),
          signal_window_top_hash_votes: Number(signalWindowDecision.topVotes || 0),
          signal_window_baseline_votes: Number(signalWindowDecision.baselineVotes || 0),
          actual_confirm_runs_required: actualConfirmRuns,
          last_run_observed_utc: fetchedAtUtc,
          source_url: sourceUrl || "",
          pending_since_utc: getCandidatePendingSinceUtc(priorCandidate) || fetchedAtUtc,
          first_seen_utc: priorHash === h && priorCandidate.first_seen_utc
            ? priorCandidate.first_seen_utc
            : fetchedAtUtc,
          last_seen_utc: fetchedAtUtc,
          baseline_observations: 0,
          profile: semanticProfile,
        };
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

          const recheckResult = await fetchWithFallback(metadata.vendorConfig);
          if (!recheckResult.text) {
            recheckFetchFailureSet.add(vendor);
            const coverage = ensureCoverageEntry(vendor);
            coverage.last_fetch_failure_utc = utcIsoTimestamp();
            coverage.last_fetch_failure_reason = recheckResult.error || "request failed";
            return;
          }

          const fetchedAtUtc = utcIsoTimestamp();
          markSuccessfulFetch(vendor, fetchedAtUtc);
          const coverage = ensureCoverageEntry(vendor);
          delete coverage.last_fetch_failure_utc;
          delete coverage.last_fetch_failure_reason;

          const normalized = normalizeFetchedText(recheckResult.text, name, vendor);
          const h = hash(normalized || recheckResult.text);
          const sourceUrl = recheckResult.sourceUrl || metadata.sourceUrl || "";
          const semanticProfile = buildSemanticProfile(normalized || recheckResult.text, name, {
            hash: h,
            sourceUrl,
            extractedAtUtc: fetchedAtUtc,
          });
          const semanticSignature = semanticTokenSignature(semanticProfile);
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
            candidate.hash = majorityDecision.hash;
            candidate.profile =
              observations.hashProfiles?.[majorityDecision.hash] || candidate.profile || semanticProfile;
            const majoritySemanticSignature = semanticTokenSignature(candidate.profile);
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
            newCandidates[vendor] = candidate;
            return;
          }

          if (h === metadata.previousHash) {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }

          if (candidate.hash === h) {
            candidate.count = Number(candidate.count || 1) + 1;
            candidate.semantic_signature = semanticSignature;
          } else {
            candidate.hash = h;
            candidate.count = 1;
            candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
            candidate.first_seen_utc = utcIsoTimestamp();
            candidate.profile = semanticProfile;
            candidate.semantic_signature = semanticSignature;
            candidate.semantic_run_confirmations = 1;
          }
          candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
          candidate.profile = candidate.hash === h ? semanticProfile : candidate.profile;
          candidate.semantic_signature = candidate.hash === h ? semanticSignature : candidate.semantic_signature;
          if (sourceUrl) candidate.source_url = sourceUrl;
          candidate.last_seen_utc = fetchedAtUtc;
          candidate.run_confirmations = Number(candidate.run_confirmations || 1);
          candidate.semantic_run_confirmations = Number(candidate.semantic_run_confirmations || 1);

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
  const summaryNowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(newCandidates)) {
    const ageDays = getCandidateAgeDays(candidate, summaryNowMs);
    const flipCount = Number(candidate?.flip_count || 0);
    const escalationFlipConfig = getEscalationFlipThresholdForVendor(name, vendor);
    if (escalationFlipConfig.overridden) {
      escalationFlipOverrides[vendor] = {
        threshold: escalationFlipConfig.threshold,
        flipCount,
      };
    }
    if (ageDays >= getStalePendingDays()) {
      stalePending.push(vendor);
    }
    if (flipCount >= getVolatileFlipThreshold()) {
      volatilePending.push(vendor);
    }
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_pending_seen_utc = utcIsoTimestamp();
    coverage.last_pending_age_days = ageDays;
    coverage.last_pending_flip_count = flipCount;
    coverage.last_pending_source_url = candidate?.source_url || coverage.last_pending_source_url || "";

    const escalationReasons = [];
    if (ageDays >= getEscalationPendingDays()) {
      escalationReasons.push(`pending_age_days>=${getEscalationPendingDays()}`);
    }
    if (flipCount >= escalationFlipConfig.threshold) {
      escalationReasons.push(
        escalationFlipConfig.overridden
          ? `flip_count>=${escalationFlipConfig.threshold}(override)`
          : `flip_count>=${escalationFlipConfig.threshold}`
      );
    }
    if (escalationReasons.length > 0) {
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

  for (const [vendor] of vendors) {
    if (pendingSet.has(vendor)) continue;
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_pending_age_days = 0;
    coverage.last_pending_flip_count = 0;
    delete coverage.last_pending_source_url;
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
    observedChanged,
    materialChanged,
    materialRepeatSuppressed,
    materialVersionRepeatSuppressed,
    pending,
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
    escalatedPending,
    escalatedReasons,
    escalationFlipOverrides,
    coverageGaps,
  };
}

async function main() {
  const allObservedChanged = [];
  const allMaterialChanged = [];
  const allMaterialRepeatSuppressed = [];
  const allMaterialVersionRepeatSuppressed = [];
  const allErrors = [];
  const allPending = [];
  const allStalePending = [];
  const allVolatilePending = [];
  const allEscalatedPending = [];
  const allCoverageGaps = [];
  const pendingDetailByPolicy = {};
  const escalationDetailByPolicy = {};

  for (const policySet of POLICY_SETS) {
    const result = await checkPolicySet(policySet);

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
      allErrors.push(...result.errors.map((v) => `${result.name}:${v}`));
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
        `::notice::${result.name}: volatile_pending=${result.volatilePending.length} (flip_count>=${getVolatileFlipThreshold()}); first ${volatileNames.length}: ${volatileNames.join(", ")}`
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
    for (const vendor of result.pending) {
      allPending.push({ policyType: result.name, vendor });
    }
    if (result.pending.length > 0) {
      pendingDetailByPolicy[result.name] = [...result.pending];
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
  const pendingByPolicyObject = toPolicyCountObject(allPending);
  const generatedAtUtc = utcIsoTimestamp();
  const changedDateUtc = generatedAtUtc.slice(0, 10);
  let alertFeedPublishState = {
    published: false,
    reason: "skipped_update_mode",
    signature: "",
    feedChanged: false,
  };

  if (!isUpdate) {
    alertFeedPublishState = updatePolicyAlertFeed({
      date_utc: changedDateUtc,
      generated_at_utc: generatedAtUtc,
      changed_count: allMaterialChanged.length,
      by_policy: actualByPolicyObject,
      changed_sample: actualSampleList,
      pending_count: allPending.length,
      pending_by_policy: pendingByPolicyObject,
      stale_pending_count: allStalePending.length,
      volatile_pending_count: allVolatilePending.length,
      escalation_count: allEscalatedPending.length,
      coverage_gap_count: allCoverageGaps.length,
      run_url: buildRunUrl(),
      run_id: String(process.env.GITHUB_RUN_ID || "").trim(),
      run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || "").trim(),
      commit_sha: String(process.env.GITHUB_SHA || "").trim(),
      source: "check-policies.js",
    });
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

  console.log(`PENDING_COUNT=${allPending.length}`);
  console.log(`PENDING_BY_POLICY=${pendingByPolicy}`);
  console.log(`PENDING_SAMPLE=${pendingSample}`);
  console.log(`PENDING_DETAIL=${pendingDetail}`);
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
  if (policyEventLogResult.appended_count > 0) {
    console.log(
      `::notice::Policy event log appended ${policyEventLogResult.appended_count} event(s) (total=${policyEventLogResult.total_count}).`
    );
  }
  process.exitCode = 0;
}

main();
