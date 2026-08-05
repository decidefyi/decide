export const DEFAULT_PAID_GEMINI_MODEL = "gemini-2.5-flash-lite";

const REVIEWED_PAID_GEMINI_MODELS = new Set([
  DEFAULT_PAID_GEMINI_MODEL,
  "gemini-3.1-flash-lite",
]);

export function resolveGeminiRuntimePolicy({ env = process.env } = {}) {
  const requestedMode = String(env.DECIDE_GEMINI_MODE || "").trim().toLowerCase();

  if (!requestedMode) {
    return {
      enabled: false,
      mode: "disabled",
      reason: "zero_cost_default",
      model: null,
    };
  }

  if (requestedMode === "disabled") {
    return {
      enabled: false,
      mode: "disabled",
      reason: "zero_cost_disabled",
      model: null,
    };
  }

  if (requestedMode !== "paid") {
    return {
      enabled: false,
      mode: "disabled",
      reason: "mode_not_allowed",
      model: null,
    };
  }

  const requestedModel = String(env.DECIDE_GEMINI_MODEL || DEFAULT_PAID_GEMINI_MODEL).trim();
  if (!REVIEWED_PAID_GEMINI_MODELS.has(requestedModel)) {
    return {
      enabled: false,
      mode: "paid",
      reason: "model_not_allowed",
      model: null,
    };
  }

  return {
    enabled: true,
    mode: "paid",
    reason: null,
    model: requestedModel,
  };
}

// Retained for internal compatibility while removing all fallback behavior.
// A valid paid policy selects exactly one reviewed model; every other state
// resolves to an empty list and therefore cannot issue a provider request.
export function resolveGeminiModelLadder({ env = process.env } = {}) {
  const policy = resolveGeminiRuntimePolicy({ env });
  return policy.enabled ? [policy.model] : [];
}
