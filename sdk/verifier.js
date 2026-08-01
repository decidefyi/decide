const crypto = require('crypto');

const DECISION_PROTOCOL_VERSION = 'decision_protocol_v1';
const DECISION_RECORD_VERSION = 'decision_record_v1';
const DECISION_PACKET_VERSION = 'decision_packet_v1';
const DECISION_CHAIN_VERSION = 'decision_chain_v1';
const DECIDE_APPLICATION_BINDING_VERSION = 'decide_application_binding_v1';
const MERKLE_STRATEGY = 'rolling_sha256_pair_v1';
const MAX_DECISION_ID_LENGTH = 600;
const APPLICATION_BINDING_REQUIRED_MATERIAL = Object.freeze([
  'rulebook_contract',
  'runtime_binding',
  'verdict',
  'application_verdict',
  'action',
  'reason_code',
  'matched_rule_id',
  'rulebook.hash',
  'input_hash',
  'rulebook_attestation.bundle_hash'
]);
const APPLICATION_BINDING_PROHIBITED_CLAIMS = Object.freeze([
  'llm_output_is_binding_production_verdict',
  'customer_executable_code_runs_as_rulebook_v1',
  'action_executes_before_decision_material_is_captured'
]);

function cleanText(value, max = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map((item) => sortDeep(item));
  if (!isPlainObject(value)) return value;
  return Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      acc[key] = sortDeep(value[key]);
      return acc;
    }, {});
}

function canonicalJson(value) {
  try {
    return JSON.stringify(sortDeep(value));
  } catch {
    return JSON.stringify({ invalid_payload: true });
  }
}

function sha256Hex(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', String(secret || '')).update(String(value || ''), 'utf8').digest('hex');
}

function normalizePem(value, max = 10000) {
  return cleanText(String(value || '').replace(/\\n/g, '\n'), max);
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  if (!text) return Buffer.alloc(0);
  const padding = (4 - (text.length % 4 || 4)) % 4;
  return Buffer.from(`${text}${'='.repeat(padding)}`, 'base64');
}

function buildReceiptSignaturePayload({ decisionId, recordHash, receiptHash, keyId }) {
  return canonicalJson({
    decision_id: cleanText(String(decisionId || ''), MAX_DECISION_ID_LENGTH),
    key_id: cleanText(String(keyId || ''), 120),
    receipt_hash: cleanText(String(receiptHash || ''), 200),
    record_hash: cleanText(String(recordHash || ''), 200)
  });
}

function verifyEd25519Signature({ signature = '', publicKey = '', payload = '' } = {}) {
  const normalizedSignature = cleanText(String(signature || ''), 2000).replace(/^ed25519:/i, '');
  const normalizedPublicKey = normalizePem(publicKey, 12000);
  if (!normalizedSignature || !normalizedPublicKey || !payload) return null;
  try {
    return crypto.verify(null, Buffer.from(payload, 'utf8'), normalizedPublicKey, fromBase64Url(normalizedSignature));
  } catch {
    return false;
  }
}

function signHmacDecisionReceipt({ decisionId, recordHash, receiptHash, keyId = '', hmacSecret = '', env = process.env } = {}) {
  const secret = cleanText(String(hmacSecret || env.DECIDE_RECEIPT_SIGNING_SECRET || env.DECIDE_RECEIPT_HMAC_SECRET || ''), 4000);
  if (!secret) return null;
  const resolvedKeyId =
    cleanText(String(keyId || env.DECIDE_RECEIPT_KEY_ID || env.DECIDE_RECEIPT_SIGNING_KEY_ID || ''), 120) ||
    'decide_receipt_hmac_v1';
  const payload = buildReceiptSignaturePayload({
    decisionId,
    recordHash,
    receiptHash,
    keyId: resolvedKeyId
  });
  return {
    receipt_key_id: resolvedKeyId,
    receipt_signature: `hmac-sha256:${hmacSha256Hex(secret, payload)}`,
    receipt_signature_algorithm: 'hmac-sha256'
  };
}

function normalizeVerdict(value) {
  const text = cleanText(String(value || ''), 120).toLowerCase();
  if (!text) return '';
  if (['yes', 'approved', 'approve', 'allow', 'allowed', 'pass', 'passed', 'proceed', 'execute'].includes(text)) {
    return 'yes';
  }
  if (['no', 'denied', 'deny', 'block', 'blocked', 'fail', 'failed', 'reject', 'rejected'].includes(text)) {
    return 'no';
  }
  if (['review', 'unclear', 'unknown', 'tie', 'pending', 'manual_review', 'escalate', 'hold'].includes(text)) {
    return 'review';
  }
  return text;
}

