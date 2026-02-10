import decideHandler from "../../../../../api/decide.js";
import refundEligibilityHandler from "../../policies/refund-eligibility.js";
import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../../rate-limit.js";
import { persistLog } from "../../../../log.js";

const rateLimiter = createRateLimiter(60, 60000);
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyCache = new Map();

function rid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (payload !== null) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
    return;
  }
  res.end();
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeText(value, maxLen = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeDecision(value) {
  const decision = String(value || "").toLowerCase().trim();
  if (decision === "yes" || decision === "no" || decision === "tie") return decision;
  return "";
}

function parseDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function buildIdempotencyKey(payload) {
  const parts = [
    payload.ticket_id,
    payload.workflow_type,
    payload.vendor,
    String(payload.days_since_purchase),
    payload.region,
    payload.plan,
  ];
  return parts.join(":");
}

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

async function invokeJson(handler, reqOptions) {
  const req = createReq(reqOptions);
  const res = createRes();
  await handler(req, res);
  try {
    return { statusCode: res.statusCode, json: JSON.parse(res.body || "{}") };
  } catch {
    return { statusCode: res.statusCode, json: null };
  }
}

function pruneIdempotencyCache(now) {
  for (const [key, entry] of idempotencyCache.entries()) {
    if (entry.expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }
}

function buildZendeskAction({ decisionClass, policy }) {
  if (decisionClass === "tie") {
    return { type: "escalate_policy_owner", reason: "Classifier returned tie; manual policy owner review required." };
  }

  if (decisionClass === "no") {
    return { type: "deny_refund", reason: "Classifier returned no; case does not proceed to automated refund execution." };
  }

  if (!policy) {
    return { type: "escalate_policy_owner", reason: "Policy service unavailable; manual review required." };
  }

  if (policy.verdict === "ALLOWED") {
    return { type: "approve_refund", reason: "Policy verdict ALLOWED within vendor rules." };
  }

  if (policy.verdict === "DENIED") {
    return { type: "deny_refund", reason: "Policy verdict DENIED under vendor rules." };
  }

  return { type: "escalate_policy_owner", reason: "Policy verdict UNKNOWN; manual review required." };
}

function buildZendeskTags({ workflowVersion, decisionClass, policy, action }) {
  const tags = [
    "decide",
    "decide_workflow",
    `wf_${workflowVersion}`,
    `decide_${decisionClass}`,
    `action_${action.type}`,
  ];

  if (policy?.verdict) {
    tags.push(`refund_${String(policy.verdict).toLowerCase()}`);
  }
  return tags;
}

function buildPrivateNote({
  workflowVersion,
  ticketId,
  requestId,
  decisionClass,
  action,
  policy,
  idempotencyKey,
}) {
  const policyLine = policy
    ? `${policy.verdict}${policy.code ? ` (${policy.code})` : ""}`
    : "SKIPPED";

  return [
    `decide workflow: ${workflowVersion}`,
    `ticket_id: ${ticketId}`,
    `request_id: ${requestId}`,
    `decision: ${decisionClass}`,
    `policy: ${policyLine}`,
    `recommended_action: ${action.type}`,
    `reason: ${action.reason}`,
    `idempotency_key: ${idempotencyKey}`,
  ].join("\n");
}

export default async function zendeskRefundWorkflow(req, res) {
  const endpointRequestId = rid();
  const ua = req.headers["user-agent"] || "unknown";
  const clientIp = getClientIp(req);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return json(res, 204, null);
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      request_id: endpointRequestId,
      error: "METHOD_NOT_ALLOWED",
      allowed: ["POST"],
    });
  }

  const rateLimitResult = rateLimiter(clientIp);
  if (!rateLimitResult.allowed) {
    sendRateLimitError(res, rateLimitResult, endpointRequestId);
    await persistLog("workflow_zendesk_refund", {
      request_id: endpointRequestId,
      event: "rate_limit_exceeded",
      ip: clientIp,
      ua,
    });
    return;
  }
  addRateLimitHeaders(res, rateLimitResult);

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, {
      ok: false,
      request_id: endpointRequestId,
      error: "INVALID_JSON",
      message: "Request body must be valid JSON",
    });
  }

  const workflowVersion = "zendesk_refund_v1";
  const ticketId = normalizeText(body.ticket_id, 120);
  const vendor = normalizeText(body.vendor, 120).toLowerCase();
  const region = normalizeText(body.region, 20).toUpperCase() || "US";
  const plan = normalizeText(body.plan, 40).toLowerCase() || "individual";
  const daysSincePurchase = parseDays(body.days_since_purchase);
  const workflowType = normalizeText(body.workflow_type, 40).toLowerCase() || "refund";
  const question = normalizeText(body.question, 400) || `Should this ${vendor} refund request proceed under policy?`;
  const decisionOverride = normalizeDecision(body.decision_override);

  if (!ticketId || !vendor || daysSincePurchase === null) {
    return json(res, 400, {
      ok: false,
      request_id: endpointRequestId,
      error: "MISSING_REQUIRED_FIELDS",
      message: "ticket_id, vendor, and days_since_purchase are required",
    });
  }

  if (workflowType !== "refund") {
    return json(res, 400, {
      ok: false,
      request_id: endpointRequestId,
      error: "UNSUPPORTED_WORKFLOW_TYPE",
      message: "Only workflow_type=refund is supported by this endpoint",
    });
  }

  const payloadForKey = {
    ticket_id: ticketId,
    workflow_type: workflowType,
    vendor,
    days_since_purchase: daysSincePurchase,
    region,
    plan,
  };

  const idempotencyKey = normalizeText(body.idempotency_key, 200) || buildIdempotencyKey(payloadForKey);
  const now = Date.now();
  pruneIdempotencyCache(now);
  const cached = idempotencyCache.get(idempotencyKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader("X-Idempotent-Replay", "1");
    return json(res, 200, { ...cached.response, idempotent_replay: true });
  }

  let decisionPayload;
  if (decisionOverride) {
    decisionPayload = {
      c: decisionOverride,
      v: decisionOverride,
      request_id: rid(),
      source: "decision_override",
    };
  } else {
    const decideResult = await invokeJson(decideHandler, {
      method: "POST",
      headers: {
        "user-agent": ua,
        "content-type": "application/json",
      },
      body: { question, mode: "single" },
      url: "/api/decide",
      remoteAddress: clientIp,
    });

    const decisionClass = normalizeDecision(decideResult.json?.c);
    if (decideResult.statusCode !== 200 || !decisionClass) {
      return json(res, 502, {
        ok: false,
        request_id: endpointRequestId,
        error: "DECIDE_CLASSIFICATION_FAILED",
        message: "Unable to classify refund workflow decision",
        classify_status: decideResult.statusCode,
      });
    }
    decisionPayload = decideResult.json;
  }

  const decisionClass = normalizeDecision(decisionPayload.c) || "tie";
  const workflowRequestId = normalizeText(decisionPayload.request_id, 120) || rid();
  let policyPayload = null;

  if (decisionClass === "yes") {
    const policyResult = await invokeJson(refundEligibilityHandler, {
      method: "POST",
      headers: {
        "user-agent": ua,
        "content-type": "application/json",
      },
      body: {
        vendor,
        days_since_purchase: daysSincePurchase,
        region,
        plan,
      },
      url: "/api/v1/refund/eligibility",
      remoteAddress: clientIp,
    });

    if (policyResult.statusCode !== 200 || !policyResult.json || typeof policyResult.json.verdict !== "string") {
      return json(res, 502, {
        ok: false,
        request_id: endpointRequestId,
        decision_request_id: workflowRequestId,
        error: "REFUND_POLICY_CHECK_FAILED",
        message: "Unable to evaluate refund policy",
        policy_status: policyResult.statusCode,
      });
    }

    policyPayload = policyResult.json;
  }

  const action = buildZendeskAction({ decisionClass, policy: policyPayload });
  const tags = buildZendeskTags({ workflowVersion, decisionClass, policy: policyPayload, action });
  const privateNote = buildPrivateNote({
    workflowVersion,
    ticketId,
    requestId: workflowRequestId,
    decisionClass,
    action,
    policy: policyPayload,
    idempotencyKey,
  });

  const responsePayload = {
    ok: true,
    flow: workflowVersion,
    ticket_id: ticketId,
    idempotency_key: idempotencyKey,
    idempotent_replay: false,
    decision: {
      c: decisionClass,
      v: decisionPayload.v || decisionClass,
      request_id: workflowRequestId,
    },
    policy: policyPayload,
    action: {
      type: action.type,
      reason: action.reason,
      zendesk_tags: tags,
      zendesk_private_note: privateNote,
    },
    input_echo: {
      workflow_type: workflowType,
      question,
      vendor,
      days_since_purchase: daysSincePurchase,
      region,
      plan,
    },
  };

  idempotencyCache.set(idempotencyKey, {
    expiresAt: now + IDEMPOTENCY_TTL_MS,
    response: responsePayload,
  });

  await persistLog("workflow_zendesk_refund", {
    request_id: endpointRequestId,
    ticket_id: ticketId,
    decision_request_id: workflowRequestId,
    decision: decisionClass,
    policy_verdict: policyPayload?.verdict ?? null,
    policy_code: policyPayload?.code ?? null,
    action: action.type,
    workflow_version: workflowVersion,
    idempotency_key: idempotencyKey,
    ip: clientIp,
    ua,
  });

  return json(res, 200, responsePayload);
}
