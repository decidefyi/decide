// Simple in-memory rate limiter for serverless functions
// Note: Each serverless instance maintains its own state
// For distributed rate limiting, use Redis or Vercel Edge Config

/**
 * Creates a rate limiter with specified limits
 * @param {number} requests - Number of requests allowed
 * @param {number} window - Time window in milliseconds
 * @returns {function} Rate limit checker function
 */
export function createRateLimiter(requests, window) {
  // Keep a dedicated in-memory store per limiter instance so endpoint
  // quotas do not interfere with each other.
  const rateLimitStore = new Map();

  return function checkRateLimit(identifier) {
    const now = Date.now();
    const key = identifier;

    // Periodic cleanup to prevent memory leaks
    if (rateLimitStore.size > 10000) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (v.resetAt < now) {
          rateLimitStore.delete(k);
        }
      }
    }

    let record = rateLimitStore.get(key);

    // Initialize or reset expired record
    if (!record || record.resetAt < now) {
      record = {
        count: 1,
        resetAt: now + window,
      };
      rateLimitStore.set(key, record);

      return {
        allowed: true,
        limit: requests,
        remaining: requests - 1,
        reset: record.resetAt,
      };
    }

    // Increment count
    record.count++;

    // Check if limit exceeded
    if (record.count > requests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        limit: requests,
        remaining: 0,
        reset: record.resetAt,
      };
    }

    return {
      allowed: true,
      limit: requests,
      remaining: requests - record.count,
      reset: record.resetAt,
    };
  };
}

/**
 * Extracts client IP from request
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Sends rate limit exceeded response
 */
export function sendRateLimitError(res, result, request_id) {
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.reset));
  res.setHeader('Retry-After', String(result.retryAfter));

  res.end(
    JSON.stringify({
      ok: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
      retry_after: result.retryAfter,
      request_id,
    })
  );
}

/**
 * Adds rate limit headers to response
 */
export function addRateLimitHeaders(res, result) {
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.reset));
}
