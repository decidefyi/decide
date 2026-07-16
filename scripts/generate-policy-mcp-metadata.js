#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MCP_TOOL_CONFIG as refundTool } from "../api/mcp.js";
import { MCP_TOOL_CONFIG as cancelTool } from "../api/cancel-mcp.js";
import { MCP_TOOL_CONFIG as returnTool } from "../api/return-mcp.js";
import { MCP_TOOL_CONFIG as trialTool } from "../api/trial-mcp.js";
import {
  buildPolicyMcpServerCard,
  buildPolicyRegistryServer,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolConfigs = [refundTool, cancelTool, returnTool, trialTool];

function writeJson(relativePath, value) {
  const path = join(repoRoot, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${relativePath}`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function toUcpInputs(tool) {
  const required = new Set(tool.inputSchema?.required || []);
  return Object.fromEntries(
    Object.entries(tool.inputSchema?.properties || {}).map(([name, schema]) => [
      name,
      { ...schema, required: required.has(name) },
    ])
  );
}

writeJson("server.json", buildPolicyRegistryServer());
writeJson(
  "public/.well-known/mcp/server-card.json",
  buildPolicyMcpServerCard(toolConfigs.map((entry) => entry.tool))
);

const agentCard = readJson("public/.well-known/agent-card.json");
writeJson("public/.well-known/agent-card.json", {
  ...agentCard,
  version: POLICY_MCP_VERSION,
  description: "Fail-closed subscription policy notaries for US consumers. One canonical four-tool MCP server with stable specialist compatibility endpoints.",
});

const toolByName = new Map(toolConfigs.map((entry) => [entry.tool.name, entry.tool]));
const ucp = readJson("public/.well-known/ucp.json");
writeJson("public/.well-known/ucp.json", {
  ...ucp,
  version: POLICY_MCP_VERSION,
  description: "Fail-closed subscription policy notaries for US consumers.",
  services: (ucp.services || []).map((service) => {
    const tool = toolByName.get(service.tool_name);
    return tool ? { ...service, inputs: toUcpInputs(tool) } : service;
  }),
});
