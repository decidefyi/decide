import { timingSafeEqual } from "node:crypto";

import decideHandler from "../../../../../api/decide.js";
import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../../rate-limit.js";
import { persistLog } from "../../../../log.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

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

function parseFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readHeader(req, name) {
  const expected = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(req?.headers || {})) {
    if (String(key).toLowerCase() !== expected) continue;
    const headerValue = Array.isArray(value) ? value[0] : value;
    return String(headerValue || "").trim();
  }
  return "";
}

function safeEqualToken(left, right) {
  const expected = String(left || "").trim();
  const received = String(right || "").trim();
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isProductionDeployment(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
}

function shouldRequireWorkflowAuth(env = process.env) {
  return Boolean(normalizeText(env.WORKFLOW_API_TOKEN, 1000)) ||
    isProductionDeployment(env) ||
    parseFlag(env.WORKFLOW_API_AUTH_REQUIRED);
}

function readBearerToken(req) {
  const authorization = readHeader(req, "authorization");
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : "";
}

function getWorkflowAuthState(req, env = process.env) {
  if (!shouldRequireWorkflowAuth(env)) return { authorized: true };

  const expectedToken = normalizeText(env.WORKFLOW_API_TOKEN, 1000);
  if (!expectedToken) {
    return {
      authorized: false,
      statusCode: 503,
      error: "WORKFLOW_AUTH_NOT_CONFIGURED",
      message: "The Zendesk reference workflow is not configured for production access.",
    };
  }

  if (!safeEqualToken(expectedToken, readBearerToken(req))) {
    return {
      authorized: false,
      statusCode: 401,
      error: "WORKFLOW_UNAUTHORIZED",
      message: "A valid Bearer token is required for this Zendesk reference workflow.",
    };
  }

  return { authorized: true };
}

function allowsDecisionOverride(env = process.env) {
  return String(env.NODE_ENV || "").trim().toLowerCase() === "test" && parseFlag(env.WORKFLOW_TEST_MODE);
}

function buildDecideAuthHeaders() {
  const sharedProxyToken = normalizeText(process.env.DECIDE_PROXY_SHARED_TOKEN, 1000);
  if (sharedProxyToken) {
    return {
      "x-decide-proxy-token": sharedProxyToken,
      "x-decide-rate-limit-bypass": "1"
    };
  }
  const decideApiKey = normalizeText(process.env.DECIDE_API_KEY, 1000);
  if (!decideApiKey) return {};
  return {
    authorization: `Bearer ${decideApiKey}`,
    "x-api-key": decideApiKey,
  };
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
    String(payload.days_since_purchase ?? ""),
    payload.region,
    payload.plan,
    String(payload.qualifying_conditions_met ?? ""),
    String(payload.offer_confirmed ?? ""),
    String(payload.observed_trial_days ?? ""),
    String(payload.observed_card_required ?? ""),
    String(payload.observed_auto_converts ?? ""),
    String(payload.billing_cadence ?? ""),
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

function buildZendeskTags({
  workflowType,
  workflowVersion,
  decisionClass,
  policy,
  action,
  policyTagPrefix,
  includeWorkflowTypeTag = true,
}) {
  const tags = [
    "decide",
    "decide_workflow",
    `wf_${workflowVersion}`,
    `decide_${decisionClass}`,
    `action_${action.type}`,
  ];
  if (includeWorkflowTypeTag) {
    tags.push(`workflow_${workflowType}`);
  }
  if (policy?.verdict) {
    tags.push(`${policyTagPrefix}_${String(policy.verdict).toLowerCase()}`);
  }
  return tags;
}

function buildPrivateNote({
  workflowType,
  workflowVersion,
  ticketId,
  requestId,
  decisionClass,
  action,
  policy,
  idempotencyKey,
  includeWorkflowTypeInPrivateNote = true,
}) {
  const policyLine = policy
    ? `${policy.verdict}${policy.code ? ` (${policy.code})` : ""}`
    : "SKIPPED";

  const lines = [
    `decide workflow: ${workflowVersion}`,
    `ticket_id: ${ticketId}`,
    `request_id: ${requestId}`,
    `decision: ${decisionClass}`,
    `policy: ${policyLine}`,
    `recommended_action: ${action.type}`,
    `reason: ${action.reason}`,
    `idempotency_key: ${idempotencyKey}`,
  ];

  if (includeWorkflowTypeInPrivateNote) {
    lines.splice(1, 0, `workflow_type: ${workflowType}`);
  }

  return lines.join("\n");
}

export function createZendeskWorkflowHandler(config) {
  const {
    workflowType,
    workflowVersion,
    logEventName,
    policyHandler,
    policyEndpoint,
    policyFailureCode,
    policyFailureMessage,
    requireDaysSincePurchase = false,
    defaultQuestion,
    buildPolicyBody,
    buildAction,
    policyTagPrefix = workflowType,
    includeWorkflowTypeTag = true,
    includeWorkflowTypeInPrivateNote = true,
  } = config;

  const rateLimiter = createRateLimiter(60, 60000);
  const idempotencyCache = new Map();

  function pruneIdempotencyCache(now) {
    for (const [key, entry] of idempotencyCache.entries()) {
      if (entry.expiresAt <= now) {
        idempotencyCache.delete(key);
      }
    }
  }

  return async function zendeskWorkflowHandler(req, res) {
    const endpointRequestId = rid();
    const ua = req.headers["user-agent"] || "unknown";
    const clientIp = getClientIp(req);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

    const workflowAuth = getWorkflowAuthState(req);
    if (!workflowAuth.authorized) {
      return json(res, workflowAuth.statusCode, {
        ok: false,
        request_id: endpointRequestId,
        error: workflowAuth.error,
        message: workflowAuth.message,
      });
    }

    const rateLimitResult = rateLimiter(clientIp);
    if (!rateLimitResult.allowed) {
      sendRateLimitError(res, rateLimitResult, endpointRequestId);
      await persistLog(logEventName, {
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

    const ticketId = normalizeText(body.ticket_id, 120);
    const vendor = normalizeText(body.vendor, 120).toLowerCase();
    const region = normalizeText(body.region, 20).toUpperCase() || "US";
    const plan = normalizeText(body.plan, 40).toLowerCase() || "individual";
    const daysSincePurchase = body.days_since_purchase === undefined ? null : parseDays(body.days_since_purchase);
    const inputWorkflowType = normalizeText(body.workflow_type, 40).toLowerCase() || workflowType;
    const question = normalizeText(body.question, 400) || defaultQuestion(vendor);
    const decisionOverride = normalizeDecision(body.decision_override);

    if (decisionOverride && !allowsDecisionOverride()) {
      return json(res, 400, {
        ok: false,
        request_id: endpointRequestId,
        error: "DECISION_OVERRIDE_TEST_ONLY",
        message: "decision_override is available only to explicit local and CI test processes.",
      });
    }

    if (!ticketId || !vendor || (requireDaysSincePurchase && daysSincePurchase === null)) {
      return json(res, 400, {
        ok: false,
        request_id: endpointRequestId,
        error: "MISSING_REQUIRED_FIELDS",
        message: requireDaysSincePurchase
          ? "ticket_id, vendor, and days_since_purchase are required"
          : "ticket_id and vendor are required",
      });
    }

    if (inputWorkflowType !== workflowType) {
      return json(res, 400, {
        ok: false,
        request_id: endpointRequestId,
        error: "UNSUPPORTED_WORKFLOW_TYPE",
        message: `Only workflow_type=${workflowType} is supported by this endpoint`,
      });
    }

    const payloadForKey = {
      ticket_id: ticketId,
      workflow_type: inputWorkflowType,
      vendor,
      days_since_purchase: daysSincePurchase,
      region,
      plan,
      qualifying_conditions_met: body.qualifying_conditions_met,
      offer_confirmed: body.offer_confirmed,
      observed_trial_days: body.observed_trial_days,
      observed_card_required: body.observed_card_required,
      observed_auto_converts: body.observed_auto_converts,
      billing_cadence: body.billing_cadence,
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
          ...buildDecideAuthHeaders(),
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
          message: `Unable to classify ${workflowType} workflow decision`,
          classify_status: decideResult.statusCode,
        });
      }
      decisionPayload = decideResult.json;
    }

    const decisionClass = normalizeDecision(decisionPayload.c) || "tie";
    const workflowRequestId = normalizeText(decisionPayload.request_id, 120) || rid();
    const decisionContract = decisionOverride
      ? {
          authority: "test_fixture",
          production_verdict: false,
          production_binding_required: true,
          binding_verdict_selector: "rulebook_v1",
        }
      : decisionPayload.decision_contract || {
          authority: "advisory_only",
          production_verdict: false,
          production_binding_required: true,
          binding_verdict_selector: "rulebook_v1",
        };
    let policyPayload = null;

    if (decisionClass === "yes") {
      const policyResult = await invokeJson(policyHandler, {
        method: "POST",
        headers: {
          "user-agent": ua,
          "content-type": "application/json",
        },
        body: buildPolicyBody({
          vendor,
          daysSincePurchase,
          region,
          plan,
          requestId: workflowRequestId,
          input: body,
        }),
        url: policyEndpoint,
        remoteAddress: clientIp,
      });

      if (policyResult.statusCode !== 200 || !policyResult.json || typeof policyResult.json.verdict !== "string") {
        return json(res, 502, {
          ok: false,
          request_id: endpointRequestId,
          decision_request_id: workflowRequestId,
          error: policyFailureCode,
          message: policyFailureMessage,
          policy_status: policyResult.statusCode,
        });
      }
      policyPayload = policyResult.json;
    }

    const action = buildAction({ decisionClass, policy: policyPayload });
    const tags = buildZendeskTags({
      workflowType,
      workflowVersion,
      decisionClass,
      policy: policyPayload,
      action,
      policyTagPrefix,
      includeWorkflowTypeTag,
    });
    const privateNote = buildPrivateNote({
      workflowType,
      workflowVersion,
      ticketId,
      requestId: workflowRequestId,
      decisionClass,
      action,
      policy: policyPayload,
      idempotencyKey,
      includeWorkflowTypeInPrivateNote,
    });
    const lineage = {
      policy_version:
        policyPayload?.policy_version ||
        decisionPayload?.policy_version ||
        workflowVersion,
      source_hash:
        policyPayload?.source_hash ||
        decisionPayload?.source_hash ||
        "workflow-source-unknown",
      evaluated_at:
        policyPayload?.evaluated_at ||
        decisionPayload?.evaluated_at ||
        new Date().toISOString(),
    };

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
        decision_contract: decisionContract,
      },
      workflow_contract: {
        schema_version: "zendesk_workflow_reference_contract_v1",
        authority: decisionContract.authority,
        production_verdict: false,
        production_binding_required: true,
        execution_allowed: false,
        binding_verdict_selector: "rulebook_v1",
      },
      policy: policyPayload,
      action: {
        type: action.type,
        reason: action.reason,
        execution_allowed: false,
        zendesk_tags: tags,
        zendesk_private_note: privateNote,
      },
      input_echo: {
        workflow_type: inputWorkflowType,
        question,
        vendor,
        days_since_purchase: daysSincePurchase,
        region,
        plan,
      },
      ...lineage,
    };

    idempotencyCache.set(idempotencyKey, {
      expiresAt: now + IDEMPOTENCY_TTL_MS,
      response: responsePayload,
    });

    await persistLog(logEventName, {
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
  };
}
