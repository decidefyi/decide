#!/usr/bin/env node

import assert from "node:assert/strict";

import handler from "../api/policy-fetch-hook.js";

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(value = "") {
      this.body = String(value || "");
    },
  };
}

function createHeaders(contentType = "application/json") {
  return {
    get(name) {
      return String(name || "").toLowerCase() === "content-type" ? contentType : null;
    },
  };
}

async function callHook() {
  const response = createResponse();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test-hook-token" },
    body: { url: "https://example.com/policy", timeout_ms: 3000 },
  }, response);
  return { response, payload: JSON.parse(response.body) };
}

const originalFetch = globalThis.fetch;
const trackedEnv = [
  "POLICY_CHECK_BROWSER_HOOK_TOKEN",
  "POLICY_FETCH_CLOUDFLARE_ACCOUNT_ID",
  "POLICY_FETCH_CLOUDFLARE_API_TOKEN",
  "POLICY_FETCH_CLOUDFLARE_CACHE_TTL_SECONDS",
  "POLICY_FETCH_BROWSERLESS_TOKEN",
  "POLICY_FETCH_BROWSERLESS_CONTENT_URL",
];
const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));

try {
  process.env.POLICY_CHECK_BROWSER_HOOK_TOKEN = "test-hook-token";
  process.env.POLICY_FETCH_CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.POLICY_FETCH_CLOUDFLARE_API_TOKEN = "test-cloudflare-token";
  process.env.POLICY_FETCH_CLOUDFLARE_CACHE_TTL_SECONDS = "21600";
  delete process.env.POLICY_FETCH_BROWSERLESS_TOKEN;

  let cloudflareRequest = null;
  globalThis.fetch = async (url, options = {}) => {
    cloudflareRequest = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      headers: createHeaders(),
      text: async () => JSON.stringify({
        success: true,
        result: "<html><body>Official cancellation policy</body></html>",
        errors: [],
      }),
    };
  };

  const cloudflareResult = await callHook();
  assert.equal(cloudflareResult.response.statusCode, 200);
  assert.equal(cloudflareResult.payload.provider, "cloudflare_browser_run");
  assert.match(cloudflareResult.payload.text, /Official cancellation policy/);
  assert.match(cloudflareRequest.url, /accounts\/test-account\/browser-rendering\/content/);
  assert.match(cloudflareRequest.url, /cacheTTL=21600/);
  assert.equal(cloudflareRequest.options.headers.Authorization, "Bearer test-cloudflare-token");
  assert.equal(JSON.parse(cloudflareRequest.options.body).url, "https://example.com/policy");
  console.log("PASS policy fetch hook prefers configured Cloudflare Browser Run");

  delete process.env.POLICY_FETCH_CLOUDFLARE_ACCOUNT_ID;
  delete process.env.POLICY_FETCH_CLOUDFLARE_API_TOKEN;
  process.env.POLICY_FETCH_BROWSERLESS_TOKEN = "test-browserless-token";
  delete process.env.POLICY_FETCH_BROWSERLESS_CONTENT_URL;

  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    requestedUrls.push(requestUrl);
    if (requestUrl.includes("browserless.io/content")) {
      return {
        ok: false,
        status: 401,
        url: requestUrl,
        headers: createHeaders("text/plain"),
        text: async () => "You've reached the units usage limit allowed under our free plan.",
      };
    }
    return {
      ok: false,
      status: 403,
      url: requestUrl,
      headers: createHeaders("text/plain"),
      text: async () => "Forbidden",
    };
  };

  const browserlessResult = await callHook();
  assert.equal(browserlessResult.response.statusCode, 502);
  assert.equal(
    browserlessResult.payload.attempts.find((attempt) => attempt.provider === "browserless")?.error,
    "browserless_quota_exhausted"
  );
  assert.ok(
    requestedUrls.some((url) => url.startsWith("https://production-sfo.browserless.io/content")),
    "expected the current Browserless shared-fleet endpoint"
  );
  console.log("PASS policy fetch hook reports Browserless quota exhaustion on the current endpoint");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("Policy fetch hook tests passed: 2/2");
