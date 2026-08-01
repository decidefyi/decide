const DEFAULT_CONFORMANCE_INDEX_URL = 'https://api.decide.fyi/conformance/rulebook-v1/index.json';
const DEFAULT_CONFORMANCE_ENDPOINT = 'https://api.decide.fyi/api/decide';

function normalizeEndpoint(value, fallback = DEFAULT_CONFORMANCE_ENDPOINT) {
  const raw = String(value || '').trim();
  return raw || fallback;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return body;
}

async function fetchJson(url, fetchImpl, label) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json' }
  });
  return readJsonResponse(response, label);
}

function hasUnknownField(errors, field) {
  return Array.isArray(errors) && errors.some((entry) => entry?.code === 'unknown_field' && entry?.field === field);
}

function semanticView(payload = {}) {
  return {
    verdict: payload.verdict,
    application_verdict: payload.application_verdict,
    action: payload.action,
    reason_code: payload.reason_code,
    matched_rule_id: payload.matched_rule_id,
    rulebook_hash: payload.rulebook?.hash || null,
    rulebook_contract: payload.rulebook_contract || null,
    adapter_facts: payload.adapter_facts || null
  };
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function compareRulebookContract(payload = {}, expected = {}) {
  const checks = [];
  if (!expected || typeof expected !== 'object') return checks;
  const actual = payload.rulebook_contract || {};
  if (actual.schema_version !== 'rulebook_v1') {
    checks.push(`rulebook_contract.schema_version expected "rulebook_v1" got ${JSON.stringify(actual.schema_version)}`);
  }
  if (expected.schema_url !== undefined && actual.schema_url !== expected.schema_url) {
    checks.push(`rulebook_contract.schema_url expected ${JSON.stringify(expected.schema_url)} got ${JSON.stringify(actual.schema_url)}`);
  }
  if (expected.evaluator_version !== undefined && actual.evaluator_version !== expected.evaluator_version) {
    checks.push(
      `rulebook_contract.evaluator_version expected ${JSON.stringify(expected.evaluator_version)} got ${JSON.stringify(actual.evaluator_version)}`
    );
  }
  if (expected.schema_hash !== undefined && actual.schema_hash !== expected.schema_hash) {
    checks.push(`rulebook_contract.schema_hash expected ${JSON.stringify(expected.schema_hash)} got ${JSON.stringify(actual.schema_hash)}`);
  }
  if (expected.schema_hash_format === 'sha256_hex' && !isSha256Hex(actual.schema_hash)) {
    checks.push(`rulebook_contract.schema_hash expected sha256_hex got ${JSON.stringify(actual.schema_hash)}`);
  }
  return checks;
}

function compareExpected(payload, expected = {}) {
  const checks = [];
  for (const [field, value] of Object.entries({
    verdict: expected.decision,
    application_verdict: expected.application_verdict,
    action: expected.action,
    reason_code: expected.reason_code,
    matched_rule_id: expected.matched_rule_id
  })) {
    if (value !== undefined && payload[field] !== value) {
      checks.push(`${field} expected ${JSON.stringify(value)} got ${JSON.stringify(payload[field])}`);
    }
  }
  if (expected.adapter_facts && typeof expected.adapter_facts === 'object') {
    for (const [field, value] of Object.entries(expected.adapter_facts)) {
      if (payload.adapter_facts?.[field] !== value) {
        checks.push(`adapter_facts.${field} expected ${JSON.stringify(value)} got ${JSON.stringify(payload.adapter_facts?.[field])}`);
      }
    }
  }
  checks.push(...compareRulebookContract(payload, expected.rulebook_contract));
  return checks;
}

async function postFixture({ endpoint, fixture, apiKey, fetchImpl }) {
  const headers = {
    ...(fixture.request?.headers || {}),
    'content-type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {})
  };
  const response = await fetchImpl(endpoint, {
    method: fixture.request?.method || 'POST',
    headers,
    body: JSON.stringify(fixture.request?.body || {})
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function runFixture({ fixtureRef, fixture, endpoint, apiKey, fetchImpl }) {
  const expected = fixture.expect || {};
  const first = await postFixture({ endpoint, fixture, apiKey, fetchImpl });
  const errors = [];
  if (first.status !== expected.statusCode) {
    errors.push(`status expected ${expected.statusCode} got ${first.status}`);
  }

  if (expected.ok === false) {
    if (first.body?.error !== expected.error) {
      errors.push(`error expected ${JSON.stringify(expected.error)} got ${JSON.stringify(first.body?.error)}`);
    }
    for (const field of expected.expected_unknown_fields || []) {
      if (!hasUnknownField(first.body?.errors, field)) {
        errors.push(`missing unknown_field ${field}`);
      }
    }
    return {
      id: fixture.id || fixtureRef.id,
      ok: errors.length === 0,
      status: first.status,
      expected_status: expected.statusCode,
      errors
    };
  }

  if (first.body?.engine !== 'decide_rulebook_v1') {
    errors.push(`engine expected "decide_rulebook_v1" got ${JSON.stringify(first.body?.engine)}`);
  }
  if (first.body?.rulebook?.schema_version !== 'rulebook_v1') {
    errors.push('rulebook.schema_version expected "rulebook_v1"');
  }
  errors.push(...compareExpected(first.body || {}, expected));

  const second = await postFixture({ endpoint, fixture, apiKey, fetchImpl });
  if (second.status !== first.status) {
    errors.push(`repeat status expected ${first.status} got ${second.status}`);
  } else if (JSON.stringify(semanticView(second.body || {})) !== JSON.stringify(semanticView(first.body || {}))) {
    errors.push('repeat run did not reproduce semantic output');
  }

  return {
    id: fixture.id || fixtureRef.id,
    ok: errors.length === 0,
    status: first.status,
    expected_status: expected.statusCode,
    application_verdict: first.body?.application_verdict || null,
    reason_code: first.body?.reason_code || null,
    matched_rule_id: first.body?.matched_rule_id || null,
    errors
  };
}

async function runRulebookConformance({
  indexUrl = DEFAULT_CONFORMANCE_INDEX_URL,
  endpoint = '',
  apiKey = '',
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('runRulebookConformance requires a fetch implementation');
  }
  const resolvedEndpoint = normalizeEndpoint(endpoint);
  const index = await fetchJson(indexUrl, fetchImpl, 'Rulebook conformance index');
  const fixtures = Array.isArray(index.fixtures) ? index.fixtures : [];
  if (!fixtures.length) {
    throw new Error('Rulebook conformance index does not list fixtures');
  }

  const results = [];
  for (const fixtureRef of fixtures) {
    if (!fixtureRef?.url) {
      results.push({
        id: fixtureRef?.id || 'unknown_fixture',
        ok: false,
        errors: ['fixture url is missing']
      });
      continue;
    }
    const fixture = await fetchJson(fixtureRef.url, fetchImpl, `Rulebook conformance fixture ${fixtureRef.id || fixtureRef.url}`);
    results.push(await runFixture({ fixtureRef, fixture, endpoint: resolvedEndpoint, apiKey, fetchImpl }));
  }

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    conformance_version: index.conformance_version || '',
    index_url: indexUrl,
    endpoint: resolvedEndpoint,
    passed,
    failed,
    results
  };
}

function formatRulebookConformanceSummary(result) {
  const lines = [
    result.ok ? 'Rulebook conformance passed.' : 'Rulebook conformance failed.',
    `fixtures: ${result.passed} passed, ${result.failed} failed`,
    `endpoint: ${result.endpoint}`,
    `index: ${result.index_url}`
  ];
  for (const fixture of result.results || []) {
    const suffix = fixture.ok ? 'ok' : `failed (${(fixture.errors || []).join('; ')})`;
    lines.push(`- ${fixture.id}: ${suffix}`);
  }
  return lines.join('\n');
}

module.exports = {
  DEFAULT_CONFORMANCE_ENDPOINT,
  DEFAULT_CONFORMANCE_INDEX_URL,
  formatRulebookConformanceSummary,
  runRulebookConformance
};
