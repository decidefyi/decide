import { compute, getSupportedVendors } from "../lib/cancel-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
import {
  buildPolicyMcpOutputSchema,
  POLICY_MCP_READ_ONLY_ANNOTATIONS,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const supportedVendors = getSupportedVendors();

export const TOOL = {
  name: "cancellation_penalty",
  title: "Check cancellation penalty",
  description:
    "Check US subscription cancellation terms without executing cancellation. Typeform requires Basic, direct/self-serve platform subscription scope and returns CANCEL_AT_PERIOD_END, not an immediate cancellation or refund. Missing scope or current evidence returns UNKNOWN.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        enum: supportedVendors,
        description: "Vendor identifier (lowercase, underscore-separated).",
      },
      region: {
        type: "string",
        enum: ["US"],
        description: "Region code. Currently only 'US' is supported.",
      },
      plan: {
        type: "string",
        enum: ["individual", "basic"],
        description: "Use 'basic' for Typeform; 'individual' for other supported vendors.",
      },
      billing_cadence: {
        type: "string",
        enum: ["monthly", "annual"],
        description: "Required when the vendor applies different cancellation terms to monthly and annual plans.",
      },
      product: { type: "string", enum: ["platform_subscription"], description: "Required for Typeform. Excludes payments collected from form respondents." },
      purchase_channel: { type: "string", enum: ["direct"], description: "Required for Typeform. Third-party purchases are not covered." },
      contract_type: { type: "string", enum: ["self_serve"], description: "Required for Typeform. Custom and enterprise contracts are not covered." },
      requested_action: { type: "string", enum: ["cancel_at_period_end"], description: "Required for Typeform. Checks ending renewal at the paid term end; does not execute it." },
    },
    required: ["vendor", "region", "plan"],
  },
  outputSchema: buildPolicyMcpOutputSchema(["FREE_CANCEL", "CANCEL_AT_PERIOD_END", "PENALTY", "LOCKED", "UNKNOWN"], {
    policy: { type: "string" },
    penalty: { type: "string" },
    notice_days: { type: "number" },
    billing_cadence: { type: ["string", "null"] },
    cancellation_effective: { type: "string", enum: ["paid_term_end"] },
    execution_performed: { type: "boolean", const: false },
    cancellation_confirmed: { type: "boolean", const: false },
    refund: { type: "string", enum: ["not_evaluated"] },
  }),
  annotations: { ...POLICY_MCP_READ_ONLY_ANNOTATIONS },
};

function formatTextMessage(payload) {
  return `Cancellation Status: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nBilling Cadence: ${payload.billing_cadence || "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nSource Last Checked: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export const MCP_TOOL_CONFIG = {
  compute: async (args) => compute(args, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() }),
  tool: TOOL,
  formatTextMessage,
};

export default createMcpHandler({
  ...MCP_TOOL_CONFIG,
  documentationUrl: "https://cancel.decide.fyi",
  serverInfo: {
    name: "cancel.decide.fyi",
    title: "CancelDecide Notary",
    version: POLICY_MCP_VERSION,
    description: "Deterministic cancellation penalty checker (stateless).",
    websiteUrl: "https://cancel.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with cancellation_penalty.",
  logPrefix: "Cancel MCP Request",
  logEventName: "cancel_mcp_request",
});