function normalizeRecordForHash(record) {
  const source = isPlainObject(record) ? record : {};
  const evidence = Array.isArray(source.evidence)
    ? source.evidence.map((item) => cleanText(String(item || ''), 180)).filter(Boolean).slice(0, 32)
    : [];
  const actionBinding = isPlainObject(source.action_binding) ? sortDeep(source.action_binding) : {};
  const evidenceManifest = isPlainObject(source.evidence_manifest)
    ? {
        codes: Array.isArray(source.evidence_manifest.codes) ? source.evidence_manifest.codes.slice(0, 32) : evidence,
        sources: Array.isArray(source.evidence_manifest.sources) ? source.evidence_manifest.sources.slice(0, 16) : []
      }
    : { codes: evidence, sources: [] };
  const policyBundle = isPlainObject(source.policy_bundle)
    ? sortDeep({
        id: cleanText(String(source.policy_bundle.id || source.policy_bundle.policy_id || source.policy_bundle.policyId || ''), 160),
        version: cleanText(String(source.policy_bundle.version || source.policy_bundle.policy_version || source.policy_bundle.policyVersion || ''), 160),
        hash: cleanText(String(source.policy_bundle.hash || source.policy_bundle.policy_hash || source.policy_bundle.policyHash || ''), 200),
        hash_algorithm: cleanText(String(source.policy_bundle.hash_algorithm || source.policy_bundle.hashAlgorithm || 'sha256'), 80),
        canonicalization: cleanText(String(source.policy_bundle.canonicalization || 'json.sort_deep.v1'), 80),
        source: cleanText(String(source.policy_bundle.source || source.policy_bundle.url || source.policy_bundle.href || ''), 700)
      })
    : {};

  const normalized = {
    decision_protocol_version: cleanText(String(source.decision_protocol_version || source.decisionProtocolVersion || ''), 80),
    decision_record_version: cleanText(String(source.decision_record_version || ''), 80),
    decision_id: cleanText(String(source.decision_id || source.decisionId || ''), MAX_DECISION_ID_LENGTH),
    request_id: cleanText(String(source.request_id || source.requestId || ''), 160),
    idempotency_key: cleanText(String(source.idempotency_key || source.idempotencyKey || ''), 300),
    verdict: normalizeVerdict(source.verdict),
    action: cleanText(String(source.action || ''), 140),
    action_binding: actionBinding,
    evidence,
    evidence_manifest: sortDeep(evidenceManifest),
    policy_id: cleanText(String(source.policy_id || source.policyId || ''), 160),
    policy_version: cleanText(String(source.policy_version || source.policyVersion || ''), 160),
    policy_hash: cleanText(String(source.policy_hash || source.policyHash || ''), 200),
    input_hash: cleanText(String(source.input_hash || source.inputHash || ''), 200),
    output_hash: cleanText(String(source.output_hash || source.outputHash || ''), 200),
    created_at: cleanText(String(source.created_at || source.createdAt || ''), 80),
    replay_url: cleanText(String(source.replay_url || source.replayUrl || source.replay || ''), 800),
    verify_url: cleanText(String(source.verify_url || source.verifyUrl || ''), 800)
  };
  const policyBundleHash = cleanText(String(source.policy_bundle_hash || source.policyBundleHash || policyBundle.hash || ''), 200);
  const compactPolicyBundle = Object.fromEntries(Object.entries(policyBundle).filter(([, value]) => Boolean(value)));
  if (policyBundleHash) normalized.policy_bundle_hash = policyBundleHash;
  if (Object.keys(compactPolicyBundle).length) normalized.policy_bundle = compactPolicyBundle;
  Object.assign(
    normalized,
    compactObject({
      application_verdict: cleanText(String(source.application_verdict || ''), 160),
      reason_code: cleanText(String(source.reason_code || ''), 160),
      matched_rule_id: source.matched_rule_id,
      rulebook: isPlainObject(source.rulebook) ? sortDeep(source.rulebook) : null,
      rulebook_contract: isPlainObject(source.rulebook_contract)
        ? sortDeep(source.rulebook_contract)
        : null,
      evaluator_version: cleanText(String(source.evaluator_version || ''), 160),
      runtime_binding: isPlainObject(source.runtime_binding)
        ? sortDeep(source.runtime_binding)
        : null,
      rulebook_registry: isPlainObject(source.rulebook_registry)
        ? sortDeep(source.rulebook_registry)
        : null,
      rulebook_attestation: isPlainObject(source.rulebook_attestation)
        ? sortDeep(source.rulebook_attestation)
        : null,
      trusted_adapter: isPlainObject(source.trusted_adapter)
        ? sortDeep(source.trusted_adapter)
        : null,
      adapter_facts: isPlainObject(source.adapter_facts) ? sortDeep(source.adapter_facts) : null
    })
  );
  return normalized;
}

function computeRecordHash(record) {
  return sha256Hex(canonicalJson(normalizeRecordForHash(record)));
}

function computeReceiptHash(record, recordHash) {
  const normalized = normalizeRecordForHash(record);
  const receiptPayload = {
    decision_record_version: normalized.decision_record_version,
    decision_id: normalized.decision_id,
    record_hash: cleanText(String(recordHash || ''), 200),
    input_hash: normalized.input_hash,
    output_hash: normalized.output_hash,
    policy_hash: normalized.policy_hash,
    action_binding_hash: sha256Hex(canonicalJson(normalized.action_binding)),
    evidence_manifest_hash: sha256Hex(canonicalJson(normalized.evidence_manifest))
  };
  if (normalized.policy_bundle_hash) receiptPayload.policy_bundle_hash = normalized.policy_bundle_hash;
  return sha256Hex(canonicalJson(receiptPayload));
}

