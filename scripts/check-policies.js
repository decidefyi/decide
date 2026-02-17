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

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKER_CONFIG = {
  batchSize: Number.parseInt(process.env.POLICY_CHECK_BATCH_SIZE || "3", 10),
  directAttempts: Number.parseInt(process.env.POLICY_CHECK_DIRECT_ATTEMPTS || "3", 10),
  fallbackAttempts: Number.parseInt(process.env.POLICY_CHECK_FALLBACK_ATTEMPTS || "2", 10),
  timeoutMs: Number.parseInt(process.env.POLICY_CHECK_TIMEOUT_MS || "18000", 10),
  errorDetailLimit: Number.parseInt(process.env.POLICY_CHECK_ERROR_DETAIL_LIMIT || "12", 10),
  changeConfirmRuns: Number.parseInt(process.env.POLICY_CHECK_CHANGE_CONFIRM_RUNS || "2", 10),
  candidateTtlDays: Number.parseInt(process.env.POLICY_CHECK_CANDIDATE_TTL_DAYS || "7", 10),
  pendingDetailLimit: Number.parseInt(process.env.POLICY_CHECK_PENDING_DETAIL_LIMIT || "20", 10),
  sameRunRecheckPasses: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_PASSES || "1", 10),
  sameRunRecheckDelayMs: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_DELAY_MS || "1200", 10),
  sameRunRecheckBatchSize: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_BATCH_SIZE || "3", 10),
  sameRunMajorityMinVotes: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_MAJORITY_MIN_VOTES || "2", 10),
  stalePendingDays: Number.parseInt(process.env.POLICY_CHECK_STALE_PENDING_DAYS || "3", 10),
  volatileFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_VOLATILE_FLIP_THRESHOLD || "2", 10),
  escalationPendingDays: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_PENDING_DAYS || "5", 10),
  escalationFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_FLIP_THRESHOLD || "3", 10),
  noConfirmEscalationDays: Number.parseInt(process.env.POLICY_CHECK_NO_CONFIRM_ESCALATION_DAYS || "7", 10),
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
    rulesFile: "v1_us_individual.json",
  },
  {
    name: "cancel",
    sourcesPath: join(__dirname, "..", "rules", "cancel-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "cancel-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "cancel-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "cancel-policy-coverage-state.json"),
    rulesFile: "v1_us_individual_cancel.json",
  },
  {
    name: "return",
    sourcesPath: join(__dirname, "..", "rules", "return-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "return-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "return-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "return-policy-coverage-state.json"),
    rulesFile: "v1_us_individual_return.json",
  },
  {
    name: "trial",
    sourcesPath: join(__dirname, "..", "rules", "trial-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "trial-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "trial-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "trial-policy-coverage-state.json"),
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
const HASH_PROFILE_ID = process.env.POLICY_CHECK_HASH_PROFILE || "focus-v1";

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

function normalizeFetchedText(rawText, policyType = "default") {
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

  const focused = extractPolicyFocusedText(deduped, policyType);
  if (focused) return focused;
  return deduped.join("\n");
}

function getConfirmRuns() {
  if (!Number.isFinite(CHECKER_CONFIG.changeConfirmRuns)) return 2;
  return Math.max(1, CHECKER_CONFIG.changeConfirmRuns);
}

function getConfirmRunsForVendor(vendorConfig) {
  const defaultRuns = getConfirmRuns();
  if (!vendorConfig || typeof vendorConfig !== "object") return defaultRuns;
  const configured = Number.parseInt(vendorConfig.confirm_runs, 10);
  if (!Number.isFinite(configured)) return defaultRuns;
  return Math.max(1, configured);
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
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckPasses)) return 1;
  return Math.max(0, CHECKER_CONFIG.sameRunRecheckPasses);
}

function getSameRunRecheckDelayMs() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckDelayMs)) return 1200;
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
  if (!Number.isFinite(CHECKER_CONFIG.escalationFlipThreshold)) return 3;
  return Math.max(1, CHECKER_CONFIG.escalationFlipThreshold);
}

function getNoConfirmEscalationDays() {
  if (!Number.isFinite(CHECKER_CONFIG.noConfirmEscalationDays)) return 7;
  return Math.max(1, CHECKER_CONFIG.noConfirmEscalationDays);
}

