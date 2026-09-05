export const GEMINI_REQUEST_HARD_CAPS = Object.freeze({
  promptChars: 4096,
  timeoutMs: Object.freeze({
    single: 2000,
    multi: 8000,
    runtime: 8000,
  }),
  outputTokens: Object.freeze({
    single: 32,
    multi: 128,
    runtime: 512,
  }),
  thinkingLevel: "minimal",
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
  const hardTimeoutMs = GEMINI_REQUEST_HARD_CAPS.timeoutMs[safeMode];
  return {
    maxPromptChars: lowerOnlyInteger(
      env.DECIDE_GEMINI_MAX_PROMPT_CHARS,
      GEMINI_REQUEST_HARD_CAPS.promptChars,
      256,
      GEMINI_REQUEST_HARD_CAPS.promptChars
    ),
    timeoutMs: lowerOnlyInteger(
      env.DECIDE_GEMINI_TIMEOUT_MS,
      hardTimeoutMs,
      10,
      hardTimeoutMs
    ),
    maxOutputTokens: GEMINI_REQUEST_HARD_CAPS.outputTokens[safeMode],
    thinkingLevel: GEMINI_REQUEST_HARD_CAPS.thinkingLevel,
  };
}
