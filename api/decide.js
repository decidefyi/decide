import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../lib/rate-limit.js";
import { persistLog } from "../lib/log.js";

// Rate limiter: 20 requests per minute per IP
const rateLimiter = createRateLimiter(20, 60000);

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

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimiter(clientIp);

  if (!rateLimitResult.allowed) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        event: "rate_limit_exceeded",
        ip: clientIp,
        ua,
      })
    );
    sendRateLimitError(res, rateLimitResult, request_id);
    await persistLog('decide_request', { request_id, event: 'rate_limit_exceeded', ip: clientIp, ua });
    return;
  }

  // Add rate limit headers to successful responses
  addRateLimitHeaders(res, rateLimitResult);

  try {
    // Extract question from POST
    let question = "";
    if (req.method === "POST") {
      let body = req.body || {};
      if (typeof req.body === "string") {
        try {
          body = JSON.parse(req.body);
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ c: "unclear", v: "Invalid JSON body", request_id }));
          return;
        }
      }
      question = body.question || "";
    } else {
      res.setHeader("Allow", ["POST", "OPTIONS"]);
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          request_id,
          error: "METHOD_NOT_ALLOWED",
          method: req.method,
          ua,
        })
      );
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
      return;
    }

    const q = typeof question === "string" ? question.trim() : "";

    // Validate question length
    if (q.length < 3) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          request_id,
          error: "QUESTION_TOO_SHORT",
          question_length: q.length,
          ua,
        })
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "Ask a question", request_id }));
      return;
    }

    const nq = normalize(q);

    // Filter sensitive advice categories
    if (isFinanceAdvice(nq) || isMedicalAdvice(nq) || isLegalAdvice(nq)) {
      const category = isFinanceAdvice(nq) ? "finance" : isMedicalAdvice(nq) ? "medical" : "legal";
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          request_id,
          event: "filtered_question",
          category,
          ua,
        })
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          c: "filtered",
          v: `Cannot provide ${category} advice`,
          request_id,
        })
      );
      await persistLog('decide_request', { request_id, event: 'filtered_question', category, ip: clientIp, ua });
      return;
    }

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
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
      return;
    }

    const MODEL = "gemini-2.0-flash-lite";
    const prompt = `You're a decisive oracle. You must commit and find the differentiation factor. Output only "yes" or "no". No other text. Answer metaphorical questions based on intent.
User's question: ${q}
Output exactly one of: yes, no`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 10 },
      }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          request_id,
          error: "GEMINI_API_ERROR",
          status: apiRes.status,
          data,
          ua,
        })
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
      return;
    }

    let out = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    out = out.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/[^\w\s]/g, "").trim();

    // Log successful response
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        method: req.method,
        verdict: out,
        ua,
      })
    );
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");

    if (out === "yes") {
      res.end(JSON.stringify({ c: "yes", v: "yes", request_id }));
    } else if (out === "no") {
      res.end(JSON.stringify({ c: "no", v: "no", request_id }));
    } else {
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
    }

    await persistLog('decide_request', { request_id, method: req.method, verdict: out, ip: clientIp, ua });
    return;
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
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
  }
}
