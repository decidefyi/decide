import { compute, getSupportedVendors } from "../lib/trial-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";

const supportedVendors = getSupportedVendors();

const TOOL = {
  name: "trial_terms",
  description:
    "Check free trial availability and terms for a US consumer subscription. Returns TRIAL_AVAILABLE or NO_TRIAL with trial length, card requirement, and auto-conversion status.",
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
        enum: ["individual"],
        description: "Plan type. Currently only 'individual' plans are supported.",
      },
    },
    required: ["vendor", "region", "plan"],
  },
};

function formatTextMessage(payload) {
  return `Trial Terms: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nTrial Days: ${payload.trial_days ?? "N/A"}\nCard Required: ${payload.card_required ?? "N/A"}\nAuto-Converts: ${payload.auto_converts ?? "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nPolicy Updated: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export default createMcpHandler({
  compute,
  tool: TOOL,
  documentationUrl: "https://trial.decide.fyi",
  serverInfo: {
    name: "trial.decide.fyi",
    title: "TrialDecide Notary",
    version: "1.2.1",
    description: "Deterministic free trial terms checker (stateless).",
    websiteUrl: "https://trial.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with trial_terms.",
  logPrefix: "Trial MCP Request",
  logEventName: "trial_mcp_request",
  formatTextMessage,
  buildCallLog: ({ method, clientIp, args, payload }) => ({
    method,
    ip: clientIp,
    vendor: args.vendor,
    region: args.region,
    plan: args.plan,
    verdict: payload.verdict,
    code: payload.code,
  }),
});