function compactObject(source) {
  if (!isPlainObject(source)) return {};
  const compact = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;
    if (isPlainObject(value)) {
      const nested = compactObject(value);
      if (Object.keys(nested).length) compact[key] = nested;
      continue;
    }
    if (Array.isArray(value)) {
      const list = value
        .filter((item) => item !== undefined && item !== null && item !== '')
        .map((item) => (isPlainObject(item) ? compactObject(item) : item))
        .filter((item) => !(isPlainObject(item) && !Object.keys(item).length));
      if (list.length) compact[key] = list;
      continue;
    }
    compact[key] = value;
  }
  return compact;
}

function bindingCheckKey(materialPath) {
  return String(materialPath || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

function readPath(source, materialPath) {
  if (!isPlainObject(source) || !materialPath) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, materialPath)) return source[materialPath];
  let cursor = source;
  for (const part of String(materialPath).split('.')) {
    if (!isPlainObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function materialPresent(value) {
  if (value === undefined || value === null) return false;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return cleanText(String(value), 1000).length > 0;
}

function uniqueObjects(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!isPlainObject(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function applicationBindingMaterialCandidates(source) {
  if (!isPlainObject(source)) return [];
  return uniqueObjects([
    source.decision_material,
    source.application_binding_material,
    source.application_binding?.decision_material,
    source.decision_record,
    source.record,
    source.decision,
    pickDecisionRecordFromPacket(source),
    source
  ]);
}

function resolveApplicationBindingMaterial(source, materialPath) {
  for (const candidate of applicationBindingMaterialCandidates(source)) {
    const value = readPath(candidate, materialPath);
    if (materialPresent(value)) return { value, source: candidate };
  }
  return { value: undefined, source: null };
}

function collectApplicationClaims(source) {
  if (!isPlainObject(source)) return [];
  const values = [
    source.claims,
    source.application_claims,
    source.application_binding?.claims,
    source.application_binding_claims
  ];
  return values
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((value) => cleanText(String(isPlainObject(value) ? value.claim || value.type || '' : value), 200))
    .filter(Boolean);
}

function verifyApplicationBinding(source = {}) {
  const checks = {};
  const materialPaths = {};
  const missing = [];

  for (const material of APPLICATION_BINDING_REQUIRED_MATERIAL) {
    const { value } = resolveApplicationBindingMaterial(source, material);
    const present = materialPresent(value);
    checks[bindingCheckKey(material)] = present;
    if (present) materialPaths[material] = true;
    else missing.push(material);
  }

  const explicitContractVersion =
    readPath(source, 'application_binding.contract_version') || readPath(source, 'contract_version');
  checks.contract_version = explicitContractVersion
    ? explicitContractVersion === DECIDE_APPLICATION_BINDING_VERSION
    : null;

  const explicitMustBindBeforeAction =
    readPath(source, 'application_binding.must_bind_before_action') ?? readPath(source, 'must_bind_before_action');
  checks.must_bind_before_action =
    explicitMustBindBeforeAction === undefined || explicitMustBindBeforeAction === null
      ? null
      : explicitMustBindBeforeAction === true;

  const claims = collectApplicationClaims(source);
  const prohibitedClaims = claims.filter((claim) => APPLICATION_BINDING_PROHIBITED_CLAIMS.includes(claim));
  checks.no_prohibited_claims = prohibitedClaims.length === 0;

  const factSource = materialPresent(resolveApplicationBindingMaterial(source, 'adapter_facts').value)
    ? 'adapter_facts'
    : materialPresent(resolveApplicationBindingMaterial(source, 'context.inputs').value)
      ? 'context.inputs'
      : null;

  const bindingChecks = Object.values(checks).filter((value) => value !== null);
  const verified = missing.length === 0 && bindingChecks.every(Boolean);

  return {
    ok: verified,
    verified,
    contract_version: DECIDE_APPLICATION_BINDING_VERSION,
    required_decision_material: [...APPLICATION_BINDING_REQUIRED_MATERIAL],
    accepted_fact_sources: ['context.inputs', 'adapter_facts'],
    fact_source: factSource,
    missing,
    prohibited_claims: prohibitedClaims,
    checks,
    actual: {
      material_present: materialPaths,
      contract_version: explicitContractVersion || null,
      must_bind_before_action: explicitMustBindBeforeAction ?? null
    }
  };
}

function normalizeExecutionForHash(record) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    decision_protocol_version: source.decision_protocol_version,
    decision_execution_version: source.decision_execution_version,
    execution_receipt_id: source.execution_receipt_id,
    decision_id: source.decision_id,
    idempotency_key: source.idempotency_key,
    execution_status: source.execution_status,
    execution_result: source.execution_result,
    action_taken: source.action_taken,
    target_system: source.target_system,
    target_object_id: source.target_object_id,
    mutation: source.mutation,
    external_ref: source.external_ref,
    execution_id: source.execution_id,
    executor: source.executor,
    decision_record_hash: source.decision_record_hash,
    decision_receipt_hash: source.decision_receipt_hash,
    decision_verdict: source.decision_verdict,
    decision_action: source.decision_action,
    policy_id: source.policy_id,
    policy_version: source.policy_version,
    policy_bundle_hash: source.policy_bundle_hash,
    action_binding: source.action_binding,
    action_binding_hash: source.action_binding_hash,
    action_binding_match: source.action_binding_match,
    state_before_hash: source.state_before_hash,
    state_after_hash: source.state_after_hash,
    state_before_ref: source.state_before_ref,
    state_after_ref: source.state_after_ref,
    evidence_refs: source.evidence_refs,
    execution_input_hash: source.execution_input_hash,
    executed_at: source.executed_at,
    reported_at: source.reported_at,
    decision_found: source.decision_found
  });
}

function computeExecutionHash(record) {
  return sha256Hex(canonicalJson(normalizeExecutionForHash(record)));
}

function normalizeOutcomeForHash(record) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    decision_protocol_version: source.decision_protocol_version,
    decision_outcome_version: source.decision_outcome_version,
    outcome_id: source.outcome_id,
    decision_id: source.decision_id,
    idempotency_key: source.idempotency_key,
    outcome_status: source.outcome_status,
    action_executed: source.action_executed,
    action_taken: source.action_taken,
    target_system: source.target_system,
    target_object_id: source.target_object_id,
    mutation: source.mutation,
    external_ref: source.external_ref,
    decision_record_hash: source.decision_record_hash,
    decision_receipt_hash: source.decision_receipt_hash,
    decision_verdict: source.decision_verdict,
    decision_action: source.decision_action,
    policy_id: source.policy_id,
    policy_version: source.policy_version,
    policy_bundle_hash: source.policy_bundle_hash,
    action_binding: source.action_binding,
    observed_metrics: source.observed_metrics,
    evidence_refs: source.evidence_refs,
    outcome_input_hash: source.outcome_input_hash,
    executed_at: source.executed_at,
    reported_at: source.reported_at,
    decision_found: source.decision_found
  });
}

