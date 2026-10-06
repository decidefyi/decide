import { loadPolicyEvidenceSnapshot } from '../lib/policy-evidence-snapshot.js';
import { buildPolicySupportCatalogue } from '../lib/policy-support-catalogue.js';
import { parseRequestQuery } from '../lib/request-query.js';

export default async function policySupport(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Allow', 'GET');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return send(405, { error: 'METHOD_NOT_ALLOWED' });
  const query = parseRequestQuery(req);
  if (Object.keys(query).some(key => !['policy', 'vendor'].includes(key))
    || Object.values(query).some(value => typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value))
    || (query.policy && !['refund', 'cancel', 'return', 'trial'].includes(query.policy))) {
    return send(400, { error: 'INVALID_FILTER', message: 'Use one policy and/or vendor filter. No caller evidence or clock is accepted.' });
  }
  try {
    const snapshot = await loadPolicyEvidenceSnapshot();
    return send(200, buildPolicySupportCatalogue({ snapshot, policy: query.policy, vendor: query.vendor }));
  } catch {
    return send(503, { error: 'CATALOGUE_UNAVAILABLE' });
  }
}
