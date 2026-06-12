import {
  TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
  TRUSTED_ADAPTER_EXECUTION_ISOLATION,
  TRUSTED_ADAPTER_RESOURCE_LIMITS,
  TRUSTED_ADAPTER_TIMEOUT_MS,
} from "./trusted-adapter-capabilities.js";

export const TRUSTED_ADAPTER_MANIFEST_VERSION = "trusted_adapter_manifest_v1";

function boundedInteger(value, min, max) {
  const numeric = Number(value);
  const rounded = Number.isFinite(numeric) ? Math.round(numeric) : min;
  return Math.max(min, Math.min(max, rounded));
}

function presentText(value, minLength) {
  return String(value || "").trim().length >= minLength;
}

function solanaExecutionGateV1(input) {
  const riskPenalty = { low: 6, medium: 16, high: 32 }[input.risk_level];
  const evidenceScore = { thin: 28, usable: 52, strong: 74 }[input.evidence_level];
  const policyScore =
    (input.quorum_signed ? 13 : -24) +
    (input.budget_within_policy ? 13 : -24) +
    (input.recipient_verified ? 12 : -28);
  const amountPenalty = Math.min(18, Math.round(input.sol_amount / 18));
  const rawScore = 48 + evidenceScore + policyScore - riskPenalty - amountPenalty;
  const decisionScore = Math.max(0, Math.min(100, Math.round(rawScore / 1.55)));
  const confidencePct = Math.max(
    38,
    Math.min(94, decisionScore + (input.evidence_level === "strong" ? 4 : -2))
  );

  return {
    sol_amount: input.sol_amount,
    risk_level: input.risk_level,
    evidence_level: input.evidence_level,
    quorum_signed: input.quorum_signed,
    budget_within_policy: input.budget_within_policy,
    recipient_verified: input.recipient_verified,
    decision_score: decisionScore,
    decision_edge_points: Math.round(decisionScore - 57),
    confidence_pct: confidencePct,
  };
}

function decisionMemoReadinessV1(input) {
  const optionCount = boundedInteger(input.option_count, 0, 6);
  const constraintCount = boundedInteger(input.constraint_count, 0, 12);
  const evidenceCount = boundedInteger(input.evidence_count, 0, 12);
  const blockerCount = boundedInteger(input.blocker_count, 0, 20);
  const warningCount = boundedInteger(input.warning_count, 0, 20);
  const questionPresent = presentText(input.question, 16);
  const ownerPresent = presentText(input.owner, 2);
  const kpiPresent = presentText(input.kpi_metric, 3);
  const hasBaseline = input.has_baseline === true;
  const hasTarget = input.has_target === true;
  const hasRunWindow = input.has_run_window === true;
  const missingCount =
    (questionPresent ? 0 : 1) +
    (ownerPresent ? 0 : 1) +
    (kpiPresent ? 0 : 1) +
    (optionCount >= 2 ? 0 : 1) +
    (constraintCount >= 1 ? 0 : 1) +
    (evidenceCount >= 1 ? 0 : 1) +
    (hasTarget ? 0 : 1) +
    (hasRunWindow ? 0 : 1) +
    blockerCount;
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      (questionPresent ? 18 : 0) +
        (ownerPresent ? 12 : 0) +
        (kpiPresent ? 16 : 0) +
        (optionCount >= 2 ? 16 : 0) +
        (optionCount >= 3 ? 4 : 0) +
        (constraintCount >= 1 ? 10 : 0) +
        (constraintCount >= 2 ? 2 : 0) +
        (evidenceCount >= 1 ? 8 : 0) +
        (evidenceCount >= 2 ? 4 : 0) +
        (hasTarget ? 4 : 0) +
        (hasRunWindow ? 4 : 0) +
        (hasBaseline ? 2 : 0) -
        blockerCount * 30
    )
  );
  let readinessBand = "needs_input";
  if (!questionPresent || !ownerPresent || !kpiPresent || optionCount < 2 || constraintCount < 1 || blockerCount > 0) {
    readinessBand = "blocked";
  } else if (readinessScore >= 82 && evidenceCount >= 1 && hasTarget && hasRunWindow) {
    readinessBand = "run_ready";
  }

  return {
    question_present: questionPresent,
    owner_present: ownerPresent,
    kpi_present: kpiPresent,
    option_count: optionCount,
    constraint_count: constraintCount,
    evidence_count: evidenceCount,
    has_baseline: hasBaseline,
    has_target: hasTarget,
    has_run_window: hasRunWindow,
    blocker_count: blockerCount,
    warning_count: warningCount,
    readiness_score: readinessScore,
    readiness_band: readinessBand,
    missing_count: missingCount,
  };
}