function computeOutcomeHash(record) {
  return sha256Hex(canonicalJson(normalizeOutcomeForHash(record)));
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => isPlainObject(item)) : [];
}

function pickDecisionRecordFromPacket(packet) {
  if (!isPlainObject(packet)) return null;
  if (isPlainObject(packet.decision_record)) return packet.decision_record;
  if (isPlainObject(packet.record)) return packet.record;
  if (isPlainObject(packet.decision)) return packet.decision;
  return null;
}

function pickDecisionPacket(source) {
  if (!isPlainObject(source)) return null;
  if (source.decision_packet_version || source.packet_hash || source.packet_manifest) return source;
  if (isPlainObject(source.packet)) return source.packet;
  if (isPlainObject(source.decision_packet)) return source.decision_packet;
  return null;
}

function packetForHash(packet) {
  if (!isPlainObject(packet)) return {};
  const { packet_hash: _packetHash, ...rest } = packet;
  return rest;
}

function computeDecisionPacketHash(packet) {
  return sha256Hex(canonicalJson(packetForHash(packet)));
}

function hashWithoutField(source, fieldName) {
  if (!isPlainObject(source)) return null;
  const { [fieldName]: _omitted, ...rest } = source;
  return sha256Hex(canonicalJson(rest));
}

function safeChainId(value) {
  return cleanText(String(value || ''), 220).replace(/[^a-z0-9:_-]/gi, '').slice(0, 180);
}

function compactEntryForChain(entry) {
  if (!isPlainObject(entry)) return null;
  const output = isPlainObject(entry.output) ? entry.output : {};
  const decisionId = cleanText(String(entry.decision_id || output.decision_id || ''), MAX_DECISION_ID_LENGTH);
  const recordHash = cleanText(String(entry.record_hash || output.record_hash || ''), 200);
  const receiptHash = cleanText(String(entry.receipt_hash || output.receipt_hash || ''), 200);
  if (!decisionId || !recordHash) return null;
  return {
    entry_type: cleanText(String(entry.type || entry.entry_type || 'decision'), 80),
    decision_id: decisionId,
    record_hash: recordHash,
    receipt_hash: receiptHash,
    policy_id: cleanText(String(entry.policy_id || output.policy_id || ''), 180),
    policy_version: cleanText(String(entry.policy_version || output.policy_version || ''), 180),
    created_at: cleanText(String(entry.created_at || entry.timestamp || output.created_at || new Date().toISOString()), 100),
    verify_url:
      cleanText(String(entry.verify_url || output.verify_url || ''), 700) ||
      `/api/decision/${encodeURIComponent(decisionId)}/verify`
  };
}

function computeDecisionChainLeafHash(entry) {
  const compact = compactEntryForChain(entry);
  if (!compact) return '';
  return sha256Hex(
    canonicalJson({
      decision_chain_version: DECISION_CHAIN_VERSION,
      entry_type: compact.entry_type,
      decision_id: compact.decision_id,
      record_hash: compact.record_hash,
      receipt_hash: compact.receipt_hash || null
    })
  );
}

