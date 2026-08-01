const verifier = require('./verifier');

const DEFAULT_BASE_URL = 'https://www.decide.fyi';

function trimBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(
      body && typeof body === 'object' && body.message
        ? body.message
        : `Decide API request failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

class DecideClient {
  constructor({ apiKey = '', baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('DecideClient requires a fetch implementation');
    }
    this.apiKey = apiKey;
    this.baseUrl = trimBaseUrl(baseUrl);
    this.fetch = fetchImpl;
  }

  headers(extra = {}) {
    return {
      'content-type': 'application/json',
      ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
      ...extra
    };
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, options);
    return parseJsonResponse(response);
  }

  decide(input, { idempotencyKey = '', responseView = 'full' } = {}) {
    return this.request('/api/decide', {
      method: 'POST',
      headers: this.headers({
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
        ...(responseView ? { 'x-decision-response-view': responseView } : {})
      }),
      body: JSON.stringify(input || {})
    });
  }

  verifyRecord({ record, input, publicKey } = {}) {
    return this.request('/api/decision/verify', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        record,
        input,
        public_key: publicKey
      })
    });
  }

  verifyDecision(decisionId) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/verify`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  lookupDecision(decisionId) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  replayDecision(decisionId, body = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/replay`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
  }

  diffDecision(decisionId, body = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/diff`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
  }

  counterfactuals(decisionId, body = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/counterfactuals`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
  }

  recordExecution(decisionId, body = {}, { idempotencyKey = '' } = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/execution`, {
      method: 'POST',
      headers: this.headers({
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {})
      }),
      body: JSON.stringify(body)
    });
  }

  listExecutions(decisionId, { limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/execution${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  recordOutcome(decisionId, body = {}, { idempotencyKey = '' } = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/outcome`, {
      method: 'POST',
      headers: this.headers({
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {})
      }),
      body: JSON.stringify(body)
    });
  }

  listOutcomes(decisionId, { limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/outcome${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  recordCrmSync(decisionId, body = {}, { idempotencyKey = '' } = {}) {
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/crm-sync`, {
      method: 'POST',
      headers: this.headers({
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {})
      }),
      body: JSON.stringify(body)
    });
  }

  listCrmSyncs(decisionId, { limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/crm-sync${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyEffectiveness(policyId, { policyVersion = '', limit, minSample } = {}) {
    const params = new URLSearchParams();
    if (policyVersion) params.set('policy_version', policyVersion);
    if (limit) params.set('limit', String(limit));
    if (minSample) params.set('min_sample', String(minSample));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/policies/${encodeURIComponent(policyId)}/effectiveness${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyAnomalies(policyId, { policyVersion = '', limit, minSample, threshold, maxItems } = {}) {
    const params = new URLSearchParams();
    if (policyVersion) params.set('policy_version', policyVersion);
    if (limit) params.set('limit', String(limit));
    if (minSample) params.set('min_sample', String(minSample));
    if (threshold !== undefined && threshold !== null) params.set('threshold', String(threshold));
    if (maxItems) params.set('max_items', String(maxItems));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/policies/${encodeURIComponent(policyId)}/anomalies${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyConfidence(policyId, { policyVersion = '', verdict = 'yes', action = '', limit, minSample } = {}) {
    const params = new URLSearchParams();
    if (policyVersion) params.set('policy_version', policyVersion);
    if (verdict) params.set('verdict', verdict);
    if (action) params.set('action', action);
    if (limit) params.set('limit', String(limit));
    if (minSample) params.set('min_sample', String(minSample));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/policies/${encodeURIComponent(policyId)}/confidence${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyBenchmarks(policyId, { policyVersion = '', limit, minCohortScopes, minCohortDecisions } = {}) {
    const params = new URLSearchParams();
    if (policyVersion) params.set('policy_version', policyVersion);
    if (limit) params.set('limit', String(limit));
    if (minCohortScopes) params.set('min_cohort_scopes', String(minCohortScopes));
    if (minCohortDecisions) params.set('min_cohort_decisions', String(minCohortDecisions));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/policies/${encodeURIComponent(policyId)}/benchmarks${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  decisionChain(chainId, { limit } = {}) {
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.request(`/api/decision/chains/${encodeURIComponent(chainId)}${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  decisionPacket(
    decisionId,
    {
      includeInput,
      includeChain,
      includeIntelligence,
      executionLimit,
      outcomeLimit,
      policyLimit,
      minSample,
      threshold,
      maxAnomalies,
      chainLimit
    } = {}
  ) {
    const params = new URLSearchParams();
    if (includeInput !== undefined) params.set('include_input', includeInput ? 'true' : 'false');
    if (includeChain !== undefined) params.set('include_chain', includeChain ? 'true' : 'false');
    if (includeIntelligence !== undefined) params.set('include_intelligence', includeIntelligence ? 'true' : 'false');
    if (executionLimit) params.set('execution_limit', String(executionLimit));
    if (outcomeLimit) params.set('outcome_limit', String(outcomeLimit));
    if (policyLimit) params.set('policy_limit', String(policyLimit));
    if (minSample) params.set('min_sample', String(minSample));
    if (threshold !== undefined && threshold !== null) params.set('threshold', String(threshold));
    if (maxAnomalies) params.set('max_anomalies', String(maxAnomalies));
    if (chainLimit) params.set('chain_limit', String(chainLimit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/${encodeURIComponent(decisionId)}/packet${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  receiptKeys() {
    return this.request('/api/decision/receipt-keys', {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyBundles() {
    return this.request('/api/decision/policy-bundles', {
      method: 'GET',
      headers: this.headers()
    });
  }

  rulebookMetadata({ hash = '', rulebookId = '', version = '' } = {}) {
    const params = new URLSearchParams();
    if (hash) {
      params.set('hash', hash);
    } else if (rulebookId && version) {
      params.set('rulebook_id', rulebookId);
      params.set('version', version);
    } else {
      throw new TypeError('rulebookMetadata requires hash, or both rulebookId and version');
    }
    return this.request(`/api/decision/rulebooks?${params.toString()}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  policyPatterns({ patternId = '', tag = '' } = {}) {
    const params = new URLSearchParams();
    if (patternId) params.set('pattern_id', patternId);
    if (tag) params.set('tag', tag);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/decision/policy-patterns${query}`, {
      method: 'GET',
      headers: this.headers()
    });
  }

  status() {
    return this.request('/api/decision/status', {
      method: 'GET',
      headers: this.headers()
    });
  }
}

function createDecideClient(options = {}) {
  return new DecideClient(options);
}

module.exports = {
  DecideClient,
  createDecideClient,
  ...verifier
};
