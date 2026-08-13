export const GEMINI_REQUEST_HARD_CAPS = Object.freeze({
  promptChars: 4096,
  timeoutMs: 8000,
  outputTokens: Object.freeze({
    single: 8,
    multi: 128,
    runtime: 512,
  }),
  candidateCount: 1,
  thinkingBudget: 0,
});

function lowerOnlyInteger(value, fallback, min, hardMax) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), hardMax);
}

export function resolveGeminiRequestPolicy({ mode = "single", env = process.env } = {}) {
  const safeMode = Object.prototype.hasOwnProperty.call(GEMINI_REQUEST_HARD_CAPS.outputTokens, mode)
    ? mode
    : "single";
  return {
    maxPromptChars: lowerOnlyInteger(
      env.DECIDE_GEMINI_MAX_PROMPT_CHARS,
      GEMINI_REQUEST_HARD_CAPS.promptChars,
      256,
      GEMINI_REQUEST_HARD_CAPS.promptChars
    ),
    timeoutMs: lowerOnlyInteger(
      env.DECIDE_GEMINI_TIMEOUT_MS,
      GEMINI_REQUEST_HARD_CAPS.timeoutMs,
      10,
      GEMINI_REQUEST_HARD_CAPS.timeoutMs
    ),
    maxOutputTokens: GEMINI_REQUEST_HARD_CAPS.outputTokens[safeMode],
    candidateCount: GEMINI_REQUEST_HARD_CAPS.candidateCount,
    thinkingBudget: GEMINI_REQUEST_HARD_CAPS.thinkingBudget,
  };
}