function computeRollingMerkleRoot({ previousMerkleRoot = '', leafHash = '', chainPosition = 1 } = {}) {
  const previous = cleanText(String(previousMerkleRoot || ''), 200);
  const leaf = cleanText(String(leafHash || ''), 200);
  if (!leaf) return '';
  if (!previous || Number(chainPosition) <= 1) return leaf;
  return sha256Hex(
    canonicalJson({
      strategy: MERKLE_STRATEGY,
      previous_merkle_root: previous,
      leaf_hash: leaf,
      chain_position: Number(chainPosition)
    })
  );
}

function linkHashPayload(link) {
  return {
    decision_chain_version: DECISION_CHAIN_VERSION,
    chain_id: link.chain_id,
    chain_position: link.chain_position,
    previous_link_hash: link.previous_link_hash || null,
    previous_merkle_root: link.previous_merkle_root || null,
    leaf_hash: link.leaf_hash,
    merkle_root: link.merkle_root,
    merkle_strategy: MERKLE_STRATEGY,
    entry_type: link.entry_type,
    decision_id: link.decision_id,
    record_hash: link.record_hash,
    receipt_hash: link.receipt_hash || null,
    policy_id: link.policy_id || null,
    policy_version: link.policy_version || null,
    created_at: link.created_at
  };
}

function computeDecisionChainLinkHash(link) {
  return sha256Hex(canonicalJson(linkHashPayload(link)));
}

function verifyChainLinks(links = []) {
  const ordered = Array.isArray(links)
    ? [...links].sort((a, b) => Number(a?.chain_position || 0) - Number(b?.chain_position || 0))
    : [];
  let previousLinkHash = null;
  let previousMerkleRoot = null;
  let valid = true;
  const checks = [];
  for (const link of ordered) {
    const expectedMerkleRoot = computeRollingMerkleRoot({
      previousMerkleRoot: link.previous_merkle_root || '',
      leafHash: link.leaf_hash || '',
      chainPosition: link.chain_position
    });
    const expectedLinkHash = computeDecisionChainLinkHash({
      ...link,
      merkle_root: expectedMerkleRoot
    });
    const linkValid = link.link_hash === expectedLinkHash;
    const merkleValid = link.merkle_root === expectedMerkleRoot;
    const previousValid = !previousLinkHash || link.previous_link_hash === previousLinkHash;
    const previousMerkleValid = !previousMerkleRoot || link.previous_merkle_root === previousMerkleRoot;
    const check = {
      chain_position: link.chain_position,
      decision_id: link.decision_id,
      link_hash: link.link_hash,
      link_hash_valid: linkValid,
      merkle_root_valid: merkleValid,
      previous_link_valid: previousValid,
      previous_merkle_root_valid: previousMerkleValid
    };
    checks.push(check);
    if (!linkValid || !merkleValid || !previousValid || !previousMerkleValid) valid = false;
    previousLinkHash = link.link_hash || previousLinkHash;
    previousMerkleRoot = link.merkle_root || previousMerkleRoot;
  }
  return {
    checked_links: ordered.length,
    valid,
    checks
  };
}

function verifyDecisionAuditChain(record = {}) {
  const auditChain = isPlainObject(record?.audit_chain) ? record.audit_chain : null;
  if (!auditChain) {
    return {
      present: false,
      leaf_hash: null,
      leaf_hash_valid: null
    };
  }
  const expectedLeafHash = computeDecisionChainLeafHash({
    type: auditChain.entry_type || 'decision',
    decision_id: record.decision_id,
    record_hash: record.record_hash,
    receipt_hash: record.receipt_hash
  });
  return {
    present: true,
    chain_id: safeChainId(auditChain.chain_id),
    chain_position: Number(auditChain.chain_position || 0),
    expected_leaf_hash: expectedLeafHash,
    actual_leaf_hash: cleanText(String(auditChain.leaf_hash || ''), 200),
    leaf_hash_valid: Boolean(expectedLeafHash) && auditChain.leaf_hash === expectedLeafHash,
    link_hash: cleanText(String(auditChain.link_hash || ''), 200) || null,
    merkle_root: cleanText(String(auditChain.merkle_root || ''), 200) || null
  };
}

function linkedToRecord(records, { decisionId, recordHash, receiptHash }) {
  const list = asArray(records);
  if (!list.length) return null;
  return list.every((record) => {
    const recordDecisionId = cleanText(String(record.decision_id || ''), MAX_DECISION_ID_LENGTH);
    const linkedRecordHash = cleanText(String(record.decision_record_hash || ''), 200);
    const linkedReceiptHash = cleanText(String(record.decision_receipt_hash || ''), 200);
    return (
      (!decisionId || !recordDecisionId || recordDecisionId === decisionId) &&
      (!recordHash || !linkedRecordHash || linkedRecordHash === recordHash) &&
      (!receiptHash || !linkedReceiptHash || linkedReceiptHash === receiptHash)
    );
  });
}

