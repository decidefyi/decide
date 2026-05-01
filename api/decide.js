import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../lib/rate-limit.js";
import { persistLog } from "../lib/log.js";
import { buildSourceHash, withLineage } from "../lib/lineage.js";
import { timingSafeEqual } from "node:crypto";

// Rate limiter: 20 requests per minute per IP
const rateLimiter = createRateLimiter(20, 60000);
const DECIDE_POLICY_VERSION = "decide_classifier_v1";
const DEFAULT_GEMINI_MODEL_LADDER = [
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

function rid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function normalize(s = "") {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function wantsAdvice(q) {
  return /\b(should i|do i|can i|is it (smart|good|bad)|worth it|recommend|what should i|what do i|help me decide)\b/.test(q);
}

function isFinanceAdvice(q) {
  const action = /\b(buy|sell|invest|trade|short|long|hold|dca|allocate|rebalance)\b/.test(q);
  const asset = /\b(bitcoin|btc|crypto|eth|ethereum|solana|token|coin|stock|shares?|etf|options?|futures|portfolio|yield|apy|apr|roi|price target)\b/.test(q);
  return (wantsAdvice(q) || action) && asset;
}

function isMedicalAdvice(q) {
  const action = /\b(diagnos|diagnose|treat|treatment|cure|take|dosage|dose|prescription|medication|medicine)\b/.test(q);
  const health = /\b(symptom|pain|fever|rash|infection|disease|illness|pregnan|anxiety|depression|adhd)\b/.test(q);
  return (wantsAdvice(q) || action) && health;
}

function isLegalAdvice(q) {
  const action = /\b(is this legal|can i be sued|should i sue|lawsuit|press charges|legal action|settle)\b/.test(q);
  const legal = /\b(lawyer|attorney|court|liability|criminal|nda|contract|immigration|visa|trademark|copyright)\b/.test(q);
  return (wantsAdvice(q) || action) && legal;
}

function parseMultiQuestion(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return { stem: "best option", options: [] };
  const segments = text.split("|").map((item) => item.trim()).filter(Boolean);
  if (segments.length < 2) return { stem: text, options: [] };

  let stem = "best option";
  const first = segments[0];
  const colonIndex = first.indexOf(":");
  if (colonIndex !== -1) {
    const parsedStem = first.slice(0, colonIndex).trim();
    if (parsedStem) stem = parsedStem;
    segments[0] = first.slice(colonIndex + 1).trim();
  }

  const options = segments.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { stem, options };
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function toStringArray(value, maxLength = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, maxLength);
}

function extractJson(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const withoutFence = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(withoutFence);
  } catch {}

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(withoutFence.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function sanitizeScore(n) {
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.max(1, Math.min(10, parsed));
  return Number(clamped.toFixed(1));
}

function sanitizeUnitScore(n) {
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return null;
  let normalized = parsed;
  if (normalized > 1) {
    // Treat slightly-above-1 values as overflows on a 0..1 scale; treat larger values as percent scale.
    normalized = normalized > 2 ? normalized / 100 : 1;
  }
  const clamped = Math.max(0, Math.min(1, normalized));
  return Number(clamped.toFixed(3));
}

function normalizeRisk(value, fallback = "medium") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return fallback;
}

function normalizeRuntimeCitations(citations) {
  if (!Array.isArray(citations)) return [];
  return citations
    .slice(0, 8)
    .map((entry, idx) => {
      if (typeof entry === "string") {
        const title = String(entry || "").trim();
        if (!title) return null;
        return {
          title,
          url: "",
          reasoning_lines: ["Derived from request context.", "Compared against provided constraints."],
        };
      }

      const item = asObject(entry);
      const title = String(item.title || item.name || item.label || `citation_${idx + 1}`).trim();
      const url = String(item.url || "").trim();
      const reasoningLines = toStringArray(item.reasoning_lines || item.reasoningLines, 6);
      return {
        title,
        url,
        reasoning_lines: reasoningLines.length
          ? reasoningLines
          : ["Derived from request context.", "Compared against provided constraints."],
      };
    })
    .filter(Boolean);
}

const SENSITIVE_INPUT_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|passphrase|authorization|cookie|session|email|phone|ssn|credit|card|iban|address|bearer)/i;

function summarizeInputEvidenceValue(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "number";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return `object(${Object.keys(value).length})`;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "text";
  return normalized.length > 24 ? `${normalized.slice(0, 21)}...` : normalized;
}

function buildInputEvidenceSummary(inputs = {}) {
  return Object.entries(asObject(inputs))
    .filter(([key]) => key && !SENSITIVE_INPUT_KEY_PATTERN.test(String(key)))
    .slice(0, 3)
    .map(([key, value]) => `${String(key)}=${summarizeInputEvidenceValue(value)}`);
}

function buildRuntimeFallbackEvidence(payload = {}, context = {}) {
  const next = {
    ...payload,
    tradeoffs: toStringArray(payload.tradeoffs, 8),
    next_actions: toStringArray(payload.next_actions, 8),
    citations: normalizeRuntimeCitations(payload.citations),
  };

  const scorecard = Array.isArray(next.scorecard) ? next.scorecard : [];
  const top = scorecard[0];
  const runnerUp = scorecard[1];
  const topLabel = String(top?.option || "top option").trim();
  const runnerUpLabel = String(runnerUp?.option || "next-best option").trim();
  const goal = String(context.goal || "").trim();
  const constraints = toStringArray(context.constraints, 12);
  const inputs = asObject(context.inputs);

  if (!next.tradeoffs.length) {
    next.tradeoffs = [
      `${topLabel} outperformed ${runnerUpLabel} on combined impact, confidence, and risk under the stated constraints.`,
    ];
  }

  if (!next.next_actions.length) {
    next.next_actions = [
      `Run a 14-day pilot for ${topLabel} with KPI and guardrail tracking.`,
      "Define rollback triggers and owner before launch.",
    ];
  }

  if (!next.citations.length) {
    const inputPairs = buildInputEvidenceSummary(inputs);
    const reasoning = [
      goal ? `Goal considered: ${goal}` : "Goal considered: maximize target KPI with constraints.",
      constraints[0] ? `Constraint considered: ${constraints[0]}` : "Constraint considered: preserve operational guardrails.",
    ];
    if (inputPairs.length) {
      reasoning.push(`Input evidence: ${inputPairs.join(", ")}`);
    } else if (Object.keys(inputs).length) {
      reasoning.push("Input evidence: structured inputs considered (sensitive values redacted).");
    }

    next.citations = [
      {
        title: "Requester context evidence",
        url: "",
        reasoning_lines: reasoning.slice(0, 6),
      },
    ];
  } else {
    next.citations = next.citations.map((citation) => {
      const item = asObject(citation);
      const reasoningLines = toStringArray(item.reasoning_lines || item.reasoningLines, 6);
      return {
        title: String(item.title || "runtime_citation").trim(),
        url: String(item.url || "").trim(),
        reasoning_lines: reasoningLines.length
          ? reasoningLines
          : ["Derived from request context.", "Compared against provided constraints."],
      };
    });
  }

  return next;
}

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

function readApiToken(req) {
  const headerToken = readHeader(req, "x-api-key");
  if (headerToken) return headerToken;

  const auth = readHeader(req, "authorization");
  if (!auth) return "";
  const parts = auth.split(/\s+/);
  if (parts.length !== 2) return "";
  if (parts[0].toLowerCase() !== "bearer") return "";
  return parts[1].trim();
}

function resolveGeminiModelLadder() {
  const configured = String(process.env.DECIDE_GEMINI_MODEL_LADDER || "")
    .split(",")
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const source = configured.length ? configured : DEFAULT_GEMINI_MODEL_LADDER;
  return [...new Set(source)];
}

function shouldRetryGeminiModel(statusCode, payload) {
  if ([400, 401].includes(Number(statusCode))) return false;
  if ([403, 404, 408, 409, 429, 500, 502, 503, 504].includes(Number(statusCode))) return true;
  const message = JSON.stringify(payload?.error || payload || "").toLowerCase();
  if (!message) return false;
  return /(quota|rate limit|resource exhausted|temporarily unavailable|unavailable|overloaded|not found|deprecated|unsupported)/.test(message);
}

async function requestGeminiGenerateContent({ apiKey, prompt, generationConfig, request_id }) {
  const attempts = [];
  let lastStatus = 0;
  let lastData = null;
  let lastError = null;

  for (const model of resolveGeminiModelLadder()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const startedAt = Date.now();
      const apiRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      });
      const data = await apiRes.json();
      attempts.push({ model, status: apiRes.status, latency_ms: Date.now() - startedAt });
      if (apiRes.ok) {
        return {
          ok: true,
          data,
          model,
          attempts,
        };
      }
      lastStatus = apiRes.status;
      lastData = data;
      if (!shouldRetryGeminiModel(apiRes.status, data)) {
        break;
      }
    } catch (error) {
      lastError = error;
      attempts.push({ model, status: 0, error: String(error?.message || error) });
    }
  }

  if (lastError) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        error: "GEMINI_MODEL_LADDER_EXHAUSTED",
        message: String(lastError?.message || lastError),
        attempts,
      })
    );
  }

  return {
    ok: false,
    status: lastStatus,
    data: lastData,
    attempts,
    error: lastError,
  };
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

function parseFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readTrustedProxyContext(req) {
  const expectedProxyToken = String(process.env.DECIDE_PROXY_SHARED_TOKEN || "").trim();
  const providedProxyToken = readHeader(req, "x-decide-proxy-token");
  const trusted = expectedProxyToken && safeEqualToken(expectedProxyToken, providedProxyToken);

  if (!trusted) {
    return {
      trusted: false,
      bypassRateLimit: false,
      clientIp: "",
      keyHash: "",
      plan: "",
      customerId: "",
    };
  }

  return {
    trusted: true,
    bypassRateLimit: parseFlag(readHeader(req, "x-decide-rate-limit-bypass")),
    clientIp: readHeader(req, "x-decide-client-ip"),
    keyHash: readHeader(req, "x-decide-client-key-hash"),
    plan: readHeader(req, "x-decide-plan"),
    customerId: readHeader(req, "x-decide-customer-id"),
  };
}

function sendDecisionJson(res, statusCode, payload, lineageInput = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  const sourceHash = buildSourceHash({
    policy: DECIDE_POLICY_VERSION,
    mode: lineageInput.mode || "single",
    question: lineageInput.question || "",
    stem: lineageInput.stem || "",
    options: Array.isArray(lineageInput.options) ? lineageInput.options : [],
  });
  res.end(JSON.stringify(withLineage(payload, {
    policyVersion: DECIDE_POLICY_VERSION,
    sourceHash,
  })));
}

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";
  const proxyContext = readTrustedProxyContext(req);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-API-Key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
    sendDecisionJson(res, 405, { c: "unclear", v: "try again", request_id }, { mode: "single" });
    return;
  }

  const clientIp = proxyContext.clientIp || getClientIp(req);
  const decideApiKey = String(process.env.DECIDE_API_KEY || "").trim();
  if (decideApiKey && !proxyContext.trusted) {
    const providedApiToken = readApiToken(req);
    if (!safeEqualToken(providedApiToken, decideApiKey)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="decide-api"');
      sendDecisionJson(
        res,
        401,
        {
          c: "unclear",
          v: "unauthorized",
          request_id,
          error: "DECIDE_API_UNAUTHORIZED",
          message: "Valid API key required for /api/decide.",
        },
        { mode: "single" }
      );
      await persistLog("decide_request", { request_id, event: "api_auth_failed", ip: clientIp, ua });
      return;
    }
  }

  const rateLimitKey = proxyContext.keyHash || clientIp;
  if (!proxyContext.bypassRateLimit) {
    const rateLimitResult = rateLimiter(rateLimitKey);
    if (!rateLimitResult.allowed) {
      sendRateLimitError(res, rateLimitResult, request_id);
      await persistLog("decide_request", {
        request_id,
        event: "rate_limit_exceeded",
        ip: clientIp,
        ua,
        trusted_proxy: proxyContext.trusted,
        decide_plan: proxyContext.plan || undefined,
        customer_id: proxyContext.customerId || undefined,
      });
      return;
    }
    addRateLimitHeaders(res, rateLimitResult);
  }

  try {
    let body = req.body || {};
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        sendDecisionJson(res, 400, { c: "unclear", v: "Invalid JSON body", request_id }, { mode: "single" });
        return;
      }
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const mode = String(body.mode || "").toLowerCase().trim();
    let stem = typeof body.stem === "string" ? body.stem.trim() : "";
    let options = Array.isArray(body.options) ? body.options.map((item) => String(item || "").trim()).filter(Boolean) : [];
    const runtimePrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const runtimeContext = asObject(body.context);
    const runtimeGoal = String(runtimeContext.goal || "").trim();
    const runtimeOptions = toStringArray(runtimeContext.options, 8);
    const runtimeConstraints = toStringArray(runtimeContext.constraints, 12);
    const runtimeInputs = asObject(runtimeContext.inputs);

    const multiRequested = mode === "multi" || options.length > 0 || question.includes("|");
    const runtimeRequested = Boolean(runtimePrompt && runtimeOptions.length >= 2);

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          request_id,
          error: "GEMINI_API_KEY_MISSING",
          ua,
        })
      );
      sendDecisionJson(res, 500, { c: "unclear", v: "try again", request_id }, { mode });
      return;
    }

    if (runtimeRequested) {
      const normalizedForPolicy = normalize(
        [runtimePrompt, runtimeGoal, runtimeOptions.join(" "), runtimeConstraints.join(" ")].join(" ")
      );
      if (isFinanceAdvice(normalizedForPolicy) || isMedicalAdvice(normalizedForPolicy) || isLegalAdvice(normalizedForPolicy)) {
        const category = isFinanceAdvice(normalizedForPolicy) ? "finance" : isMedicalAdvice(normalizedForPolicy) ? "medical" : "legal";
        sendDecisionJson(
          res,
          200,
          { c: "filtered", v: `Cannot provide ${category} advice`, request_id },
          { mode: "runtime", question: runtimePrompt, stem: runtimePrompt, options: runtimeOptions }
        );
        await persistLog("decide_runtime_request", { request_id, event: "filtered_question", category, ip: clientIp, ua });
        return;
      }

      const optionList = runtimeOptions.map((option, idx) => `${idx + 1}. ${option}`).join("\n");
      const prompt = `You are a strict decision engine.
Task: choose one recommended option and provide structured evidence.

Decision prompt: ${runtimePrompt}
Goal: ${runtimeGoal || "Select the highest-value option under stated constraints."}
Constraints:
${runtimeConstraints.length ? runtimeConstraints.map((item, idx) => `${idx + 1}. ${item}`).join("\n") : "none"}
Options:
${optionList}
Inputs JSON:
${JSON.stringify(runtimeInputs)}

Return ONLY JSON with this exact schema:
{
  "decision": {
    "recommended_option": "string",
    "confidence": 0.0
  },
  "scorecard": [
    {
      "option": "string",
      "score": 0.0,
      "confidence": 0.0,
      "impact": "string",
      "risk": "low|medium|high",
      "rank": 1
    }
  ],
  "tradeoffs": ["string"],
  "next_actions": ["string"],
  "citations": [
    {
      "title": "string",
      "url": "string",
      "reasoning_lines": ["string", "string"]
    }
  ]
}

Rules:
- recommended_option must match one option exactly
- include all options in scorecard
- include at least 1 tradeoff
- include at least 1 next_action
- include at least 1 citation
- each citation must include at least 2 reasoning_lines
- no markdown, no extra text`;

      const startedAt = Date.now();
      const runtimeResult = await requestGeminiGenerateContent({
        apiKey: API_KEY,
        prompt,
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
        request_id,
      });
      const data = runtimeResult.data;
      if (!runtimeResult.ok) {
        sendDecisionJson(
          res,
          200,
          { c: "unclear", v: "try again", request_id },
          { mode: "runtime", question: runtimePrompt, stem: runtimePrompt, options: runtimeOptions }
        );
        return;
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = asObject(extractJson(rawText));
      const parsedDecision = asObject(parsed.decision);
      const parsedScorecard = Array.isArray(parsed.scorecard) ? parsed.scorecard : [];

      let scorecard = runtimeOptions.map((option, idx) => {
        const row = parsedScorecard.find((entry) => {
          const item = asObject(entry);
          return String(item.option || item.id || item.label || "").trim() === option;
        });
        const item = asObject(row);
        const score = sanitizeScore(item.score);
        const confidence = sanitizeUnitScore(item.confidence);
        return {
          option,
          score: score === null ? Number(Math.max(1, 9 - idx * 0.8).toFixed(1)) : score,
          confidence: confidence === null ? Number(Math.max(0.5, 0.82 - idx * 0.08).toFixed(3)) : confidence,
          impact: String(item.impact || item.expected_impact || (idx === 0 ? "highest projected impact" : "lower projected impact")).trim(),
          risk: normalizeRisk(item.risk || item.risk_level, idx === 0 ? "low" : "medium"),
          rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : idx + 1,
        };
      });
      scorecard = scorecard
        .sort((left, right) => right.score - left.score)
        .map((row, idx) => ({ ...row, rank: idx + 1 }));

      const recommendedCandidate = String(parsedDecision.recommended_option || "").trim();
      const recommendedOption = runtimeOptions.includes(recommendedCandidate)
        ? recommendedCandidate
        : String(scorecard[0]?.option || runtimeOptions[0] || "").trim();
      const decisionConfidence = sanitizeUnitScore(parsedDecision.confidence);

      const payload = buildRuntimeFallbackEvidence(
        {
          c: "ok",
          v: "ok",
          request_id,
          status: "ok",
          engine: "decide",
          decision: {
            recommended_option: recommendedOption,
            confidence: decisionConfidence === null ? 0.67 : decisionConfidence,
          },
          scorecard,
          tradeoffs: toStringArray(parsed.tradeoffs, 8),
          next_actions: toStringArray(parsed.next_actions || parsed.nextActions, 8),
          citations: normalizeRuntimeCitations(parsed.citations),
          meta: {
            request_id,
            latency_ms: Date.now() - startedAt,
            model: runtimeResult.model,
            model_attempts: runtimeResult.attempts,
          },
        },
        {
          goal: runtimeGoal,
          constraints: runtimeConstraints,
          inputs: runtimeInputs,
        }
      );

      sendDecisionJson(res, 200, payload, {
        mode: "runtime",
        question: runtimePrompt,
        stem: runtimePrompt,
        options: runtimeOptions,
      });
      await persistLog("decide_runtime_request", {
        request_id,
        prompt: runtimePrompt,
        recommended_option: payload.decision?.recommended_option,
        confidence: payload.decision?.confidence,
        tradeoffs_count: payload.tradeoffs?.length || 0,
        next_actions_count: payload.next_actions?.length || 0,
        citations_count: payload.citations?.length || 0,
        gemini_model: runtimeResult.model,
        gemini_model_attempts: runtimeResult.attempts?.length || 0,
        ip: clientIp,
        ua,
        trusted_proxy: proxyContext.trusted,
        decide_plan: proxyContext.plan || undefined,
        customer_id: proxyContext.customerId || undefined,
      });
      return;
    }

    if (multiRequested) {
      if ((!stem || options.length < 2) && question) {
        const parsed = parseMultiQuestion(question);
        stem = stem || parsed.stem;
        if (options.length < 2) options = parsed.options;
      }

      if (!stem) stem = "best option";

      if (options.length < 2 || options.length > 8) {
        sendDecisionJson(res, 200, { c: "unclear", v: "Need 2-8 options", request_id }, { mode: "multi", question, stem, options });
        return;
      }

      const normalizedForPolicy = normalize(`${stem} ${options.join(" ")}`);
      if (isFinanceAdvice(normalizedForPolicy) || isMedicalAdvice(normalizedForPolicy) || isLegalAdvice(normalizedForPolicy)) {
        const category = isFinanceAdvice(normalizedForPolicy) ? "finance" : isMedicalAdvice(normalizedForPolicy) ? "medical" : "legal";
        sendDecisionJson(res, 200, { c: "filtered", v: `Cannot provide ${category} advice`, request_id }, { mode: "multi", question, stem, options });
        await persistLog("decide_multi_request", { request_id, event: "filtered_question", category, ip: clientIp, ua });
        return;
      }

      const optionList = options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");
      const prompt = `You are a strict comparative scoring engine.
Task: score each option for this decision and pick the best.

Decision stem: ${stem}
Options:
${optionList}

Return ONLY JSON with this exact schema:
{
  "scores": [number, ...],
  "reason": "short reason"
}

Rules:
- scores length must be exactly ${options.length}
- each score must be between 1.0 and 10.0
- use one decimal place
- evaluate comparatively, not independently
- no markdown, no extra text`;

      const multiResult = await requestGeminiGenerateContent({
        apiKey: API_KEY,
        prompt,
        generationConfig: { temperature: 0, maxOutputTokens: 220 },
        request_id,
      });
      const data = multiResult.data;
      if (!multiResult.ok) {
        sendDecisionJson(res, 200, { c: "unclear", v: "try again", request_id }, { mode: "multi", question, stem, options });
        return;
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = extractJson(rawText);
      const rawScores = Array.isArray(parsed?.scores) ? parsed.scores : [];

      if (rawScores.length !== options.length) {
        sendDecisionJson(res, 200, { c: "unclear", v: "try again", request_id }, { mode: "multi", question, stem, options });
        return;
      }

      const scores = rawScores.map(sanitizeScore);
      if (scores.some((score) => score === null)) {
        sendDecisionJson(res, 200, { c: "unclear", v: "try again", request_id }, { mode: "multi", question, stem, options });
        return;
      }

      const maxScore = Math.max(...scores);
      const EPSILON = 0.05;
      const tie_indices = scores
        .map((score, idx) => ({ score, idx }))
        .filter((entry) => Math.abs(entry.score - maxScore) <= EPSILON)
        .map((entry) => entry.idx);

      const winner_index = tie_indices[0] ?? 0;
      const tie = tie_indices.length > 1;

      const payload = {
        c: "ok",
        v: "ok",
        request_id,
        stem,
        winner_index,
        tie,
        tie_indices,
        scores,
        options: options.map((option, idx) => ({ index: idx, option, score: scores[idx] })),
      };

      sendDecisionJson(res, 200, payload, { mode: "multi", question, stem, options });
      await persistLog("decide_multi_request", {
        request_id,
        stem,
        winner_index,
        tie,
        tie_indices,
        scores,
        ip: clientIp,
        ua,
        gemini_model: multiResult.model,
        gemini_model_attempts: multiResult.attempts?.length || 0,
        trusted_proxy: proxyContext.trusted,
        decide_plan: proxyContext.plan || undefined,
        customer_id: proxyContext.customerId || undefined,
      });
      return;
    }

    const q = question;
    if (q.length < 3) {
      sendDecisionJson(res, 200, { c: "unclear", v: "Ask a question", request_id }, { mode: "single", question: q });
      return;
    }

    const nq = normalize(q);
    if (isFinanceAdvice(nq) || isMedicalAdvice(nq) || isLegalAdvice(nq)) {
      const category = isFinanceAdvice(nq) ? "finance" : isMedicalAdvice(nq) ? "medical" : "legal";
      sendDecisionJson(res, 200, { c: "filtered", v: `Cannot provide ${category} advice`, request_id }, { mode: "single", question: q });
      await persistLog("decide_request", {
        request_id,
        event: "filtered_question",
        category,
        ip: clientIp,
        ua,
        trusted_proxy: proxyContext.trusted,
        decide_plan: proxyContext.plan || undefined,
        customer_id: proxyContext.customerId || undefined,
      });
      return;
    }

    const prompt = `You're a decisive oracle. You must commit and find the differentiation factor. Output only "yes" or "no". No other text. Answer metaphorical questions based on intent.
User's question: ${q}
Output exactly one of: yes, no`;

    const singleResult = await requestGeminiGenerateContent({
      apiKey: API_KEY,
      prompt,
      generationConfig: { temperature: 0.7, maxOutputTokens: 10 },
      request_id,
    });
    const data = singleResult.data;
    if (!singleResult.ok) {
      sendDecisionJson(res, 200, { c: "unclear", v: "try again", request_id }, { mode: "single", question: q });
      return;
    }

    let out = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    out = out.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/[^\w\s]/g, "").trim();

    if (out === "yes") {
      sendDecisionJson(res, 200, { c: "yes", v: "yes", request_id }, { mode: "single", question: q });
    } else if (out === "no") {
      sendDecisionJson(res, 200, { c: "no", v: "no", request_id }, { mode: "single", question: q });
    } else {
      sendDecisionJson(res, 200, { c: "unclear", v: "try again", request_id }, { mode: "single", question: q });
    }

    await persistLog("decide_request", {
      request_id,
      method: req.method,
      verdict: out,
      gemini_model: singleResult.model,
      gemini_model_attempts: singleResult.attempts?.length || 0,
      ip: clientIp,
      ua,
      trusted_proxy: proxyContext.trusted,
      decide_plan: proxyContext.plan || undefined,
      customer_id: proxyContext.customerId || undefined,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        error: "INTERNAL_ERROR",
        message: String(err?.message || err),
        stack: err?.stack,
        ua,
      })
    );
    sendDecisionJson(res, 500, { c: "unclear", v: "try again", request_id }, { mode: "single" });
  }
}
