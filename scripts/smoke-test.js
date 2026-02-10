import health from "../api/health.js";
import v1PolicyRoute from "../api/v1/[policy]/[action].js";
import refundMcp from "../api/mcp.js";
import cancelMcp from "../api/cancel-mcp.js";
import returnMcp from "../api/return-mcp.js";
import trialMcp from "../api/trial-mcp.js";
import track from "../api/track.js";
import metrics from "../api/metrics.js";
import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";

function createReq({
  method = "GET",
  headers = {},
  body,
  query = {},
  url = "/",
  remoteAddress = "127.0.0.1",
} = {}) {
  return {
    method,
    headers,
    body,
    query,
    url,
    socket: { remoteAddress },
    [Symbol.asyncIterator]: async function* () {
      if (typeof body === "string") {
        yield Buffer.from(body);
      }
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(chunk = "") {
      this.body += String(chunk ?? "");
    },
  };
}

function parseJson(label, body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    throw new Error(`${label}: response is not valid JSON (${error.message})`);
  }
}

async function runCase(label, handler, reqOptions, assertFn) {
  const req = createReq(reqOptions);
  const res = createRes();
  await handler(req, res);
  const json = parseJson(label, res.body);
  assertFn({ statusCode: res.statusCode, headers: res.headers, json });
  console.log(`PASS ${label}`);
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  await runCase(
    "health GET",
    health,
    { method: "GET" },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
    }
  );

  await runCase(
    "refund REST POST",
    v1PolicyRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.verdict === "ALLOWED", "expected ALLOWED");
      expect(json.code === "WITHIN_WINDOW", "expected WITHIN_WINDOW");
    }
  );

  await runCase(
    "cancel REST POST",
    v1PolicyRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(typeof json.verdict === "string", "expected verdict");
    }
  );

  await runCase(
    "return REST POST",
    v1PolicyRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      body: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.verdict === "RETURNABLE", "expected RETURNABLE");
    }
  );

  await runCase(
    "trial REST POST",
    v1PolicyRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      body: { vendor: "adobe", region: "US", plan: "individual" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(typeof json.verdict === "string", "expected verdict");
    }
  );

  await runCase(
    "refund MCP initialize",
    refundMcp,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.result?.protocolVersion === "2025-11-25", "expected protocolVersion");
    }
  );

  await runCase(
    "cancel MCP tools/list",
    cancelMcp,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(Array.isArray(json.result?.tools), "expected tools array");
    }
  );

  await runCase(
    "return MCP tools/call",
    returnMcp,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      body: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "return_eligibility",
          arguments: { vendor: "adobe", days_since_purchase: 5, region: "US", plan: "individual" },
        },
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(Array.isArray(json.result?.content), "expected content array");
    }
  );

  await runCase(
    "trial MCP tools/call",
    trialMcp,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test" },
      body: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "trial_terms",
          arguments: { vendor: "adobe", region: "US", plan: "individual" },
        },
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(Array.isArray(json.result?.content), "expected content array");
    }
  );

  await runCase(
    "zendesk refund workflow POST",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test", "content-type": "application/json" },
      url: "/api/v1/workflows/zendesk/refund",
      query: { workflow: "refund" },
      body: {
        ticket_id: "ZD-SMOKE-1",
        workflow_type: "refund",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        question: "Should this Adobe refund request proceed under policy?",
        decision_override: "yes",
        idempotency_key: "ZD-SMOKE-1:refund:adobe:5:US:individual",
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "ALLOWED", "expected ALLOWED policy");
      expect(json.action?.type === "approve_refund", "expected approve_refund action");
    }
  );

  await runCase(
    "zendesk cancel workflow POST",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test", "content-type": "application/json" },
      url: "/api/v1/workflows/zendesk/cancel",
      query: { workflow: "cancel" },
      body: {
        ticket_id: "ZD-SMOKE-2",
        workflow_type: "cancel",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        question: "Should this Adobe cancellation request proceed under policy?",
        decision_override: "yes",
        idempotency_key: "ZD-SMOKE-2:cancel:adobe::US:individual",
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "PENALTY", "expected PENALTY policy");
      expect(json.action?.type === "escalate_with_penalty_disclosure", "expected penalty escalation action");
    }
  );

  await runCase(
    "zendesk return workflow POST",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test", "content-type": "application/json" },
      url: "/api/v1/workflows/zendesk/return",
      query: { workflow: "return" },
      body: {
        ticket_id: "ZD-SMOKE-3",
        workflow_type: "return",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        question: "Should this Adobe return request proceed under policy?",
        decision_override: "yes",
        idempotency_key: "ZD-SMOKE-3:return:adobe:5:US:individual",
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "RETURNABLE", "expected RETURNABLE policy");
      expect(json.action?.type === "approve_return", "expected approve_return action");
    }
  );

  await runCase(
    "zendesk trial workflow POST",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test", "content-type": "application/json" },
      url: "/api/v1/workflows/zendesk/trial",
      query: { workflow: "trial" },
      body: {
        ticket_id: "ZD-SMOKE-4",
        workflow_type: "trial",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        question: "Should this Adobe trial request proceed under policy?",
        decision_override: "yes",
        idempotency_key: "ZD-SMOKE-4:trial:adobe::US:individual",
      },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "TRIAL_AVAILABLE", "expected TRIAL_AVAILABLE policy");
      expect(json.action?.type === "approve_trial", "expected approve_trial action");
    }
  );

  await runCase(
    "track POST",
    track,
    {
      method: "POST",
      headers: { "user-agent": "smoke-test", "content-type": "application/json" },
      url: "/api/track",
      body: { event: "smoke_event", props: { source: "smoke" } },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
    }
  );

  await runCase(
    "metrics GET",
    metrics,
    {
      method: "GET",
      headers: { "user-agent": "smoke-test" },
      url: "/api/metrics",
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(typeof json.total_events === "number", "expected total_events number");
    }
  );

  console.log("Smoke test complete.");
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