function verifyDecisionPacket(
  packetInput,
  { input, publicKey = '', untrustedPublicKey = '', hmacSecret = '', env = process.env } = {}
) {
  const packet = pickDecisionPacket(packetInput);
  if (!packet) {
    return {
      ok: false,
      verified: false,
      integrity_valid: false,
      authenticity_valid: false,
      key_source: 'none',
      checks: {},
      expected: {},
      actual: {},
      error: 'Decision Packet must be an object'
    };
  }
  const record = pickDecisionRecordFromPacket(packet);
  const packetInputPayload = input !== undefined ? input : packet.input;
  const recordVerification = record
    ? verifyDecisionRecord(record, { input: packetInputPayload, publicKey, untrustedPublicKey, hmacSecret, env })
    : { verified: false, checks: {}, expected: {}, actual: {}, error: 'Decision Packet missing Decision Record' };
  const expectedPacketHash = computeDecisionPacketHash(packet);
  const actualPacketHash = cleanText(String(packet.packet_hash || ''), 200);
  const decisionId = cleanText(String(record?.decision_id || packet.decision_id || ''), MAX_DECISION_ID_LENGTH);
  const recordHash = cleanText(String(record?.record_hash || packet.record_hash || ''), 200);
  const receiptHash = cleanText(String(record?.receipt_hash || packet.receipt_hash || ''), 200);
  const effectiveness = packet.policy_intelligence?.effectiveness || packet.policy_effectiveness;
  const anomalies = packet.policy_intelligence?.anomalies || packet.anomaly_report;
  const auditChain = verifyDecisionAuditChain(record || {});
  const chainLinks = asArray(packet.audit_chain?.retained_links);
  const chainVerification = chainLinks.length ? verifyChainLinks(chainLinks) : null;
  const executionHashChecks = asArray(packet.executions).map((execution) => {
    const actual = cleanText(String(execution.execution_hash || ''), 200);
    return actual ? actual === computeExecutionHash(execution) : null;
  });
  const outcomeHashChecks = asArray(packet.outcomes).map((outcome) => {
    const actual = cleanText(String(outcome.outcome_hash || ''), 200);
    return actual ? actual === computeOutcomeHash(outcome) : null;
  });
  const manifest = packet.packet_manifest?.components;
  const manifestCounts =
    isPlainObject(manifest) &&
    (!Number.isFinite(Number(manifest.execution_receipts?.count)) ||
      Number(manifest.execution_receipts?.count) === asArray(packet.executions).length) &&
    (!Number.isFinite(Number(manifest.outcome_records?.count)) ||
      Number(manifest.outcome_records?.count) === asArray(packet.outcomes).length);
  const checks = {
    decision_packet_version: packet.decision_packet_version === DECISION_PACKET_VERSION,
    packet_hash: Boolean(actualPacketHash) && actualPacketHash === expectedPacketHash,
    packet_manifest_counts: isPlainObject(manifest) ? manifestCounts : null,
    decision_record_verified: recordVerification.verified === true,
    decision_record_hash_matches_packet: recordHash && packet.record_hash ? recordHash === packet.record_hash : null,
    decision_receipt_hash_matches_packet: receiptHash && packet.receipt_hash ? receiptHash === packet.receipt_hash : null,
    execution_hashes: executionHashChecks.length ? executionHashChecks.every(Boolean) : null,
    execution_links: linkedToRecord(packet.executions, { decisionId, recordHash, receiptHash }),
    outcome_hashes: outcomeHashChecks.length ? outcomeHashChecks.every(Boolean) : null,
    outcome_links: linkedToRecord(packet.outcomes, { decisionId, recordHash, receiptHash }),
    policy_effectiveness_hash: isPlainObject(effectiveness)
      ? effectiveness.effectiveness_hash === hashWithoutField(effectiveness, 'effectiveness_hash')
      : null,
    anomaly_report_hash: isPlainObject(anomalies) ? anomalies.anomaly_hash === hashWithoutField(anomalies, 'anomaly_hash') : null,
    audit_chain_leaf_hash: auditChain.present ? auditChain.leaf_hash_valid : null,
    retained_chain_links: chainVerification ? chainVerification.valid : null
  };
  const packetIntegrityChecks = Object.entries(checks)
    .filter(([key, value]) => key !== 'decision_record_verified' && value !== null)
    .map(([, value]) => value);
  const integrityValid =
    recordVerification.integrity_valid === true &&
    packetIntegrityChecks.length > 0 &&
    packetIntegrityChecks.every(Boolean);
  const authenticityValid = recordVerification.authenticity_valid === true;
  const verified = integrityValid && authenticityValid;
  return {
    ok: verified,
    verified,
    integrity_valid: integrityValid,
    authenticity_valid: authenticityValid,
    key_source: recordVerification.key_source || 'none',
    decision_packet_version: DECISION_PACKET_VERSION,
    decision_id: decisionId || null,
    checks,
    expected: {
      packet_hash: expectedPacketHash,
      record_hash: recordVerification.expected?.record_hash,
      receipt_hash: recordVerification.expected?.receipt_hash
    },
    actual: {
      packet_hash: actualPacketHash || null,
      record_hash: recordVerification.actual?.record_hash || recordHash || null,
      receipt_hash: recordVerification.actual?.receipt_hash || receiptHash || null,
      execution_hashes: asArray(packet.executions).map((execution) => execution.execution_hash).filter(Boolean),
      outcome_hashes: asArray(packet.outcomes).map((outcome) => outcome.outcome_hash).filter(Boolean),
      audit_chain: auditChain,
      retained_chain_links: chainVerification
    },
    decision_record_verification: recordVerification
  };
}

