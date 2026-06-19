#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.decide.fyi";
const DEFAULT_TIMEOUT_MS = 15000;
const VALID_DECISIONS = new Set(["yes", "no"]);
const REQUIRED_DECISION_RECORD_FIELDS = [
  "decision_record_version",
  "decision_id",
  "request_id",
  "policy_version",
  "source_hash",
  "record_hash",
  "verify_url",
];
const REQUIRED_RULEBOOK_FIELDS = [
  "rulebook_contract",
  "runtime_binding",
  "application_verdict",
  "action",
  "reason_code",
  "matched_rule_id",
  "input_hash",
  "rulebook_attestation",
];
const RULEBOOK_SMOKE_BODY = Object.freeze({
  mode: "rulebook",
  rulebook: {
    schema_version: "rulebook_v1",
    rulebook_id: "customer_key_smoke",
    version: "2026-06-19",
    input_schema: {
      required: ["route_score"],
      properties: {
        route_score: { type: "number" },
      },
    },
    rules: [
      {
        rule_id: "approve_customer_key_smoke",
        priority: 100,
        condition: {
          field: "route_score",
          operator: "gte",
          value: 70,
        },
        outcome: {
          decision: "yes",
          verdict: "APPROVE",
          action: "allow_test_handoff",
          reason_code: "CUSTOMER_KEY_SMOKE_ALLOWED",
        },
      },
    ],
    default_outcome: {
      decision: "review",
      verdict: "REVIEW",
      action: "route_to_operator",
      reason_code: "CUSTOMER_KEY_SMOKE_REVIEW",
    },
  },
  context: {
    inputs: {
      route_score: 91,
    },
  },
});

function usage() {
  console.log(`Usage:
  DECIDE_SMOKE_API_KEY=<customer-key> npm run smoke:customer-key

Options:
  --base-url <url>       Target origin. Default: ${DEFAULT_BASE_URL}
  --key <key>            API key. Prefer DECIDE_SMOKE_API_KEY env so shell history stays clean.
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

async function postJson(url, { key, timeoutMs }) {
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
      body: JSON.stringify(RULEBOOK_SMOKE_BODY),
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
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!key) {
    throw new Error("missing DECIDE_SMOKE_API_KEY or --key");
  }

  if (args.dryRun) {
    console.log("DRY RUN customer key smoke");
    console.log(`endpoint=${endpoint}`);
    console.log(`key=${redactKey(key)}`);
    console.log(`mode=${RULEBOOK_SMOKE_BODY.mode}`);
    console.log(`rulebook_id=${RULEBOOK_SMOKE_BODY.rulebook.rulebook_id}`);
    console.log(`rulebook_version=${RULEBOOK_SMOKE_BODY.rulebook.version}`);
    console.log("No request sent.");
    return;
  }

  const startedAt = Date.now();
  const { response, json } = await postJson(endpoint, { key, timeoutMs });
  const latencyMs = Date.now() - startedAt;

  if (response.status === 401) {
    throw new Error("customer key rejected with 401. Check provisioning, key copy/paste, and target environment.");
  }
  if (!response.ok) {
    throw new Error(`unexpected HTTP ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const decision = String(json.verdict || json.c || "").trim().toLowerCase();
  if (!VALID_DECISIONS.has(decision)) {
    throw new Error(`transport worked, but decision contract was not customer-ready: verdict=${JSON.stringify(json.verdict)} c=${JSON.stringify(json.c)} v=${JSON.stringify(json.v)}`);
  }
  if (decision !== "yes" || json.application_verdict !== "APPROVE") {
    throw new Error(`rulebook smoke did not approve as expected: decision=${decision} application_verdict=${JSON.stringify(json.application_verdict)}`);
  }
  if (json.runtime_binding?.binding_mode !== "direct_declarative_rulebook") {
    throw new Error(`rulebook smoke returned unexpected binding mode: ${JSON.stringify(json.runtime_binding?.binding_mode)}`);
  }
  if (json.runtime_binding?.verdict_authority !== "declarative_rulebook") {
    throw new Error(`rulebook smoke returned unexpected verdict authority: ${JSON.stringify(json.runtime_binding?.verdict_authority)}`);
  }
  const missingFields = [
    ...REQUIRED_DECISION_RECORD_FIELDS.filter((field) => !json[field]),
    ...REQUIRED_RULEBOOK_FIELDS.filter((field) => !json[field]),
  ];
  if (json.decision_record_version !== "decision_record_v1") {
    missingFields.push("decision_record_version=decision_record_v1");
  }
  if (missingFields.length) {
    throw new Error(`decision response is missing public Decision Record fields: ${missingFields.join(", ")}`);
  }

  console.log("PASS customer key smoke");
  console.log(`endpoint=${endpoint}`);
  console.log(`status=${response.status}`);
  console.log(`decision=${decision}`);
  console.log(`decision_record_version=${json.decision_record_version}`);
  console.log(`decision_id=${json.decision_id}`);
  console.log(`request_id=${json.request_id}`);
  console.log(`application_verdict=${json.application_verdict}`);
  console.log(`binding_mode=${json.runtime_binding.binding_mode}`);
  console.log(`reason_code=${json.reason_code}`);
  console.log(`policy_version=${json.policy_version}`);
  console.log(`source_hash=${json.source_hash}`);
  console.log(`record_hash=${json.record_hash}`);
  console.log(`verify_url=${json.verify_url}`);
  console.log(`latency_ms=${latencyMs}`);
}

main().catch((error) => {
  console.error(`FAIL customer key smoke: ${error.message}`);
  process.exitCode = 1;
});
