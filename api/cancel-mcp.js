import { compute, getSupportedVendors } from "../lib/cancel-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";

const supportedVendors = getSupportedVendors();

const TOOL = {
  name: "cancellation_penalty",
  description:
    "Check if cancelling a US consumer subscription will incur a penalty or fee. Returns FREE_CANCEL, PENALTY, or LOCKED.",
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
  return `Cancellation Status: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nPolicy Updated: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export default createMcpHandler({
  compute,
  tool: TOOL,
  documentationUrl: "https://cancel.decide.fyi",
  serverInfo: {
    name: "cancel.decide.fyi",
    title: "CancelDecide Notary",
    version: "1.2.1",
    description: "Deterministic cancellation penalty checker (stateless).",
    websiteUrl: "https://cancel.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with cancellation_penalty.",
  logPrefix: "Cancel MCP Request",
  logEventName: "cancel_mcp_request",
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
