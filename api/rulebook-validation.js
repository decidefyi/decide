import { randomUUID, timingSafeEqual } from 'node:crypto';
import { evaluateRulebookV1 } from '../lib/rulebook-v1.js';

// Internal, opt-in validation only. No logs, model calls, decision records or
// execution credentials. The production evaluator remains the single validator.
export function createRulebookValidationHandler({ env = process.env } = {}) {
  return async (req, res) => {
    const request_id = randomUUID();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Request-Id', request_id);
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify({ ...body, request_id })); };
    const reject = (status, error) => send(status, { ok: false, error });
    try {
      const expected = env.DECIDE_AUTHORITY_VALIDATOR_TOKEN;
      if (env.DECIDE_AUTHORITY_ENABLED !== '1' || typeof expected !== 'string' || expected.length < 32) return reject(503, 'VALIDATION_DISABLED');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reject(405, 'VALIDATION_METHOD_NOT_ALLOWED'); }
      const supplied = req.headers.authorization;
      const authorization = `Bearer ${expected}`;
      if (req.headers.origin || req.headers['x-api-key'] || typeof supplied !== 'string' ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(authorization) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(authorization))) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="decide-rulebook-validation"');
        return reject(401, 'VALIDATION_UNAUTHORIZED');
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reject(415, 'VALIDATION_JSON_REQUIRED');
      let raw;
      if (req.body !== undefined) raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
      else {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 65536) return reject(413, 'VALIDATION_REQUEST_TOO_LARGE');
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks);
      }
      if (Buffer.byteLength(raw) > 65536) return reject(413, 'VALIDATION_REQUEST_TOO_LARGE');
      let body;
      try { body = JSON.parse(raw.toString()); } catch { return reject(400, 'VALIDATION_INVALID_JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'rulebook') return reject(400, 'VALIDATION_INVALID_REQUEST');
      const result = evaluateRulebookV1({ rulebook: body.rulebook, inputs: {}, bindingMode: 'direct_declarative_rulebook' });
      if (!result.ok) return reject(422, 'RULEBOOK_INVALID');
      return send(200, { ok: true, rulebook: result.result.rulebook, rulebook_contract: result.result.rulebook_contract });
    } catch { return reject(503, 'VALIDATION_UNAVAILABLE'); }
  };
}

export default createRulebookValidationHandler();
