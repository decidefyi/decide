import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, afterEach } from "node:test";
import middleware from "../middleware.js";
import metrics from "../api/metrics.js";

const token = "a".repeat(64); // Fictional fixture, never a deployment credential.
const tokenHash = createHash("sha256").update(token).digest("hex");
const originalMode = process.env.DECIDE_ORIGIN_GUARD;
const originalHash = process.env.DECIDE_ORIGIN_TOKEN_SHA256;

afterEach(() => {
  for (const [name, value] of [
    ["DECIDE_ORIGIN_GUARD", originalMode],
    ["DECIDE_ORIGIN_TOKEN_SHA256", originalHash],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("required origin protection denies direct requests without an edge token", async () => {
  process.env.DECIDE_ORIGIN_GUARD = "required";
  process.env.DECIDE_ORIGIN_TOKEN_SHA256 = tokenHash;
  const response = await middleware(new Request("https://api.decide.fyi/api/health"));
  assert.equal(response?.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "ORIGIN_ACCESS_DENIED" });
});

test("a valid edge token allows normal requests without becoming API authentication", async () => {
  process.env.DECIDE_ORIGIN_GUARD = "required";
  process.env.DECIDE_ORIGIN_TOKEN_SHA256 = tokenHash;
  for (const method of ["GET", "POST", "OPTIONS"]) {
    const request = new Request("https://api.decide.fyi/api/health", {
      method,
      headers: { "x-decide-origin-token": token },
    });
    assert.equal(await middleware(request), undefined);
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("x-metrics-token"), null);
  }
});

test("incomplete or unrecognized guard configuration fails closed", async () => {
  for (const mode of ["required", "require", "true", "REQUIRED"]) {
    for (const configuredHash of [undefined, "", "not-a-hash"]) {
      process.env.DECIDE_ORIGIN_GUARD = mode;
      if (configuredHash === undefined) delete process.env.DECIDE_ORIGIN_TOKEN_SHA256;
      else process.env.DECIDE_ORIGIN_TOKEN_SHA256 = configuredHash;
      const response = await middleware(new Request("https://api.decide.fyi/api/health", {
        headers: { "x-decide-origin-token": token },
      }));
      assert.equal(response?.status, 503, `mode ${mode}, invalid hash`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "ORIGIN_PROTECTION_UNAVAILABLE" });
    }
  }
});

test("strict protection covers provider aliases, paths, and spoofed proxy metadata", async () => {
  process.env.DECIDE_ORIGIN_GUARD = "required";
  process.env.DECIDE_ORIGIN_TOKEN_SHA256 = tokenHash;
  for (const host of ["api.decide.fyi", "policy.decide.fyi", "decide-alpha.vercel.app", "localhost:3000", "127.0.0.1:3000"]) {
    for (const path of ["/api/health", "/api/metrics", "/api/mcp", "/api/policy-mcp", "/favicon.svg", "/.well-known/rulebook-attestation-keys.json"]) {
      for (const supplied of [null, "b".repeat(64), `${token}, ${token}`, token.slice(1), token.toUpperCase()]) {
        const headers = {
          host,
          "x-forwarded-host": "localhost:3000",
          "cf-connecting-ip": "192.0.2.1",
          "cf-ray": "fictional-ray",
          origin: "https://www.decide.fyi",
        };
        if (supplied !== null) headers["x-decide-origin-token"] = supplied;
        const response = await middleware(new Request(`https://${host}${path}`, { headers }));
        assert.equal(response?.status, 403, `${host}${path}`);
      }
    }
  }
});

test("accepted edge requests retain MCP aliases, method, body, and auth headers", async () => {
  process.env.DECIDE_ORIGIN_GUARD = "required";
  process.env.DECIDE_ORIGIN_TOKEN_SHA256 = tokenHash;
  const originalFetch = globalThis.fetch;
  try {
    for (const surface of ["policy", "cancel", "return", "trial"]) {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      const request = new Request(`https://${surface}.decide.fyi/api/mcp`, {
        method: "POST",
        headers: {
          host: `${surface}.decide.fyi`,
          "content-type": "application/json",
          "x-decide-origin-token": token,
          authorization: "Bearer fictional-client-key",
        },
        body,
      });
      globalThis.fetch = async (destination, init) => {
        assert.equal(String(destination), `https://${surface}.decide.fyi/api/${surface}-mcp`);
        assert.equal(init.method, "POST");
        assert.equal(init.headers.get("x-decide-origin-token"), token);
        assert.equal(init.headers.get("authorization"), "Bearer fictional-client-key");
        assert.equal(await init.text(), body);
        return new Response(null, { status: 204 });
      };
      assert.equal((await middleware(request)).status, 204);
    }
    assert.equal(await middleware(new Request("https://refund.decide.fyi/api/mcp", {
      headers: { host: "refund.decide.fyi", "x-decide-origin-token": token },
    })), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unset and explicitly off guard preserve existing local and public routing", async () => {
  for (const mode of [undefined, "off"]) {
    if (mode === undefined) delete process.env.DECIDE_ORIGIN_GUARD;
    else process.env.DECIDE_ORIGIN_GUARD = mode;
    delete process.env.DECIDE_ORIGIN_TOKEN_SHA256;
    for (const host of ["api.decide.fyi", "localhost:3000", "127.0.0.1:3000"]) {
      assert.equal(await middleware(new Request(`https://${host}/api/health`, { headers: { host } })), undefined);
    }
  }
});

test("an accepted edge token does not grant private metrics access", async () => {
  process.env.DECIDE_ORIGIN_GUARD = "required";
  process.env.DECIDE_ORIGIN_TOKEN_SHA256 = tokenHash;
  const saved = new Map(["METRICS_ADMIN_TOKEN", "AXIOM_DATASET", "AXIOM_TOKEN"].map((name) => [name, process.env[name]]));
  process.env.METRICS_ADMIN_TOKEN = "fictional-metrics-secret";
  delete process.env.AXIOM_DATASET;
  delete process.env.AXIOM_TOKEN;
  try {
    for (const metricsToken of [null, token]) {
      const request = new Request("https://api.decide.fyi/api/metrics", {
        headers: { "x-decide-origin-token": token },
      });
      assert.equal(await middleware(request), undefined);
      const headers = Object.fromEntries(request.headers);
      if (metricsToken !== null) headers["x-metrics-token"] = metricsToken;
      let payload;
      const response = {
        setHeader() {},
        end(body) { payload = JSON.parse(body); },
      };
      await metrics({ method: "GET", headers, socket: { remoteAddress: "192.0.2.1" } }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(payload.limited, true);
      assert.equal(payload.message, "Provide x-metrics-token to access full metrics.");
      for (const privateField of ["mcp_adoption", "policy_funnel", "local_runtime"]) {
        assert.equal(Object.hasOwn(payload, privateField), false);
      }
    }
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
