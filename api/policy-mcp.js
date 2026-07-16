import { MCP_TOOL_CONFIG as refundTool } from "./mcp.js";
import { MCP_TOOL_CONFIG as cancelTool } from "./cancel-mcp.js";
import { MCP_TOOL_CONFIG as returnTool } from "./return-mcp.js";
import { MCP_TOOL_CONFIG as trialTool } from "./trial-mcp.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { POLICY_MCP_SERVER_INFO } from "../lib/policy-mcp-metadata.js";

export default createMcpHandler({
  tools: [refundTool, cancelTool, returnTool, trialTool],
  documentationUrl: "https://policy.decide.fyi",
  serverInfo: POLICY_MCP_SERVER_INFO,
  instructions: "Call tools/list, then tools/call with the policy tool that matches the support question.",
  logPrefix: "Policy MCP Request",
  logEventName: "policy_mcp_request",
});
