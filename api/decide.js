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

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimiter(clientIp);
  if (!rateLimitResult.allowed) {
    sendRateLimitError(res, rateLimitResult, request_id);
    await persistLog("decide_request", { request_id, event: "rate_limit_exceeded", ip: clientIp, ua });
    return;
  }
  addRateLimitHeaders(res, rateLimitResult);

  try {
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

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const mode = String(body.mode || "").toLowerCase().trim();
    let stem = typeof body.stem === "string" ? body.stem.trim() : "";
    let options = Array.isArray(body.options) ? body.options.map((item) => String(item || "").trim()).filter(Boolean) : [];

    const multiRequested = mode === "multi" || options.length > 0 || question.includes("|");

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    if (multiRequested) {
      if ((!stem || options.length < 2) && question) {
        const parsed = parseMultiQuestion(question);
        stem = stem || parsed.stem;
        if (options.length < 2) options = parsed.options;
      }

      if (!stem) stem = "best option";

      if (options.length < 2 || options.length > 8) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ c: "unclear", v: "Need 2-8 options", request_id }));
        return;
      }

      const normalizedForPolicy = normalize(`${stem} ${options.join(" ")}`);
      if (isFinanceAdvice(normalizedForPolicy) || isMedicalAdvice(normalizedForPolicy) || isLegalAdvice(normalizedForPolicy)) {
        const category = isFinanceAdvice(normalizedForPolicy) ? "finance" : isMedicalAdvice(normalizedForPolicy) ? "medical" : "legal";
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ c: "filtered", v: `Cannot provide ${category} advice`, request_id }));
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

      const apiRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 220 },
        }),
      });

      const data = await apiRes.json();
      if (!apiRes.ok) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
        return;
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = extractJson(rawText);
      const rawScores = Array.isArray(parsed?.scores) ? parsed.scores : [];

      if (rawScores.length !== options.length) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
        return;
      }

      const scores = rawScores.map(sanitizeScore);
      if (scores.some((score) => score === null)) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
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

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
      await persistLog("decide_multi_request", { request_id, stem, winner_index, tie, tie_indices, scores, ip: clientIp, ua });
      return;
    }

    const q = question;
    if (q.length < 3) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "Ask a question", request_id }));
      return;
    }

    const nq = normalize(q);
    if (isFinanceAdvice(nq) || isMedicalAdvice(nq) || isLegalAdvice(nq)) {
      const category = isFinanceAdvice(nq) ? "finance" : isMedicalAdvice(nq) ? "medical" : "legal";
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "filtered", v: `Cannot provide ${category} advice`, request_id }));
      await persistLog("decide_request", { request_id, event: "filtered_question", category, ip: clientIp, ua });
      return;
    }

    const prompt = `You're a decisive oracle. You must commit and find the differentiation factor. Output only "yes" or "no". No other text. Answer metaphorical questions based on intent.
User's question: ${q}
Output exactly one of: yes, no`;

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
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
      return;
    }

    let out = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    out = out.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/[^\w\s]/g, "").trim();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (out === "yes") {
      res.end(JSON.stringify({ c: "yes", v: "yes", request_id }));
    } else if (out === "no") {
      res.end(JSON.stringify({ c: "no", v: "no", request_id }));
    } else {
      res.end(JSON.stringify({ c: "unclear", v: "try again", request_id }));
    }

    await persistLog("decide_request", { request_id, method: req.method, verdict: out, ip: clientIp, ua });
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
