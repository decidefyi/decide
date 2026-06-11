import {
  TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT,
  TRUSTED_ADAPTER_EXECUTION_ISOLATION,
  TRUSTED_ADAPTER_RESOURCE_LIMITS,
  TRUSTED_ADAPTER_TIMEOUT_MS,
} from "./trusted-adapter-capabilities.js";

export const TRUSTED_ADAPTER_MANIFEST_VERSION = "trusted_adapter_manifest_v1";

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

const REGISTERED_ADAPTERS = new Map([
  [
    `${SOLANA_EXECUTION_GATE_V1_MANIFEST.adapter_id}@${SOLANA_EXECUTION_GATE_V1_MANIFEST.version}`,
    {
      manifest: SOLANA_EXECUTION_GATE_V1_MANIFEST,
      execute: solanaExecutionGateV1,
    },
  ],
]);

export function getRegisteredTrustedAdapter(adapterId, version) {
  return REGISTERED_ADAPTERS.get(`${String(adapterId || "").trim()}@${String(version || "").trim()}`) || null;
}
