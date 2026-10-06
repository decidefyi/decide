import { buildPolicySourceHash } from "./lineage.js";
import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";

const DEFAULT_TARGETS = {
  tracked_vendors: 200,
  admitted_vendors: 150,
  decision_ready_surfaces: 300,
};

const REQUIRED_CANDIDATE_METADATA = [
  "cohort",
  "segment",
  "demand_tier",
  "source_strategy",
];

const SUPPORTED_MONITORS = new Set([
  "zendesk_api",
  "official_document",
  "manual_review",
]);

const SUPPORTED_POLICY_SUBJECTS = new Set([
  "direct_vendor_customer_relationship",
]);

function toFinitePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percent(value, target) {
  if (!target) return 0;
  return Number(((value / target) * 100).toFixed(1));
}

function productionVendorIds(rulebooks = {}) {
  const ids = new Set();
  for (const rulebook of Object.values(rulebooks || {})) {
    for (const vendor of Object.keys(rulebook?.vendors || {})) ids.add(vendor);
  }
  return ids;
}

function decisionModeFor(policy, config = {}) {
  if (policy === "trial") {
    return String(config?.offer_mode || "unknown").trim() || "unknown";
  }
  return String(config?.decision_mode || "unknown").trim() || "unknown";
}

function buildPolicyDepth(rulebooks = {}) {
  const policyCounts = {};
  const modeCounts = {};
  let configuredSurfaceCount = 0;

  for (const [policy, rulebook] of Object.entries(rulebooks || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const counts = {};
    for (const config of Object.values(rulebook?.vendors || {})) {
      const mode = decisionModeFor(policy, config);
      counts[mode] = Number(counts[mode] || 0) + 1;
      modeCounts[mode] = Number(modeCounts[mode] || 0) + 1;
      configuredSurfaceCount += 1;
    }
    policyCounts[policy] = counts;
  }

  const deterministic = Number(modeCounts.deterministic || 0);
  const conditional = Number(modeCounts.conditional || 0);
  return {
    configured_policy_surface_count: configuredSurfaceCount,
    decision_ready_surface_count: deterministic + conditional,
    review_only_surface_count: Number(modeCounts.review_only || 0),
    observed_offer_surface_count: Number(modeCounts.observed || 0),
    unknown_surface_count: Number(modeCounts.unknown || 0),
    decision_mode_counts: modeCounts,
    policy_mode_counts: policyCounts,
  };
}

function buildRuntimeReadiness({ rulebooks, sourceMaps, evidenceSnapshot, now }) {
  const rows = [];
  for (const [policy, rulebook] of Object.entries(rulebooks)) {
    const sources = sourceMaps[policy] || {};
    const sourceHash = buildPolicySourceHash({ policy, policyVersion: rulebook.rules_version,
      rules: rulebook.vendors || {}, sources: sources.vendors || {},
      lastVerifiedUtc: sources.last_verified_utc || "", verificationScope: sources.verification_scope || "" });
    for (const [vendor, rule] of Object.entries(rulebook.vendors || {})) {
      const source = sources.vendors?.[vendor] || {};
      const verifiedAt = source.last_verified_utc ?? sources.last_verified_utc ?? "";
      const evidence = evaluatePolicyEvidence({ policy, vendor, snapshot: evidenceSnapshot,
        sourceHash, policyVersion: rulebook.rules_version, sourceUrl: source.url,
        verifiedAt, monitoringStatus: source.monitoring_status, now });
      const dueTime = Date.parse(verifiedAt) + 90 * 86400000;
      const validReview = Number.isFinite(dueTime) && Date.parse(verifiedAt) <= new Date(now).getTime();
      const retired = source.monitoring_status === "retired";
      const remainingDays = validReview ? (dueTime - new Date(now).getTime()) / 86400000 : null;
      const mode = decisionModeFor(policy, rule);
      rows.push({ policy, vendor, configured_mode: mode, monitoring_status: retired ? "retired" : "active",
        evidence_status: evidence.status, evidence_reason: evidence.reason,
        evidence_ready: !retired && ["deterministic", "conditional"].includes(mode) && evidence.current,
        review_status: retired ? "retired" : !validReview ? "missing_or_invalid" : remainingDays <= 0 ? "expired" : remainingDays <= 14 ? "due_soon" : "current",
        verified_at: verifiedAt || null, review_due_at: validReview ? new Date(dueTime).toISOString() : null,
        review_reason: rule.review_reason || null,
      });
    }
  }
  return {
    verification_basis: "source_snapshot_and_catalogue_at_report_time_not_a_live_runtime_probe",
    evidence_snapshot_available: Boolean(evidenceSnapshot),
    evidence_ready_requires_request_context: true,
    evidence_ready_surface_count: rows.filter(row => row.evidence_ready).length,
    retired_surface_count: rows.filter(row => row.monitoring_status === "retired").length,
    reviews_due_soon_count: rows.filter(row => row.review_status === "due_soon").length,
    reviews_expired_count: rows.filter(row => row.review_status === "expired").length,
    reviews_missing_or_invalid_count: rows.filter(row => row.review_status === "missing_or_invalid").length,
    review_queue: rows.filter(row => ["due_soon", "expired", "missing_or_invalid"].includes(row.review_status))
      .sort((a, b) => String(a.review_due_at || "").localeCompare(String(b.review_due_at || "")) || `${a.policy}:${a.vendor}`.localeCompare(`${b.policy}:${b.vendor}`)),
    rows,
  };
}

function buildSourceCoverage(sourceMaps = {}) {
  const primaryUrls = [];
  let primarySurfaceCount = 0;
  let surfacesWithBackup = 0;
  let backupUrlCount = 0;

  for (const sourceMap of Object.values(sourceMaps || {})) {
    for (const config of Object.values(sourceMap?.vendors || {})) {
      const primary = String(config?.url || "").trim();
      if (primary) {
        primaryUrls.push(primary);
        primarySurfaceCount += 1;
      }
      const backups = Array.isArray(config?.backup_urls)
        ? config.backup_urls.filter((url) => String(url || "").trim())
        : [];
      if (backups.length > 0) surfacesWithBackup += 1;
      backupUrlCount += backups.length;
    }
  }

  return {
    primary_source_surface_count: primarySurfaceCount,
    unique_primary_source_url_count: new Set(primaryUrls).size,
    surfaces_with_backup_source_count: surfacesWithBackup,
    backup_source_url_count: backupUrlCount,
  };
}

function countByCandidateMetadata(candidates, key) {
  return Object.values(candidates).reduce((counts, candidate) => {
    const value = String(candidate?.[key] ?? "unspecified").trim() || "unspecified";
    counts[value] = Number(counts[value] || 0) + 1;
    return counts;
  }, {});
}

function validateCandidateUrl({
  value,
  vendor,
  policy,
  field,
  allowedHosts,
  errors,
}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    errors.push(`candidate_${field}_invalid:${vendor}:${policy}`);
    return;
  }
  if (url.protocol !== "https:") {
    errors.push(`candidate_${field}_requires_https:${vendor}:${policy}`);
  }
  if (allowedHosts.size > 0 && !allowedHosts.has(url.hostname.toLowerCase())) {
    errors.push(`candidate_${field}_host_not_allowed:${vendor}:${policy}:${url.hostname}`);
  }
}

