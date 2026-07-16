#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MCP_TOOL_CONFIG as refundTool } from "../api/mcp.js";
import { MCP_TOOL_CONFIG as cancelTool } from "../api/cancel-mcp.js";
import { MCP_TOOL_CONFIG as returnTool } from "../api/return-mcp.js";
import { MCP_TOOL_CONFIG as trialTool } from "../api/trial-mcp.js";
import {
  buildPolicyMcpServerCard,
  buildPolicyRegistryServer,
} from "../lib/policy-mcp-metadata.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolConfigs = [refundTool, cancelTool, returnTool, trialTool];

function writeJson(relativePath, value) {
  const path = join(repoRoot, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${relativePath}`);
}

writeJson("server.json", buildPolicyRegistryServer());
writeJson(
  "public/.well-known/mcp/server-card.json",
  buildPolicyMcpServerCard(toolConfigs.map((entry) => entry.tool))
);