function verifyDecisionRecord(
  record,
  { input, publicKey = '', untrustedPublicKey = '', hmacSecret = '', env = process.env } = {}
) {
  if (!isPlainObject(record)) {
    return {
      verified: false,
      integrity_valid: false,
      authenticity_valid: false,
      checks: {},
      expected: {},
      actual: {},
      error: 'Decision record must be an object'
    };
  }

  const expectedRecordHash = computeRecordHash(record);
  const actualRecordHash = cleanText(String(record.record_hash || ''), 200);
  const expectedReceiptHash = computeReceiptHash(record, expectedRecordHash);
  const actualReceiptHash = cleanText(String(record.receipt_hash || record.integrity?.receipt_hash || ''), 200);
  const actualReceiptSignature = cleanText(String(record.receipt_signature || ''), 240);
  const receiptKeyId = cleanText(String(record.receipt_key_id || record.integrity?.signature?.key_id || ''), 120);
  const receiptSignatureAlgorithm = cleanText(
    String(record.receipt_signature_algorithm || record.integrity?.signature?.algorithm || ''),
    80
  ).toLowerCase();
  const suppliedPublicKey = normalizePem(publicKey, 12000);
  const environmentPublicKey = normalizePem(
    env.DECIDE_RECEIPT_ED25519_PUBLIC_KEY || env.DECIDE_RECEIPT_PUBLIC_KEY || '',
    12000
  );
  const requestPublicKey = normalizePem(untrustedPublicKey, 12000);
  const embeddedPublicKey = normalizePem(
    record.receipt_public_key || record.integrity?.signature?.public_key || '',
    12000
  );
  const trustedPublicKey = suppliedPublicKey || environmentPublicKey;
  const receiptPublicKey = normalizePem(requestPublicKey || embeddedPublicKey || trustedPublicKey, 12000);
  const receiptPublicKeyFingerprint = receiptPublicKey ? sha256Hex(receiptPublicKey) : '';
  const claimedPublicKeyFingerprint = cleanText(
    String(record.receipt_public_key_fingerprint || record.integrity?.signature?.public_key_fingerprint || ''),
    200
  );
  const signaturePayload = buildReceiptSignaturePayload({
    decisionId: record.decision_id || record.decisionId || '',
    recordHash: expectedRecordHash,
    receiptHash: expectedReceiptHash,
    keyId: receiptKeyId
  });
  let expectedSignedReceipt = null;
  let receiptSignatureCheck = null;
  let trustedReceiptSignatureCheck = null;
  if (actualReceiptSignature) {
    if (receiptSignatureAlgorithm === 'ed25519' || actualReceiptSignature.toLowerCase().startsWith('ed25519:')) {
      receiptSignatureCheck = verifyEd25519Signature({
        signature: actualReceiptSignature,
        publicKey: receiptPublicKey,
        payload: signaturePayload
      });
      trustedReceiptSignatureCheck = trustedPublicKey
        ? verifyEd25519Signature({
            signature: actualReceiptSignature,
            publicKey: trustedPublicKey,
            payload: signaturePayload
          })
        : null;
    } else {
      expectedSignedReceipt = signHmacDecisionReceipt({
        decisionId: record.decision_id || record.decisionId || '',
        recordHash: expectedRecordHash,
        receiptHash: expectedReceiptHash,
        keyId: receiptKeyId,
        hmacSecret,
        env
      });
      receiptSignatureCheck = expectedSignedReceipt ? actualReceiptSignature === expectedSignedReceipt.receipt_signature : null;
    }
  }
  const inputProvided = input !== undefined && input !== null;
  const expectedInputHash = inputProvided ? sha256Hex(canonicalJson(input)) : '';
  const actualInputHash = cleanText(String(record.input_hash || record.integrity?.input_hash || ''), 200);
  const integrityRecordHash = cleanText(String(record.integrity?.record_hash || ''), 200);
  const integrityPolicyBundleHash = cleanText(String(record.integrity?.policy_bundle_hash || ''), 200);
  const actualPolicyBundleHash = cleanText(String(record.policy_bundle_hash || record.policyBundleHash || record.policy_bundle?.hash || ''), 200);

  const checks = {
    decision_protocol_version: record.decision_protocol_version ? record.decision_protocol_version === DECISION_PROTOCOL_VERSION : null,
    decision_record_version: record.decision_record_version === DECISION_RECORD_VERSION,
    record_hash: Boolean(actualRecordHash) && actualRecordHash === expectedRecordHash,
    receipt_hash: Boolean(actualReceiptHash) && actualReceiptHash === expectedReceiptHash,
    receipt_signature: actualReceiptSignature ? receiptSignatureCheck === true : null,
    receipt_public_key_fingerprint: claimedPublicKeyFingerprint
      ? Boolean(receiptPublicKeyFingerprint) && claimedPublicKeyFingerprint === receiptPublicKeyFingerprint
      : null,
    integrity_record_hash: !integrityRecordHash || integrityRecordHash === actualRecordHash,
    integrity_policy_bundle_hash: !integrityPolicyBundleHash || integrityPolicyBundleHash === actualPolicyBundleHash,
    input_hash: inputProvided ? Boolean(actualInputHash) && actualInputHash === expectedInputHash : null
  };
  const integrityChecks = Object.values(checks).filter((value) => value !== null);
  const integrityValid = integrityChecks.length > 0 && integrityChecks.every(Boolean);
  const usesEd25519 =
    receiptSignatureAlgorithm === 'ed25519' || actualReceiptSignature.toLowerCase().startsWith('ed25519:');
  const authenticityValid = Boolean(
    actualReceiptSignature &&
      (usesEd25519
        ? trustedPublicKey && trustedReceiptSignatureCheck === true
        : expectedSignedReceipt && receiptSignatureCheck === true)
  );
  checks.receipt_key_trusted = actualReceiptSignature ? authenticityValid : null;

  return {
    verified: integrityValid && authenticityValid,
    integrity_valid: integrityValid,
    authenticity_valid: authenticityValid,
    key_source: suppliedPublicKey
      ? 'public_key'
      : environmentPublicKey
        ? 'environment'
        : requestPublicKey
          ? 'request_body'
          : embeddedPublicKey
            ? 'record'
            : 'none',
    checks,
    expected: {
      record_hash: expectedRecordHash,
      receipt_hash: expectedReceiptHash,
      receipt_signature: expectedSignedReceipt?.receipt_signature || undefined,
      receipt_public_key_fingerprint: receiptPublicKeyFingerprint || undefined,
      input_hash: expectedInputHash || undefined
    },
    actual: {
      record_hash: actualRecordHash || undefined,
      receipt_hash: actualReceiptHash || undefined,
      receipt_signature: actualReceiptSignature || undefined,
      receipt_key_id: receiptKeyId || undefined,
      receipt_signature_algorithm: receiptSignatureAlgorithm || undefined,
      receipt_public_key_fingerprint:
        claimedPublicKeyFingerprint || receiptPublicKeyFingerprint || undefined,
      input_hash: actualInputHash || undefined
    }
  };
}

