const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluatePolicyFreshness({
  policy,
  rulesVersion,
  lastChecked,
  lastVerifiedUtc,
  now = new Date(),
  maxAgeDays = 90,
} = {}) {
  const verifiedAt = parseDate(lastVerifiedUtc);
  const currentTime = parseDate(now) || new Date();
  const ageDays = verifiedAt
    ? Math.max(0, Math.floor((currentTime.getTime() - verifiedAt.getTime()) / DAY_MS))
    : null;
  const stale = !verifiedAt || ageDays > maxAgeDays;

  return {
    policy: String(policy || "").trim(),
    rules_version: String(rulesVersion || "").trim(),
    source_last_checked: String(lastChecked || "").trim(),
    source_last_verified_utc: String(lastVerifiedUtc || "").trim(),
    verified_age_days: ageDays,
    max_verified_age_days: maxAgeDays,
    status: stale ? "stale" : "current",
    stale,
    reason: !verifiedAt ? "missing_last_verified" : stale ? "human_verification_expired" : "within_verification_window",
  };
}

export function buildPolicyFreshnessReport({
  policies = [],
  now = new Date(),
  maxAgeDays = 90,
} = {}) {
  const evaluated = policies.map((entry) => evaluatePolicyFreshness({
    ...entry,
    now,
    maxAgeDays,
  }));
  const stalePolicies = evaluated.filter((entry) => entry.stale);

  return {
    schema_version: "policy_rule_freshness_v1",
    generated_at_utc: (parseDate(now) || new Date()).toISOString(),
    status: stalePolicies.length > 0 ? "stale" : "current",
    monitoring_mutates_rulebook: false,
    policy_count: evaluated.length,
    stale_policy_count: stalePolicies.length,
    policies: evaluated,
    action_required: stalePolicies.map((entry) => `review_and_version:${entry.policy}`),
  };
}
