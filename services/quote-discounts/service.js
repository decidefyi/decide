import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { evaluateRulebookV1 } from '../../lib/rulebook-v1.js';
import verifier from '../../sdk/verifier.js';

const { canonicalJson, sha256Hex } = verifier;
const hash = value => sha256Hex(canonicalJson(value));
const clone = value => structuredClone(value);
export { QuoteDiscountError } from './domain.cjs';
import domain from './domain.cjs';
const { QuoteDiscountError, exact, ref, integer, validateProposal, validatePolicy, validateQuote, buildQuoteDiscountInput } = domain;
const fail = code => { throw new QuoteDiscountError(code); };

/** Local reference store. Not an OAuth provider or a production authorization server. */
export function createQuoteDiscountService({ enabled = false, filename = ':memory:', clock = Date.now, max_records_per_workspace = 1000 } = {}) {
  if (enabled !== true) fail('SERVICE_DISABLED');
  if (typeof filename !== 'string' || !filename || typeof clock !== 'function') fail('INVALID_CONFIGURATION');
  integer(max_records_per_workspace, 1, 10_000);
  const db = new DatabaseSync(filename, { timeout: 3000, allowExtension: false });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS members (
      workspace TEXT NOT NULL, principal TEXT NOT NULL, revision INTEGER NOT NULL,
      payload TEXT NOT NULL, PRIMARY KEY(workspace, principal));
    CREATE TABLE IF NOT EXISTS policies (
      workspace TEXT NOT NULL, id TEXT NOT NULL, epoch INTEGER NOT NULL,
      active INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(workspace, id));
    CREATE TABLE IF NOT EXISTS policy_versions (
      workspace TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL,
      content_hash TEXT NOT NULL, PRIMARY KEY(workspace, id, version));
    CREATE TABLE IF NOT EXISTS quotes (
      workspace TEXT NOT NULL, id TEXT NOT NULL, epoch INTEGER NOT NULL,
      payload TEXT NOT NULL, PRIMARY KEY(workspace, id));
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY, workspace TEXT NOT NULL, principal TEXT NOT NULL,
      request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, policy_id TEXT NOT NULL,
      policy_epoch INTEGER NOT NULL, quote_epoch INTEGER NOT NULL,
      grant_revision INTEGER NOT NULL, quote_hash TEXT NOT NULL,
      payload TEXT NOT NULL, UNIQUE(workspace, principal, request_id));
    CREATE TABLE IF NOT EXISTS claims (
      workspace TEXT NOT NULL, quote_id TEXT NOT NULL, quote_revision TEXT NOT NULL,
      action_hash TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(workspace, quote_id, quote_revision));
  `);
  function readClock() {
    let now; try { now = clock(); } catch { fail('CLOCK_INVALID'); }
    if (!Number.isSafeInteger(now) || now < 0) fail('CLOCK_INVALID');
    return now;
  }
  function atomic(perform) {
    try { db.exec('BEGIN IMMEDIATE'); } catch { fail('STORE_UNAVAILABLE'); }
    try { const result = perform(); db.exec('COMMIT'); return clone(result); }
    catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the original fail-closed error */ }
      if (error instanceof QuoteDiscountError) throw error;
      fail('STORE_UNAVAILABLE');
    }
  }
  function member(context, roles) {
    readClock();
    const row = db.prepare('SELECT * FROM members WHERE workspace=? AND principal=?').get(context.workspace_id, context.principal_id);
    if (!row) fail('UNAUTHENTICATED');
    const grant = JSON.parse(row.payload);
    if (grant.active !== true || !roles.includes(grant.role)) fail('FORBIDDEN');
    return { ...grant, revision: row.revision };
  }
  function permitted(grant, policyId) {
    if (grant.role !== 'owner' && !grant.policy_ids.includes(policyId)) fail('NOT_FOUND');
  }
  function current(context, grant, request) {
    const quoteRow = db.prepare('SELECT * FROM quotes WHERE workspace=? AND id=?').get(context.workspace_id, request.quote_id);
    if (!quoteRow) fail('NOT_FOUND');
    const quote = JSON.parse(quoteRow.payload); permitted(grant, quote.policy_id);
    const policyRow = db.prepare('SELECT * FROM policies WHERE workspace=? AND id=?').get(context.workspace_id, quote.policy_id);
    if (!policyRow || !policyRow.active) fail('POLICY_INACTIVE');
    const policy = JSON.parse(policyRow.payload), now = readClock();
    if (now < policy.valid_from_ms || now >= policy.valid_until_ms) fail('POLICY_NOT_EFFECTIVE');
    if (quote.revision !== request.quote_revision) fail('QUOTE_CHANGED');
    if (quote.status !== 'draft') fail('QUOTE_NOT_DRAFT');
    if (quote.currency !== policy.currency) fail('CURRENCY_MISMATCH');
    if (quote.captured_at_ms > now || now - quote.captured_at_ms >= policy.max_fact_age_ms) fail('FACTS_NOT_CURRENT');
    return { quoteRow, quote, policyRow, policy, now };
  }
  function ownedDecision(context, grant, id) {
    const row = db.prepare('SELECT * FROM decisions WHERE workspace=? AND id=?').get(context.workspace_id, id);
    if (!row) fail('NOT_FOUND');
    permitted(grant, row.policy_id); return row;
  }
  return {
    // Trusted integration/bootstrap control. Never expose through tools or a request body.
    provisionPrincipal(spec) {
      exact(spec, ['workspace_id', 'principal_id', 'role', 'policy_ids', 'active']);
      ref(spec.workspace_id); ref(spec.principal_id);
      if (!['owner', 'agent', 'executor'].includes(spec.role) || typeof spec.active !== 'boolean' || !Array.isArray(spec.policy_ids) || spec.policy_ids.length > 32) fail('INVALID_REQUEST');
      spec.policy_ids.forEach(ref); spec = clone(spec);
      return atomic(() => {
        const before = db.prepare('SELECT revision FROM members WHERE workspace=? AND principal=?').get(spec.workspace_id, spec.principal_id);
        const revision = (before?.revision || 0) + 1;
        db.prepare('INSERT INTO members VALUES(?,?,?,?) ON CONFLICT(workspace,principal) DO UPDATE SET revision=excluded.revision,payload=excluded.payload')
          .run(spec.workspace_id, spec.principal_id, revision, JSON.stringify(spec));
        return { revision };
      });
    },
    client(context) {
      exact(context, ['workspace_id', 'principal_id']); ref(context.workspace_id); ref(context.principal_id);
      const trusted = clone(context);
      return {
        approvePolicy(policy) {
          validatePolicy(policy); policy = clone(policy);
          return atomic(() => {
            member(trusted, ['owner']);
            const version = db.prepare('SELECT content_hash FROM policy_versions WHERE workspace=? AND id=? AND version=?').get(trusted.workspace_id, policy.policy_id, policy.version);
            if (version && version.content_hash !== hash(policy)) fail('POLICY_VERSION_CONFLICT');
            if (!version) db.prepare('INSERT INTO policy_versions VALUES(?,?,?,?)').run(trusted.workspace_id, policy.policy_id, policy.version, hash(policy));
            const before = db.prepare('SELECT epoch FROM policies WHERE workspace=? AND id=?').get(trusted.workspace_id, policy.policy_id);
            db.prepare('INSERT INTO policies VALUES(?,?,?,?,?) ON CONFLICT(workspace,id) DO UPDATE SET epoch=excluded.epoch,active=1,payload=excluded.payload')
              .run(trusted.workspace_id, policy.policy_id, (before?.epoch || 0) + 1, 1, JSON.stringify(policy));
            return { policy_id: policy.policy_id, version: policy.version };
          });
        },
        putQuote(quote) {
          validateQuote(quote); quote = clone(quote);
          return atomic(() => {
            member(trusted, ['owner']);
            const before = db.prepare('SELECT epoch FROM quotes WHERE workspace=? AND id=?').get(trusted.workspace_id, quote.quote_id);
            db.prepare('INSERT INTO quotes VALUES(?,?,?,?) ON CONFLICT(workspace,id) DO UPDATE SET epoch=excluded.epoch,payload=excluded.payload')
              .run(trusted.workspace_id, quote.quote_id, (before?.epoch || 0) + 1, JSON.stringify(quote));
            return { quote_id: quote.quote_id, revision: quote.revision };
          });
        },
        suspendPolicy(request) {
          exact(request, ['policy_id']); ref(request.policy_id);
          return atomic(() => {
            member(trusted, ['owner']);
            const result = db.prepare('UPDATE policies SET active=0,epoch=epoch+1 WHERE workspace=? AND id=?').run(trusted.workspace_id, request.policy_id);
            if (!result.changes) fail('NOT_FOUND');
            return { policy_id: request.policy_id, active: false };
          });
        },
        checkDiscount(request) {
          validateProposal(request); request = clone(request);
          return atomic(() => {
            const grant = member(trusted, ['agent', 'owner']);
            const { quoteRow, quote, policyRow, policy, now } = current(trusted, grant, request);
            const fingerprint = hash(request);
            const prior = db.prepare('SELECT * FROM decisions WHERE workspace=? AND principal=? AND request_id=?')
              .get(trusted.workspace_id, trusted.principal_id, request.request_id);
            if (prior) {
              if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
              return JSON.parse(prior.payload);
            }
            const count = db.prepare('SELECT COUNT(*) AS total FROM decisions WHERE workspace=?').get(trusted.workspace_id).total;
            if (count >= max_records_per_workspace) fail('RECORD_LIMIT_REACHED');
            const { input, amounts: values } = buildQuoteDiscountInput({ policy, quote, proposal: request });
            const evaluation = evaluateRulebookV1({ rulebook: input.rulebook, inputs: input.context.inputs, bindingMode: input.binding_mode });
            if (!evaluation.ok) fail('RUNTIME_REJECTED');
            const runtime = evaluation.result;
            const runtimeEvidence = Object.fromEntries(['status', 'engine', 'evaluator_version', 'rulebook_contract', 'runtime_binding', 'verdict', 'application_verdict', 'action', 'reason_code', 'matched_rule_id', 'policy_hash', 'input_hash'].map(key => [key, runtime[key]]));
            const record = {
              schema_version: 'quote_discount_decision_v1', decision_id: `qdd_${randomUUID()}`,
              ...request, currency: quote.currency, ...values,
              policy_id: policy.policy_id, policy_version: policy.version, policy_hash: runtime.policy_hash,
              input_hash: runtime.input_hash, verdict: runtime.verdict, reason_code: runtime.reason_code,
              checked_at_ms: now, expires_at_ms: Math.min(now + policy.decision_ttl_ms, quote.captured_at_ms + policy.max_fact_age_ms, policy.valid_until_ms),
              execution_authority: 'none', runtime: runtimeEvidence,
            };
            db.prepare('INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
              record.decision_id, trusted.workspace_id, trusted.principal_id, request.request_id,
              fingerprint, policy.policy_id, policyRow.epoch, quoteRow.epoch, grant.revision, hash(quote), JSON.stringify(record));
            return record;
          });
        },
        getDecision(request) {
          exact(request, ['decision_id']); ref(request.decision_id);
          return atomic(() => JSON.parse(ownedDecision(trusted, member(trusted, ['agent', 'owner', 'executor']), request.decision_id).payload));
        },
        consumeApproval(request) {
          exact(request, ['decision_id', 'quote_id', 'quote_revision', 'discount_bps', 'request_id']);
          ref(request.decision_id);
          const proposal = { quote_id: request.quote_id, quote_revision: request.quote_revision, discount_bps: request.discount_bps, request_id: request.request_id };
          validateProposal(proposal);
          return atomic(() => {
            const executor = member(trusted, ['executor']);
            const row = ownedDecision(trusted, executor, request.decision_id);
            const record = JSON.parse(row.payload);
            if (row.fingerprint !== hash(proposal)) fail('ACTION_MISMATCH');
            const requester = member({ workspace_id: trusted.workspace_id, principal_id: row.principal }, ['agent', 'owner']);
            permitted(requester, row.policy_id);
            if (requester.revision !== row.grant_revision) fail('AUTHORITY_CHANGED');
            const { quoteRow, quote, policyRow, now } = current(trusted, executor, proposal);
            if (policyRow.epoch !== row.policy_epoch || quoteRow.epoch !== row.quote_epoch || hash(quote) !== row.quote_hash) fail('AUTHORITY_CHANGED');
            if (now < record.checked_at_ms || now >= record.expires_at_ms) fail('DECISION_EXPIRED');
            if (record.verdict !== 'yes' || record.runtime.action !== 'approve_discount') fail('DECISION_NOT_ALLOWING');
            const actionHash = hash({ quote_id: record.quote_id, quote_revision: record.quote_revision, discount_bps: record.discount_bps, currency: record.currency, discount_minor: record.discount_minor, net_amount_minor: record.net_amount_minor });
            const before = db.prepare('SELECT * FROM claims WHERE workspace=? AND quote_id=? AND quote_revision=?')
              .get(trusted.workspace_id, record.quote_id, record.quote_revision);
            if (before) {
              if (before.action_hash !== actionHash) fail('EXECUTION_CONFLICT');
              return { ...JSON.parse(before.payload), newly_claimed: false };
            }
            const claim = {
              schema_version: 'quote_discount_claim_v1', claim_id: `qdc_${randomUUID()}`,
              decision_id: record.decision_id, quote_id: record.quote_id, quote_revision: record.quote_revision,
              currency: record.currency, discount_minor: record.discount_minor, net_amount_minor: record.net_amount_minor,
              claimed_at_ms: now, execution_authority: 'application_gate_only', newly_claimed: true,
            };
            db.prepare('INSERT INTO claims VALUES(?,?,?,?,?)').run(trusted.workspace_id, record.quote_id, record.quote_revision, actionHash, JSON.stringify(claim));
            return claim;
          });
        },
      };
    },
    close() { db.close(); },
  };
}
