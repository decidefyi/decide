#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.decide.fyi";
const DEFAULT_QUESTION = "Should this support workflow use one deterministic API verdict for routing?";
const DEFAULT_TIMEOUT_MS = 15000;
const VALID_DECISIONS = new Set(["yes", "no", "tie"]);

function usage() {
  console.log(`Usage:
  DECIDE_SMOKE_API_KEY=<customer-key> npm run smoke:customer-key

Options:
  --base-url <url>       Target origin. Default: ${DEFAULT_BASE_URL}
  --key <key>            API key. Prefer DECIDE_SMOKE_API_KEY env so shell history stays clean.
  --question <text>      Single-verdict question for /api/decide.
  --timeout-ms <number>  Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --dry-run              Validate config and print the request shape without sending.
  --help                 Show this help.

Env:
  DECIDE_SMOKE_API_KEY       Customer/API key to verify.
  DECIDE_CUSTOMER_API_KEY    Alternate key env name.
  DECIDE_SMOKE_BASE_URL      Alternate target origin.
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.DECIDE_SMOKE_BASE_URL || DEFAULT_BASE_URL,
    key: process.env.DECIDE_SMOKE_API_KEY || process.env.DECIDE_CUSTOMER_API_KEY || "",
    question: DEFAULT_QUESTION,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++idx] || "";
    } else if (arg === "--key") {
      args.key = argv[++idx] || "";
    } else if (arg === "--question") {
      args.question = argv[++idx] || "";
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++idx] || DEFAULT_TIMEOUT_MS);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("base URL is required");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("base URL must use http or https");
  }
  return url.origin;
}

function redactKey(key) {
  const value = String(key || "");
  if (value.length <= 8) return "<redacted>";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function postJson(url, { key, question, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "decide-customer-key-smoke/1.0",
      },
      body: JSON.stringify({
        mode: "single",
        question,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`response was not JSON: ${text.slice(0, 160)}`);
    }
    return { response, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const endpoint = `${baseUrl}/api/decide`;
  const key = String(args.key || "").trim();
  const question = String(args.question || "").trim();
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!key) {
    throw new Error("missing DECIDE_SMOKE_API_KEY or --key");
  }
  if (question.length < 3) {
    throw new Error("question must be at least 3 characters");
  }

  if (args.dryRun) {
    console.log("DRY RUN customer key smoke");
    console.log(`endpoint=${endpoint}`);
    console.log(`key=${redactKey(key)}`);
    console.log(`question=${question}`);
    console.log("No request sent.");
    return;
  }

  const startedAt = Date.now();
  const { response, json } = await postJson(endpoint, { key, question, timeoutMs });
  const latencyMs = Date.now() - startedAt;

  if (response.status === 401) {
    throw new Error("customer key rejected with 401. Check provisioning, key copy/paste, and target environment.");
  }
  if (!response.ok) {
    throw new Error(`unexpected HTTP ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const decision = String(json.c || "").trim().toLowerCase();
  if (!VALID_DECISIONS.has(decision)) {
    throw new Error(`transport worked, but decision contract was not customer-ready: c=${JSON.stringify(json.c)} v=${JSON.stringify(json.v)}`);
  }
  if (!json.request_id || !json.policy_version || !json.source_hash) {
    throw new Error("decision response is missing request_id, policy_version, or source_hash");
  }

  console.log("PASS customer key smoke");
  console.log(`endpoint=${endpoint}`);
  console.log(`status=${response.status}`);
  console.log(`decision=${decision}`);
  console.log(`request_id=${json.request_id}`);
  console.log(`policy_version=${json.policy_version}`);
  console.log(`source_hash=${json.source_hash}`);
  console.log(`latency_ms=${latencyMs}`);
}

main().catch((error) => {
  console.error(`FAIL customer key smoke: ${error.message}`);
  process.exitCode = 1;
});
