import zendeskRefundWorkflow from "../api/v1/workflows/zendesk/refund.js";

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
    throw new Error(`${label}: invalid JSON (${error.message})`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(label, reqOptions, assertFn) {
  const req = createReq(reqOptions);
  const res = createRes();
  await zendeskRefundWorkflow(req, res);
  const json = parseJson(label, res.body);
  assertFn({ statusCode: res.statusCode, headers: res.headers, json });
  console.log(`PASS ${label}`);
}

async function main() {
  const basePayload = {
    ticket_id: "ZD-9001",
    customer_id: "cus_789",
    workflow_type: "refund",
    question: "Should this Adobe annual plan refund request proceed under policy?",
    vendor: "adobe",
    region: "US",
    plan: "individual",
    days_since_purchase: 5,
    idempotency_key: "ZD-9001:refund:adobe:5:US:individual",
  };

  await runCase(
    "workflow example => approve_refund",
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: { ...basePayload, decision_override: "yes" },
      url: "/api/v1/workflows/zendesk/refund",
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "ALLOWED", "expected policy ALLOWED");
      expect(json.policy?.code === "WITHIN_WINDOW", "expected policy code WITHIN_WINDOW");
      expect(json.action?.type === "approve_refund", "expected action approve_refund");
      expect(Array.isArray(json.action?.zendesk_tags), "expected zendesk_tags");
      expect(json.action.zendesk_tags.includes("refund_allowed"), "expected refund_allowed tag");
      expect(String(json.action?.zendesk_private_note || "").includes("request_id:"), "expected request_id in note");
    }
  );

  await runCase(
    "idempotency replay returns cached result",
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: { ...basePayload, decision_override: "yes" },
      url: "/api/v1/workflows/zendesk/refund",
    },
    ({ statusCode, headers, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(headers["X-Idempotent-Replay"] === "1", "expected idempotent replay header");
      expect(json.idempotent_replay === true, "expected idempotent_replay=true");
      expect(json.action?.type === "approve_refund", "expected cached approve_refund");
    }
  );

  await runCase(
    "tie path => escalate_policy_owner",
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ...basePayload,
        ticket_id: "ZD-9002",
        idempotency_key: "ZD-9002:refund:adobe:5:US:individual",
        decision_override: "tie",
      },
      url: "/api/v1/workflows/zendesk/refund",
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.decision?.c === "tie", "expected decision tie");
      expect(json.policy === null, "expected no policy call on tie");
      expect(json.action?.type === "escalate_policy_owner", "expected escalation");
    }
  );

  console.log("Workflow test complete.");
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