async function fetchRegistryPublicKey(registryUrl, record, { fetchImpl = globalThis.fetch } = {}) {
  if (!registryUrl) return '';
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for --key-registry');
  const response = await fetchImpl(registryUrl);
  if (!response.ok) throw new Error(`Receipt key registry returned ${response.status}`);
  const registry = await response.json();
  const keys = Array.isArray(registry?.keys) ? registry.keys : [];
  if (!keys.length) return '';
  const recordKeyId = String(record.receipt_key_id || record.integrity?.signature?.key_id || '');
  const recordFingerprint = String(
    record.receipt_public_key_fingerprint || record.integrity?.signature?.public_key_fingerprint || ''
  );
  const matched =
    keys.find((key) => recordKeyId && key?.key_id === recordKeyId) ||
    keys.find((key) => recordFingerprint && key?.public_key_fingerprint === recordFingerprint) ||
    (keys.length === 1 ? keys[0] : null);
  return matched?.public_key || '';
}

async function verifyDecisionRecordWithRegistry({
  record,
  input,
  publicKey = '',
  keyRegistryUrl = '',
  hmacSecret = '',
  fetchImpl,
  keySource = ''
} = {}) {
  const registryPublicKey = publicKey ? '' : await fetchRegistryPublicKey(keyRegistryUrl, record, { fetchImpl });
  const resolvedKeySource = keySource || (publicKey ? 'public_key' : registryPublicKey ? 'key_registry' : 'record_or_env');
  const result = verifyDecisionRecord(record, {
    input,
    publicKey: publicKey || registryPublicKey,
    hmacSecret
  });
  return {
    ...result,
    ok: result.verified === true,
    key_source: resolvedKeySource
  };
}

async function verifyDecisionPacketWithRegistry({
  packet,
  input,
  publicKey = '',
  keyRegistryUrl = '',
  hmacSecret = '',
  fetchImpl,
  keySource = ''
} = {}) {
  const resolvedPacket = pickDecisionPacket(packet);
  const record = pickDecisionRecordFromPacket(resolvedPacket || {});
  const registryPublicKey = publicKey || !record ? '' : await fetchRegistryPublicKey(keyRegistryUrl, record, { fetchImpl });
  const resolvedKeySource = keySource || (publicKey ? 'public_key' : registryPublicKey ? 'key_registry' : 'record_or_env');
  const result = verifyDecisionPacket(resolvedPacket, {
    input,
    publicKey: publicKey || registryPublicKey,
    hmacSecret
  });
  return {
    ...result,
    key_source: resolvedKeySource
  };
}

module.exports = {
  DECISION_PROTOCOL_VERSION,
  DECISION_RECORD_VERSION,
  DECISION_PACKET_VERSION,
  DECIDE_APPLICATION_BINDING_VERSION,
  canonicalJson,
  sha256Hex,
  computeRecordHash,
  computeReceiptHash,
  computeExecutionHash,
  computeOutcomeHash,
  computeDecisionPacketHash,
  verifyApplicationBinding,
  verifyDecisionRecord,
  verifyDecisionRecordWithRegistry,
  verifyDecisionPacket,
  verifyDecisionPacketWithRegistry,
  fetchRegistryPublicKey
};