const SOLANA_EXECUTION_GATE_V1_MANIFEST = Object.freeze({
  manifest_version: TRUSTED_ADAPTER_MANIFEST_VERSION,
  adapter_id: "solana_execution_gate",
  version: "1.0.0",
  implementation_revision: "solana_execution_score_v1",
  description: "Normalizes bounded Solana treasury execution facts before declarative rulebook evaluation.",
  input_schema: {
    required: [
      "sol_amount",
      "risk_level",
      "evidence_level",
      "quorum_signed",
      "budget_within_policy",
      "recipient_verified",
    ],
    properties: {
      sol_amount: { type: "number", exclusive_minimum: 0, maximum: 1000000000 },
      risk_level: { type: "string", enum: ["low", "medium", "high"] },
      evidence_level: { type: "string", enum: ["thin", "usable", "strong"] },
      quorum_signed: { type: "boolean" },
      budget_within_policy: { type: "boolean" },
      recipient_verified: { type: "boolean" },
    },
    additional_properties: false,
  },
  output_schema: {
    properties: {
      sol_amount: { type: "number" },
      risk_level: { type: "string" },
      evidence_level: { type: "string" },
      quorum_signed: { type: "boolean" },
      budget_within_policy: { type: "boolean" },
      recipient_verified: { type: "boolean" },
      decision_score: { type: "integer", minimum: 0, maximum: 100 },
      decision_edge_points: { type: "integer", minimum: -57, maximum: 43 },
      confidence_pct: { type: "integer", minimum: 38, maximum: 94 },
    },
    additional_properties: false,
  },
  capabilities: {
    network_access: false,
    clock_access: false,
    randomness_access: false,
    environment_access: false,
    mutable_state: false,
  },
  execution_contract: {
    isolation: TRUSTED_ADAPTER_EXECUTION_ISOLATION,
    capability_enforcement: TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
    timeout_ms: TRUSTED_ADAPTER_TIMEOUT_MS,
    environment: "empty",
    resource_limits: TRUSTED_ADAPTER_RESOURCE_LIMITS,
  },
});

const DECISION_MEMO_READINESS_V1_MANIFEST = Object.freeze({
  manifest_version: TRUSTED_ADAPTER_MANIFEST_VERSION,
  adapter_id: "decision_memo_readiness",
  version: "1.0.0",
  implementation_revision: "decision_memo_readiness_score_v1",
  description: "Normalizes bounded Krafthaus decision memo packet readiness facts before declarative rulebook evaluation.",
  input_schema: {
    required: [
      "question",
      "owner",
      "kpi_metric",
      "option_count",
      "constraint_count",
      "evidence_count",
      "has_baseline",
      "has_target",
      "has_run_window",
      "blocker_count",
      "warning_count",
    ],
    properties: {
      question: { type: "string" },
      owner: { type: "string" },
      kpi_metric: { type: "string" },
      option_count: { type: "number", maximum: 1000 },
      constraint_count: { type: "number", maximum: 1000 },
      evidence_count: { type: "number", maximum: 1000 },
      has_baseline: { type: "boolean" },
      has_target: { type: "boolean" },
      has_run_window: { type: "boolean" },
      blocker_count: { type: "number", maximum: 1000 },
      warning_count: { type: "number", maximum: 1000 },
    },
    additional_properties: false,
  },
  output_schema: {
    properties: {
      question_present: { type: "boolean" },
      owner_present: { type: "boolean" },
      kpi_present: { type: "boolean" },
      option_count: { type: "integer", minimum: 0, maximum: 6 },
      constraint_count: { type: "integer", minimum: 0, maximum: 12 },
      evidence_count: { type: "integer", minimum: 0, maximum: 12 },
      has_baseline: { type: "boolean" },
      has_target: { type: "boolean" },
      has_run_window: { type: "boolean" },
      blocker_count: { type: "integer", minimum: 0, maximum: 20 },
      warning_count: { type: "integer", minimum: 0, maximum: 20 },
      readiness_score: { type: "integer", minimum: 0, maximum: 100 },
      readiness_band: { type: "string", enum: ["blocked", "needs_input", "run_ready"] },
      missing_count: { type: "integer", minimum: 0, maximum: 28 },
    },
    additional_properties: false,
  },
  capabilities: {
    network_access: false,
    clock_access: false,
    randomness_access: false,
    environment_access: false,
    mutable_state: false,
  },
  execution_contract: {
    isolation: TRUSTED_ADAPTER_EXECUTION_ISOLATION,
    capability_enforcement: TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
    timeout_ms: TRUSTED_ADAPTER_TIMEOUT_MS,
    environment: "empty",
    resource_limits: TRUSTED_ADAPTER_RESOURCE_LIMITS,
  },
});

const REGISTERED_ADAPTERS = new Map([
  [
    `${SOLANA_EXECUTION_GATE_V1_MANIFEST.adapter_id}@${SOLANA_EXECUTION_GATE_V1_MANIFEST.version}`,
    {
      manifest: SOLANA_EXECUTION_GATE_V1_MANIFEST,
      execute: solanaExecutionGateV1,
    },
  ],
  [
    `${DECISION_MEMO_READINESS_V1_MANIFEST.adapter_id}@${DECISION_MEMO_READINESS_V1_MANIFEST.version}`,
    {
      manifest: DECISION_MEMO_READINESS_V1_MANIFEST,
      execute: decisionMemoReadinessV1,
    },
  ],
]);

export function getRegisteredTrustedAdapter(adapterId, version) {
  return REGISTERED_ADAPTERS.get(`${String(adapterId || "").trim()}@${String(version || "").trim()}`) || null;
}