function buildCandidateCoverage(candidateRegistry = {}, lifecycleReport = {}) {
  const candidates = candidateRegistry?.candidates || {};
  let monitoredPolicySurfaceCount = 0;
  let manualReviewSurfaceCount = 0;
  const monitorCounts = {};

  for (const candidate of Object.values(candidates)) {
    for (const policy of Object.values(candidate?.policies || {})) {
      const monitor = String(policy?.monitor || "missing").trim() || "missing";
      monitorCounts[monitor] = Number(monitorCounts[monitor] || 0) + 1;
      if (monitor === "manual_review") manualReviewSurfaceCount += 1;
      else monitoredPolicySurfaceCount += 1;
    }
  }

  return {
    candidate_vendor_count: Object.keys(candidates).length,
    monitored_policy_surface_count: monitoredPolicySurfaceCount,
    manual_review_surface_count: manualReviewSurfaceCount,
    ready_for_review_vendor_count: Number(
      lifecycleReport?.totals?.candidates_ready_for_review || 0
    ),
    cohort_counts: countByCandidateMetadata(candidates, "cohort"),
    segment_counts: countByCandidateMetadata(candidates, "segment"),
    demand_tier_counts: countByCandidateMetadata(candidates, "demand_tier"),
    source_strategy_counts: countByCandidateMetadata(candidates, "source_strategy"),
    monitor_counts: monitorCounts,
  };
}

