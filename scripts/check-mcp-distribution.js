#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMcpDistributionHealthReport } from "../lib/mcp-distribution-health.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "server.json"), "utf8"));
const serverCard = JSON.parse(readFileSync(join(repoRoot, "public/.well-known/mcp/server-card.json"), "utf8"));
const endpoint = String(process.env.MCP_DISTRIBUTION_ENDPOINT || manifest?.remotes?.[0]?.url || "").trim();
const registryUrl = new URL("https://registry.modelcontextprotocol.io/v0.1/servers");
registryUrl.searchParams.set("search", manifest.name);

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function rpc(method, id) {
  return fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: method === "initialize" ? {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "decide-distribution-health", version: manifest.version },
      } : {},
    }),
  });
}

async function settledValue(promise, label, errors) {
  try {
    return await promise;
  } catch (error) {
    errors[label] = error?.message || String(error);
    return { _fetch_error: errors[label] };
  }
}

const fetchErrors = {};
const [initializeResult, toolsListResult, registryPayload] = await Promise.all([
  settledValue(rpc("initialize", "distribution-initialize"), "live_initialize", fetchErrors),
  settledValue(rpc("tools/list", "distribution-tools"), "live_tools", fetchErrors),
  settledValue(fetchJson(registryUrl), "official_registry", fetchErrors),
]);
const report = buildMcpDistributionHealthReport({
  manifest,
  serverCard,
  initializeResult,
  toolsListResult,
  registryPayload,
});
report.fetch_errors = fetchErrors;

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--strict") && report.critical_failures.length > 0) {
  process.exitCode = 1;
}
