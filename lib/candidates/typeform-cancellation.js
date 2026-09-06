import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { validateJsonSchemaSubset } from "../json-schema-subset.js";
import { canonicalJson } from "../policy-request-binding.cjs";
import { evaluateRulebookV1 } from "../rulebook-v1.js";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rulebook = readJson("../../rules/candidates/typeform-cancellation-v1.json");
const requestSchema = readJson("../../rules/candidates/typeform-cancellation-request-v1.schema.json");
const research = readJson("../../docs/reviews/typeform-cancellation-candidate-20260906.json");
const digest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const researchHash = digest(research);

function strictUtcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical ? parsed : NaN;
}

function researchEvidence(snapshot, evaluatedTime) {
  // This identity pins a local research bundle, not a production evidence grant.
  if (!snapshot || digest(snapshot) !== researchHash) {
    return { status: "unavailable", snapshot_fresh: false, production_evidence: false, reason: "research_bundle_mismatch_or_missing" };
  }
  const checkedTimes = snapshot.sources.map(source => strictUtcTimestamp(source.checked_at));
  const validUntil = Math.min(...checkedTimes) + 72 * 3600000;
  const validTimes = Number.isFinite(evaluatedTime)
    && checkedTimes.every(time => Number.isFinite(time) && time <= evaluatedTime);
  const snapshotFresh = validTimes && evaluatedTime < validUntil;
  return {
    status: !validTimes ? "unavailable" : snapshotFresh ? "snapshot_fresh" : "expired",
    snapshot_fresh: snapshotFresh,
    production_evidence: false,
    assessed_by: snapshot.assessed_by,
    human_approval: false,
    snapshot_hash: researchHash,
    source_urls: snapshot.sources.map(source => source.url),
    valid_until: Number.isFinite(validUntil) ? new Date(validUntil).toISOString() : null,
  };
}

// Local research preview only. This module is not registered with REST, MCP or
// the trusted adapter registry and must not grant permission to execute.
export function previewTypeformCancellation(request, { now = new Date(), researchSnapshot = research } = {}) {
  const validationErrors = validateJsonSchemaSubset(request, requestSchema, { path: "request" });
  const requestHash = digest(request ?? null);
  const evaluatedTime = new Date(now).getTime();
  const observedTime = strictUtcTimestamp(request?.account_observed_at);
  const periodEnd = strictUtcTimestamp(request?.current_period_end);
  const maximumRemainingDays = request?.billing_cadence === "annual" ? 367 : 32;
  const accountContextCurrent = Number.isFinite(evaluatedTime)
    && observedTime <= evaluatedTime && evaluatedTime - observedTime < 15 * 60000
    && periodEnd > evaluatedTime && periodEnd - evaluatedTime <= maximumRemainingDays * 86400000;
  const evidence = researchEvidence(researchSnapshot, evaluatedTime);
  const evaluation = evaluateRulebookV1({
    rulebook,
    inputs: {
      request: validationErrors.length ? {} : request,
      request_valid: validationErrors.length === 0,
      account_context_current: accountContextCurrent,
      research_snapshot_fresh: evidence.snapshot_fresh,
      candidate_research_digest: evidence.snapshot_hash || "",
      evaluated_at: Number.isFinite(evaluatedTime) ? new Date(evaluatedTime).toISOString() : "",
      candidate_request_digest: requestHash,
    },
  });
  if (!evaluation.ok) throw new Error(`Invalid Typeform candidate rulebook: ${evaluation.error}`);
  const result = evaluation.result;
  return {
    schema_version: "typeform_cancellation_candidate_preview_v1",
    authority: "advisory_only",
    candidate_status: "not_admitted",
    production_verdict: false,
    automation_safe: false,
    decision: result.verdict,
    verdict: result.application_verdict,
    action: result.action,
    reason_code: result.reason_code,
    effective_at: result.verdict === "yes" ? request.current_period_end : null,
    refund_eligibility: "not_evaluated",
    cancellation_confirmed: false,
    execution_performed: false,
    request_hash: requestHash,
    decision_input_hash: result.input_hash,
    rulebook: result.rulebook,
    evaluated_at: Number.isFinite(evaluatedTime) ? new Date(evaluatedTime).toISOString() : null,
    validation_errors: validationErrors,
    research_evidence: evidence,
  };
}