export function validatePolicyVendorCandidateRegistry(candidateRegistry = {}, admittedVendorIds = new Set()) {
  const errors = [];
  for (const [vendor, candidate] of Object.entries(candidateRegistry?.candidates || {})) {
    const admittedPolicies = Object.entries(candidate?.admitted_policies || {});
    if (admittedVendorIds.has(vendor) && admittedPolicies.length === 0) errors.push(`candidate_already_admitted:${vendor}`);
    for (const [policy, admission] of admittedPolicies) {
      if (!["refund", "cancel", "return", "trial"].includes(policy)
        || candidate?.policies?.[policy] || !String(admission?.scope || "").trim()
        || !/^docs\/reviews\/[a-z0-9-]+\.json$/.test(admission?.review_record || "")) {
        errors.push(`candidate_policy_admission_invalid:${vendor}:${policy}`);
      }
    }
    for (const key of REQUIRED_CANDIDATE_METADATA) {
      if (candidate?.[key] === undefined || String(candidate[key]).trim() === "") {
        errors.push(`candidate_metadata_missing:${vendor}:${key}`);
      }
    }
    const demandTier = Number(candidate?.demand_tier);
    if (candidate?.demand_tier !== undefined && ![1, 2, 3].includes(demandTier)) {
      errors.push(`candidate_demand_tier_invalid:${vendor}:${candidate.demand_tier}`);
    }
    const policies = Object.entries(candidate?.policies || {});
    if (policies.length === 0) errors.push(`candidate_policies_missing:${vendor}`);
    const allowedHosts = new Set(
      (Array.isArray(candidate?.allowed_hosts) ? candidate.allowed_hosts : [])
        .map((host) => String(host || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const hasMonitoredSource = policies.some(([, config]) => config?.monitor !== "manual_review");
    if (hasMonitoredSource && allowedHosts.size === 0) {
      errors.push(`candidate_allowed_hosts_missing:${vendor}`);
    }
    for (const [policy, config] of policies) {
      const monitor = String(config?.monitor || "").trim();
      if (!SUPPORTED_MONITORS.has(monitor)) {
        errors.push(`candidate_monitor_unsupported:${vendor}:${policy}:${monitor || "missing"}`);
      }
      if (monitor === "manual_review") {
        const reviewStatus = String(config?.review_status || "").trim();
        if (!new Set(["pending", "awaiting_maintainer_signoff", "approved", "rejected"]).has(reviewStatus)) {
          errors.push(`candidate_manual_review_status_invalid:${vendor}:${policy}:${reviewStatus || "missing"}`);
        }
        if (!String(config?.reason || "").trim()) {
          errors.push(`candidate_manual_review_reason_missing:${vendor}:${policy}`);
        }
        continue;
      }

      const policySubject = String(config?.policy_subject || "").trim();
      if (!SUPPORTED_POLICY_SUBJECTS.has(policySubject)) {
        errors.push(
          `candidate_policy_subject_invalid:${vendor}:${policy}:${policySubject || "missing"}`
        );
      }

      for (const field of ["fetch_url", "evidence_url"]) {
        const value = String(config?.[field] || "").trim();
        if (!value) {
          errors.push(`candidate_${field}_missing:${vendor}:${policy}`);
          continue;
        }
        validateCandidateUrl({ value, vendor, policy, field, allowedHosts, errors });
      }
      if (!Array.isArray(config?.required_terms) || config.required_terms.length === 0) {
        errors.push(`candidate_required_terms_missing:${vendor}:${policy}`);
      }
    }
  }
  return errors;
}

export function buildPolicyCoverageScorecard({
  rulebooks = {},
  sourceMaps = {},
  candidateRegistry = {},
  lifecycleReport = {},
  evidenceSnapshot = null,
  now = new Date(),
} = {}) {
  const admittedVendorIds = productionVendorIds(rulebooks);
  const candidateErrors = validatePolicyVendorCandidateRegistry(candidateRegistry, admittedVendorIds);
  for (const [vendor, candidate] of Object.entries(candidateRegistry?.candidates || {})) {
    for (const policy of Object.keys(candidate.admitted_policies || {})) {
      if (!rulebooks[policy]?.vendors?.[vendor]) candidateErrors.push(`candidate_policy_admission_missing_rule:${vendor}:${policy}`);
    }
    for (const policy of Object.keys(candidate.policies || {})) {
      if (rulebooks[policy]?.vendors?.[vendor]) candidateErrors.push(`candidate_policy_admission_overlap:${vendor}:${policy}`);
    }
  }
  if (candidateErrors.length > 0) {
    throw new Error(`policy_vendor_candidate_registry_invalid:${candidateErrors.join("|")}`);
  }

  const targets = {
    tracked_vendors: toFinitePositiveNumber(
      candidateRegistry?.targets?.tracked_vendors,
      DEFAULT_TARGETS.tracked_vendors
    ),
    admitted_vendors: toFinitePositiveNumber(
      candidateRegistry?.targets?.admitted_vendors,
      DEFAULT_TARGETS.admitted_vendors
    ),
    decision_ready_surfaces: toFinitePositiveNumber(
      candidateRegistry?.targets?.decision_ready_surfaces,
      DEFAULT_TARGETS.decision_ready_surfaces
    ),
  };
  const depth = buildPolicyDepth(rulebooks);
  const sources = buildSourceCoverage(sourceMaps);
  const candidates = buildCandidateCoverage(candidateRegistry, lifecycleReport);
  const trackedVendorCount = new Set([...admittedVendorIds, ...Object.keys(candidateRegistry.candidates || {})]).size;

  return {
    schema_version: "policy_coverage_scorecard_v1",
    generated_at_utc: new Date(now).toISOString(),
    counting_contract: {
      tracked: "distinct vendors across admitted and candidate policy surfaces",
      admitted: "vendors with at least one reviewed production policy surface, not blanket support for all policies",
      decision_ready: "configured production surfaces with deterministic or conditional decision_mode; not proof of current evidence or an automation-safe request",
      evidence_ready: "configured decision mode plus current evidence and active source; request context still required",
      candidates_are_supported: false,
    },
    targets,
    production: {
      admitted_vendor_count: admittedVendorIds.size,
      ...depth,
      ...sources,
      runtime_readiness: buildRuntimeReadiness({ rulebooks, sourceMaps, evidenceSnapshot, now }),
      lifecycle_counts: lifecycleReport?.totals?.lifecycle_counts || {},
    },
    candidates,
    network: {
      tracked_vendor_count: trackedVendorCount,
      tracked_target_progress_percent: percent(trackedVendorCount, targets.tracked_vendors),
      admitted_target_progress_percent: percent(admittedVendorIds.size, targets.admitted_vendors),
      decision_ready_target_progress_percent: percent(
        depth.decision_ready_surface_count,
        targets.decision_ready_surfaces
      ),
    },
  };
}

export function formatPolicyCoverageScorecardMarkdown(scorecard = {}) {
  const production = scorecard.production || {};
  const candidates = scorecard.candidates || {};
  const network = scorecard.network || {};
  const targets = scorecard.targets || {};
  const lines = [
    "# Policy Coverage Scorecard",
    "",
    `Generated UTC: ${scorecard.generated_at_utc || "unknown"}`,
    "",
    "## Network",
    "",
    `- Tracked vendors: ${network.tracked_vendor_count || 0} / ${targets.tracked_vendors || 0}`,
    `- Admitted vendors: ${production.admitted_vendor_count || 0} / ${targets.admitted_vendors || 0}`,
    `- Candidate vendors: ${candidates.candidate_vendor_count || 0}`,
    `- Candidates ready for human review: ${candidates.ready_for_review_vendor_count || 0}`,
    "",
    "## Decision depth",
    "",
    `- Configured production surfaces: ${production.configured_policy_surface_count || 0}`,
    `- Configured decision-capable surfaces (not current evidence): ${production.decision_ready_surface_count || 0} / ${targets.decision_ready_surfaces || 0}`,
    `- Review-only surfaces: ${production.review_only_surface_count || 0}`,
    `- Observed-offer surfaces: ${production.observed_offer_surface_count || 0}`,
    `- Current-evidence decision-capable surfaces: ${production.runtime_readiness?.evidence_ready_surface_count || 0}; request context is still required`,
    `- Retired policy sources: ${production.runtime_readiness?.retired_surface_count || 0}`,
    `- Human reviews due within 14 days: ${production.runtime_readiness?.reviews_due_soon_count || 0}`,
    `- Expired human reviews: ${production.runtime_readiness?.reviews_expired_count || 0}`,
    `- Missing/invalid human reviews: ${production.runtime_readiness?.reviews_missing_or_invalid_count || 0}`,
    `- Verification basis: ${production.runtime_readiness?.verification_basis || "not supplied"}`,
    "",
    "## Source coverage",
    "",
    `- Primary-source surfaces: ${production.primary_source_surface_count || 0}`,
    `- Unique primary source URLs: ${production.unique_primary_source_url_count || 0}`,
    `- Surfaces with backup sources: ${production.surfaces_with_backup_source_count || 0}`,
    "",
    "Candidates are tracked for burn-in only. They are not supported vendors and cannot be promoted automatically.",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}
