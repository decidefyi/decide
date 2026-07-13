const DEFAULT_QUALITY_MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const DEFAULT_LOW_LATENCY_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];

function parseConfiguredModels(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveGeminiModelProfile(mode) {
  return ["single", "multi"].includes(String(mode || "").trim().toLowerCase())
    ? "low_latency"
    : "quality";
}

export function resolveGeminiModelLadder({ profile = "quality", env = process.env } = {}) {
  const lowLatency = profile === "low_latency";
  const configured = parseConfiguredModels(
    lowLatency
      ? env.DECIDE_GEMINI_LOW_LATENCY_MODEL_LADDER
      : env.DECIDE_GEMINI_MODEL_LADDER
  );
  const defaults = lowLatency ? DEFAULT_LOW_LATENCY_MODELS : DEFAULT_QUALITY_MODELS;
  return [...new Set(configured.length ? configured : defaults)];
}
