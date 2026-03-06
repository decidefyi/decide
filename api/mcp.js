import { compute, getSupportedVendors } from "../lib/refund-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";

const supportedVendors = getSupportedVendors();

const TOOL = {
  name: "refund_eligibility",
  description:
    "Check if a US consumer subscription purchase is eligible for a refund. Returns ALLOWED, DENIED, or UNKNOWN based on the vendor's refund policy window.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        enum: supportedVendors,
        description: "Vendor identifier (lowercase, underscore-separated).",
      },
      days_since_purchase: {
        type: "number",
        description: "Number of days since the subscription was purchased.",
        minimum: 0,
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
    required: ["vendor", "days_since_purchase", "region", "plan"],
  },
};

function formatTextMessage(payload) {
  return `Refund Eligibility: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nPolicy Updated: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export default createMcpHandler({
  compute,
  tool: TOOL,
  documentationUrl: "https://refund.decide.fyi",
  serverInfo: {
    name: "refund.decide.fyi",
    title: "RefundDecide Notary",
    version: "1.2.1",
    description: "Deterministic refund eligibility notary (stateless).",
    websiteUrl: "https://refund.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with refund_eligibility.",
  logPrefix: "MCP Request",
  logEventName: "mcp_request",
  formatTextMessage,
  buildCallLog: ({ method, clientIp, args, payload }) => ({
    method,
    ip: clientIp,
    vendor: args.vendor,
    days_since_purchase: args.days_since_purchase,
    region: args.region,
    plan: args.plan,
    verdict: payload.verdict,
    code: payload.code,
  }),
});
