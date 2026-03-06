import { timingSafeEqual } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 18000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;
const MAX_TEXT_CHARS = 1_500_000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function readHeader(req, name = "") {
  if (!req?.headers || !name) return "";
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(req.headers)) {
    if (String(key).toLowerCase() === target) {
      return normalizeHeaderValue(value);
    }
  }
  return "";
}

function readBearerToken(req) {
  const auth = readHeader(req, "authorization");
  if (!auth) return "";
  const parts = auth.split(/\s+/);
  if (parts.length !== 2) return "";
  if (parts[0].toLowerCase() !== "bearer") return "";
  return parts[1].trim();
}

function readInboundHookToken(req) {
  return readBearerToken(req) || readHeader(req, "x-hook-token") || readHeader(req, "x-policy-hook-token");
}

function safeEqualToken(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function clampTimeout(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, parsed));
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function parseAllowlist(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isHostAllowed(hostname, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  const target = String(hostname || "").toLowerCase().trim();
  if (!target) return false;
  return allowlist.some((allowed) => target === allowed || target.endsWith(`.${allowed}`));
}

function toJinaMirrorUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function toLimitedText(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS);
}

async function fetchTextOnce(url, timeoutMs, userAgent, method = "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        statusCode: response.status,
        finalUrl: response.url || url,
      };
    }

    const text = toLimitedText(await response.text());
    if (!text.trim()) {
      return {
        ok: false,
        error: "empty body",
        statusCode: response.status,
        finalUrl: response.url || url,
      };
    }

    return {
      ok: true,
      text,
      statusCode: response.status,
      contentType: String(response.headers.get("content-type") || "").trim(),
      finalUrl: response.url || url,
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaBrowserless(targetUrl, timeoutMs) {
  const browserlessToken = String(
    process.env.POLICY_FETCH_BROWSERLESS_TOKEN || process.env.BROWSERLESS_TOKEN || ""
  ).trim();
  if (!browserlessToken) {
    return { ok: false, skipped: true, error: "browserless_not_configured" };
  }

  const endpointBase = String(
    process.env.POLICY_FETCH_BROWSERLESS_CONTENT_URL || "https://chrome.browserless.io/content"
  ).trim();

  let endpointUrl;
  try {
    endpointUrl = new URL(endpointBase);
  } catch {
    return { ok: false, error: "invalid_browserless_endpoint" };
  }
  endpointUrl.searchParams.set("token", browserlessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpointUrl.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
      },
      body: JSON.stringify({
        url: targetUrl,
        gotoOptions: { waitUntil: "domcontentloaded", timeout: timeoutMs },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `browserless_http_${response.status}`, statusCode: response.status };
    }

    const text = toLimitedText(await response.text());
    if (!text.trim()) return { ok: false, error: "browserless_empty_body" };
    return {
      ok: true,
      text,
      statusCode: response.status,
      contentType: String(response.headers.get("content-type") || "").trim(),
      finalUrl: targetUrl,
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "timeout" : error?.message || "browserless_failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaDirect(targetUrl, timeoutMs) {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const ua = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
    const result = await fetchTextOnce(targetUrl, timeoutMs, ua, "GET");
    if (result.ok) return result;
    lastError = result.error || "direct_failed";
  }
  return { ok: false, error: lastError };
}

async function fetchViaJinaMirror(targetUrl, timeoutMs) {
  const mirrorUrl = toJinaMirrorUrl(targetUrl);
  if (!mirrorUrl) return { ok: false, error: "invalid_source_url" };
  const result = await fetchTextOnce(mirrorUrl, timeoutMs, USER_AGENTS[0], "GET");
  if (!result.ok) return result;
  return {
    ...result,
    finalUrl: targetUrl,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Hook-Token,X-Policy-Hook-Token");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const requiredHookToken = String(
    process.env.POLICY_CHECK_BROWSER_HOOK_TOKEN || process.env.POLICY_FETCH_HOOK_TOKEN || ""
  ).trim();
  if (!requiredHookToken) {
    sendJson(res, 503, {
      ok: false,
      error: "hook_token_not_configured",
      message: "Set POLICY_CHECK_BROWSER_HOOK_TOKEN (or POLICY_FETCH_HOOK_TOKEN) on the service runtime.",
    });
    return;
  }

  const providedToken = readInboundHookToken(req);
  if (!safeEqualToken(requiredHookToken, providedToken)) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="policy-fetch-hook"');
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const body = parseBody(req);
  const targetUrl = String(body?.url || "").trim();
  if (!targetUrl) {
    sendJson(res, 400, { ok: false, error: "missing_url" });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_url" });
    return;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    sendJson(res, 400, { ok: false, error: "unsupported_protocol" });
    return;
  }

  const allowedHosts = parseAllowlist(process.env.POLICY_FETCH_ALLOWED_HOSTS);
  if (!isHostAllowed(parsedUrl.hostname, allowedHosts)) {
    sendJson(res, 403, { ok: false, error: "host_not_allowed", host: parsedUrl.hostname });
    return;
  }

  const timeoutMs = clampTimeout(body?.timeout_ms);
  const startedAt = Date.now();
  const attempts = [];

  const strategies = [
    { provider: "browserless", fn: () => fetchViaBrowserless(targetUrl, timeoutMs) },
    { provider: "direct", fn: () => fetchViaDirect(targetUrl, timeoutMs) },
    { provider: "jina_mirror", fn: () => fetchViaJinaMirror(targetUrl, timeoutMs) },
  ];

  for (const strategy of strategies) {
    const result = await strategy.fn();
    if (result.ok) {
      sendJson(res, 200, {
        ok: true,
        provider: strategy.provider,
        status: "ok",
        text: result.text,
        source_url: targetUrl,
        final_url: result.finalUrl || targetUrl,
        content_type: result.contentType || "",
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        attempts,
      });
      return;
    }

    attempts.push({
      provider: strategy.provider,
      error: result.error || "fetch_failed",
      status_code: result.statusCode || null,
      skipped: !!result.skipped,
    });
  }

  sendJson(res, 502, {
    ok: false,
    error: "all_fetch_strategies_failed",
    source_url: targetUrl,
    fetched_at_utc: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    attempts,
  });
}
