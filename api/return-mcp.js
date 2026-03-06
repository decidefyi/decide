import { compute, getSupportedVendors } from "../lib/return-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";

const supportedVendors = getSupportedVendors();

const TOOL = {
  name: "return_eligibility",
  description:
    "Check if a US consumer subscription purchase can be returned. Returns RETURNABLE, EXPIRED, or NON_RETURNABLE with return type (full_refund, prorated, credit) and method.",
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
  return `Return Eligibility: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nReturn Type: ${payload.return_type || "N/A"}\nMethod: ${payload.method || "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nPolicy Updated: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export default createMcpHandler({
  compute,
  tool: TOOL,
  documentationUrl: "https://return.decide.fyi",
  serverInfo: {
    name: "return.decide.fyi",
    title: "ReturnDecide Notary",
    version: "1.2.1",
    description: "Deterministic return eligibility checker (stateless).",
    websiteUrl: "https://return.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with return_eligibility.",
  logPrefix: "Return MCP Request",
  logEventName: "return_mcp_request",
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