function getCandidateAgeDays(candidate, nowMs = Date.now()) {
  const firstSeen = candidate?.first_seen_utc;
  if (!firstSeen) return 0;
  const firstSeenMs = Date.parse(firstSeen);
  if (!Number.isFinite(firstSeenMs)) return 0;
  return Math.max(0, Math.floor((nowMs - firstSeenMs) / (24 * 60 * 60 * 1000)));
}

function toMsOrNaN(isoValue) {
  if (typeof isoValue !== "string" || !isoValue) return Number.NaN;
  return Date.parse(isoValue);
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
      return { text: directResult, sourceUrl: candidateUrl };
    }

    failures.push(`${candidateUrl} (${directResult.error})`);

    const mirrorUrl = toJinaMirrorUrl(candidateUrl);
    if (!mirrorUrl) continue;

    const mirrorResult = await fetchText(mirrorUrl, CHECKER_CONFIG.fallbackAttempts);
    if (typeof mirrorResult === "string") {
      return { text: mirrorResult, sourceUrl: candidateUrl };
    }
    failures.push(`${candidateUrl} [mirror] (${mirrorResult.error})`);
  }

  return { text: null, error: failures.join("; ") };
}

async function checkPolicySet({ name, sourcesPath, hashesPath, candidatesPath, coveragePath, rulesFile }) {
  if (!existsSync(sourcesPath)) {
    console.log(`::warning::Sources file not found for ${name}: ${sourcesPath}`);
    return {
      name,
      changed: [],
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
      escalatedPending: [],
      escalatedReasons: {},
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
  const changed = [];
  const pendingSet = new Set();
  const pendingMetadata = {};
  const errors = [];
  const errorReasons = {};
  const newHashes = { ...storedHashes };
  const newCandidates = {};
  const runObservations = {};
  const recheckConfirmedSet = new Set();
  const recheckResolvedSet = new Set();
  const recheckFetchFailureSet = new Set();
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
          coverage.last_fetch_failure_utc = utcIsoTimestamp();
          coverage.last_fetch_failure_reason = fetchResult.error || "request failed";
          if (activeStoredCandidates[vendor]) {
            newCandidates[vendor] = activeStoredCandidates[vendor];
          }
          return;
        }
        const normalized = normalizeFetchedText(fetchResult.text, name);
        const h = hash(normalized || fetchResult.text);
        successfulChecks += 1;
        const fetchedAtUtc = utcIsoTimestamp();
        markSuccessfulFetch(vendor, fetchedAtUtc);
        const coverage = ensureCoverageEntry(vendor);
        delete coverage.last_fetch_failure_utc;
        delete coverage.last_fetch_failure_reason;
        const confirmRuns = getConfirmRunsForVendor(vendorConfig);

        const sourceUrl =
          typeof vendorConfig?.url === "string" && vendorConfig.url
            ? vendorConfig.url
            : fetchResult.sourceUrl;

        const previousHash = storedHashes[vendor];
        if (isUpdate || rebaselineForProfile || !previousHash || previousHash === h) {
          newHashes[vendor] = h;
          delete newCandidates[vendor];
          return;
        }

        const priorCandidate = activeStoredCandidates[vendor];
        const priorCount = Number(priorCandidate?.count || 0);
        const priorFlipCount = Number(priorCandidate?.flip_count || 0);
        const priorHash = typeof priorCandidate?.hash === "string" ? priorCandidate.hash : "";
        const nextCount = priorHash === h ? Math.max(1, priorCount) + 1 : 1;
        const nextFlipCount = priorHash && priorHash !== h ? priorFlipCount + 1 : priorFlipCount;
        if (nextCount >= confirmRuns) {
          changed.push({ vendor, url: sourceUrl });
          newHashes[vendor] = h;
          markConfirmedChange(vendor, fetchedAtUtc);
          return;
        }

        newHashes[vendor] = previousHash;
        pendingSet.add(vendor);
        newCandidates[vendor] = {
          hash: h,
          count: nextCount,
          flip_count: nextFlipCount,
          source_url: sourceUrl || "",
          first_seen_utc: priorHash === h && priorCandidate.first_seen_utc
            ? priorCandidate.first_seen_utc
            : fetchedAtUtc,
          last_seen_utc: fetchedAtUtc,
        };
        pendingMetadata[vendor] = {
          vendorConfig,
          confirmRuns,
          previousHash,
          sourceUrl: sourceUrl || priorCandidate?.source_url || "",
        };
        runObservations[vendor] = {
          baselineVotes: 0,
          hashVotes: { [h]: 1 },
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

          const normalized = normalizeFetchedText(recheckResult.text, name);
          const h = hash(normalized || recheckResult.text);
          const observations = runObservations[vendor];
          if (h === metadata.previousHash) {
            observations.baselineVotes = Number(observations.baselineVotes || 0) + 1;
          } else {
            observations.hashVotes[h] = Number(observations.hashVotes[h] || 0) + 1;
          }

          const majorityDecision = getRunMajorityDecision(observations);
          if (majorityDecision?.type === "baseline") {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }
          if (majorityDecision?.type === "hash" && majorityDecision.hash) {
            const sourceUrl = recheckResult.sourceUrl || metadata.sourceUrl || "";
            changed.push({ vendor, url: sourceUrl });
            newHashes[vendor] = majorityDecision.hash;
            markConfirmedChange(vendor, fetchedAtUtc);
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckConfirmedSet.add(vendor);
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
          } else {
            candidate.hash = h;
            candidate.count = 1;
            candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            candidate.first_seen_utc = utcIsoTimestamp();
          }

          const sourceUrl = recheckResult.sourceUrl || metadata.sourceUrl || "";
          if (sourceUrl) candidate.source_url = sourceUrl;
          candidate.last_seen_utc = fetchedAtUtc;

          if (Number(candidate.count || 0) >= metadata.confirmRuns) {
            changed.push({ vendor, url: sourceUrl });
            newHashes[vendor] = h;
            markConfirmedChange(vendor, fetchedAtUtc);
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckConfirmedSet.add(vendor);
            return;
          }

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
  const coverageGaps = [];
  const summaryNowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(newCandidates)) {
    const ageDays = getCandidateAgeDays(candidate, summaryNowMs);
    const flipCount = Number(candidate?.flip_count || 0);
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
    if (flipCount >= getEscalationFlipThreshold()) {
      escalationReasons.push(`flip_count>=${getEscalationFlipThreshold()}`);
    }
    if (escalationReasons.length > 0) {
      escalatedPending.push(vendor);
      escalatedReasons[vendor] = escalationReasons.join("&");
      coverage.last_escalated_utc = utcIsoTimestamp();
    }

    const firstSeenMs = toMsOrNaN(candidate?.first_seen_utc);
    const lastConfirmedMs = toMsOrNaN(coverage?.last_confirmed_change_utc);
    const lastEscalatedMs = toMsOrNaN(coverage?.last_escalated_utc);
    const resolutionMs = [lastConfirmedMs, lastEscalatedMs].filter((value) => Number.isFinite(value));
    const latestResolutionMs = resolutionMs.length > 0 ? Math.max(...resolutionMs) : Number.NaN;
    if (
      ageDays >= getNoConfirmEscalationDays() &&
      Number.isFinite(firstSeenMs) &&
      (!Number.isFinite(latestResolutionMs) || latestResolutionMs < firstSeenMs)
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
    changed,
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
    escalatedPending,
    escalatedReasons,
    coverageGaps,
  };
}

async function main() {
  const allChanged = [];
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

    for (const c of result.changed) {
      allChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
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

  if (isUpdate) {
    console.log(`Hashes updated for all policy sets.`);
    return;
  }

  if (allChanged.length === 0) {
    console.log("No policy page changes detected.");
    process.exitCode = 0;
  } else {
    const countsByPolicy = summarizePolicyCounts(allChanged);
    const byPolicy = Object.entries(countsByPolicy)
      .map(([policy, count]) => `${policy}:${count}`)
      .join(",");
    const sample = allChanged
      .slice(0, 15)
      .map((c) => `${c.policyType}:${c.vendor}`)
      .join(",");

    console.log(`CHANGED_COUNT=${allChanged.length}`);
    console.log(`CHANGED_BY_POLICY=${byPolicy}`);
    console.log(`CHANGED_SAMPLE=${sample}`);

    // Keep a concise preview in logs while details remain in updated candidate files.
    const preview = allChanged
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> rules/${c.rulesFile}`)
      .join("\n");
    console.log(`::notice::Changed vendor preview (first ${Math.min(allChanged.length, 20)}):\n${preview}`);
    process.exitCode = 0;
  }
}

main();
