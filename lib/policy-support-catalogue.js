import { readPolicyEvidenceCatalog } from './policy-evidence-snapshot.js';
import { evaluatePolicyEvidence } from './policy-runtime-evidence.js';

const CATALOGUE = readPolicyEvidenceCatalog();
const DAY = 86400000;
const STATUSES = ['supported', 'review_only', 'observed_offer', 'retired', 'degraded'];

// A public capability catalogue, not an authorization or policy decision.
export function buildPolicySupportCatalogue({ snapshot = null, now = new Date(), policy, vendor } = {}) {
  const at = new Date(now).getTime();
  if (!Number.isFinite(at)) throw new TypeError('Invalid catalogue date');
  const rows = Object.entries(CATALOGUE).flatMap(([family, config]) => Object.entries(config.vendors).map(([id, source]) => {
    const evidence = evaluatePolicyEvidence({ policy: family, vendor: id, snapshot, now,
      sourceHash: config.source_hash, policyVersion: config.policy_version, sourceUrl: source.url,
      verifiedAt: source.verified_at, monitoringStatus: source.monitoring_status });
    const monitored = snapshot?.policies?.find(row => row.policy === family && row.vendor === id);
    const retired = source.monitoring_status === 'retired';
    const mode = source.decision_mode || 'unknown';
    const support = retired ? 'retired' : mode === 'review_only' ? 'review_only'
      : mode === 'observed' ? 'observed_offer'
      : ['deterministic', 'conditional'].includes(mode) && evidence.current ? 'supported' : 'degraded';
    const verified = Date.parse(source.verified_at);
    const validReview = Number.isFinite(verified) && verified <= at;
    const due = validReview ? verified + 90 * DAY : null;
    const failures = Number.isSafeInteger(monitored?.consecutive_fetch_failures) && monitored.consecutive_fetch_failures >= 0
      ? monitored.consecutive_fetch_failures : null;
    const failedCheck = ['fetch_failed', 'fetch_blocked', 'quality_gate_held'].includes(monitored?.status);
    const sourceAge = (at - Date.parse(monitored?.checked_at)) / DAY;
    const persistent = !retired && failedCheck && ((failures !== null && failures >= 7)
      || (Number.isFinite(sourceAge) && sourceAge >= (family === 'trial' ? 7 : 30)));
    return { policy: family, vendor: id, scope: { region: 'US', plan: 'individual' },
      decision_mode: mode, support_status: support, automation_supported: support === 'supported',
      request_context_required: true, reason: retired ? source.retirement_reason : source.review_reason || evidence.reason,
      source_url: source.url, policy_version: config.policy_version, source_hash: config.source_hash,
      verified_at: source.verified_at || null, review_due_at: due === null ? null : new Date(due).toISOString(),
      review_status: retired ? 'retired' : !validReview ? 'missing_or_invalid' : at >= due ? 'expired' : due - at <= 14 * DAY ? 'due_soon' : 'current',
      evidence_status: evidence.status, evidence_reason: evidence.reason, evidence_valid_until: evidence.valid_until || null,
      monitor_status: monitored?.status || 'unknown', checked_at: monitored?.checked_at || null,
      consecutive_fetch_failures: failures, retirement_review_required: persistent,
      pending_change: !retired && Boolean(monitored && (monitored.flags?.some(flag => flag !== 'flaky_source')
        || Date.parse(monitored.last_confirmed_change_at) > verified)),
    };
  })).filter(row => (!policy || row.policy === policy) && (!vendor || row.vendor === vendor))
    .sort((a, b) => `${a.policy}:${a.vendor}`.localeCompare(`${b.policy}:${b.vendor}`));
  if (rows.length > 1000) throw new Error('Catalogue exceeds bounded response size');
  return { schema_version: 'policy_support_catalogue_v1', generated_at: new Date(at).toISOString(),
    product: 'decide_policy_notaries', execution_authority: 'none',
    verification_basis: 'server_owned_catalogue_and_validated_monitor_snapshot_not_a_live_provider_probe',
    evidence_status: snapshot ? 'available' : 'unavailable', evidence_generated_at: snapshot?.generated_at || null,
    snapshot_hash: snapshot?.snapshot_hash || null,
    filters: { policy: policy || null, vendor: vendor || null }, total: rows.length,
    summary: { ...Object.fromEntries(STATUSES.map(status => [status, rows.filter(row => row.support_status === status).length])),
      reviews_due_soon: rows.filter(row => row.review_status === 'due_soon').length,
      reviews_expired: rows.filter(row => row.review_status === 'expired').length,
      reviews_missing_or_invalid: rows.filter(row => row.review_status === 'missing_or_invalid').length,
      pending_changes: snapshot ? rows.filter(row => row.pending_change).length : null,
      retirement_review: snapshot ? rows.filter(row => row.retirement_review_required).length : null }, rows };
}
