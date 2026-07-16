export const POLICY_REVIEW_STATUSES = Object.freeze([
  "needs_followup",
  "reviewed_no_rule_change",
  "rulebook_updated",
  "dismissed_false_signal",
]);

function requiredString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function buildPolicyReviewUpdate({
  eventId,
  status,
  reviewedBy,
  note,
  rulebookVersion = "",
  now = new Date(),
} = {}) {
  const normalizedStatus = requiredString(status, "review status");
  if (!POLICY_REVIEW_STATUSES.includes(normalizedStatus)) {
    throw new Error(`review status must be one of: ${POLICY_REVIEW_STATUSES.join(", ")}`);
  }

  const normalizedVersion = String(rulebookVersion || "").trim();
  if (normalizedStatus === "rulebook_updated" && !normalizedVersion) {
    throw new Error("rulebook version is required when review status is rulebook_updated");
  }

  const reviewedAt = new Date(now);
  if (Number.isNaN(reviewedAt.getTime())) throw new Error("review timestamp is invalid");

  return {
    event_id: requiredString(eventId, "event id"),
    review_status: normalizedStatus,
    reviewed_at_utc: reviewedAt.toISOString(),
    reviewed_by: requiredString(reviewedBy, "reviewed by"),
    review_note: requiredString(note, "review note"),
    rulebook_updated: normalizedStatus === "rulebook_updated",
    rulebook_version_after: normalizedVersion,
    updated_at_utc: reviewedAt.toISOString(),
  };
}
