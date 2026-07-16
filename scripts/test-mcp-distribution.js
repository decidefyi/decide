#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildMcpDistributionHealthReport } from "../lib/mcp-distribution-health.js";

const toolNames = [
  "refund_eligibility",
  "cancellation_penalty",
  "return_eligibility",
  "trial_terms",
];

function tool(name, complete = true) {
  return {
    name,
    ...(complete ? {
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: { type: "object" },
    } : {}),
  };
}

function baseInput() {
  return {
    manifest: {
      name: "io.github.decidefyi/policy-notaries",
      version: "1.3.0",
      remotes: [{ type: "streamable-http", url: "https://policy.decide.fyi/api/mcp" }],
    },
    serverCard: { tools: toolNames.map((name) => tool(name)) },
    initializeResult: { result: { serverInfo: { version: "1.3.0" } } },
    toolsListResult: { result: { tools: toolNames.map((name) => tool(name)) } },
    registryPayload: { servers: [] },
    now: new Date("2026-07-15T16:00:00Z"),
  };
}

function testTreatsMissingRegistryListingAsActionNotOutage() {
  const report = buildMcpDistributionHealthReport(baseInput());
  assert.equal(report.status, "action_required");
  assert.deepEqual(report.critical_failures, []);
  assert.ok(report.warnings.includes("official_registry_listing_missing"));
  assert.ok(report.actions.includes("publish_canonical_official_registry_version"));
}

function testTreatsMissingCanonicalToolAsOutage() {
  const input = baseInput();
  input.toolsListResult.result.tools = toolNames.slice(0, 3).map((name) => tool(name));
  const report = buildMcpDistributionHealthReport(input);
  assert.equal(report.status, "unhealthy");
  assert.ok(report.critical_failures.includes("live_tool_set_mismatch"));
}

function testDetectsStaleLiveMetadataWithoutBreakingRuntimeHealth() {
  const input = baseInput();
  input.toolsListResult.result.tools = toolNames.map((name) => tool(name, false));
  const report = buildMcpDistributionHealthReport(input);
  assert.equal(report.status, "action_required");
  assert.deepEqual(report.critical_failures, []);
  assert.ok(report.warnings.includes("live_tool_metadata_outdated"));
}

function testSeparatesRegistryOutageFromMissingListing() {
  const input = baseInput();
  input.registryPayload = { _fetch_error: "timeout" };
  const report = buildMcpDistributionHealthReport(input);
  assert.ok(report.warnings.includes("official_registry_unavailable"));
  assert.ok(!report.warnings.includes("official_registry_listing_missing"));
}

function testDistributionInventoryMatchesManifest() {
  const manifest = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
  const inventory = JSON.parse(readFileSync(new URL("../distribution/mcp-directories.json", import.meta.url), "utf8"));
  assert.equal(inventory.canonical_product.registry_name, manifest.name);
  assert.equal(inventory.canonical_product.version, manifest.version);
  assert.equal(inventory.canonical_product.endpoint, manifest.remotes[0].url);
  const ids = inventory.directories.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "directory IDs must be unique");
}

testTreatsMissingRegistryListingAsActionNotOutage();
console.log("PASS MCP distribution separates listing action from outage");
testTreatsMissingCanonicalToolAsOutage();
console.log("PASS MCP distribution detects live tool mismatch");
testDetectsStaleLiveMetadataWithoutBreakingRuntimeHealth();
console.log("PASS MCP distribution detects stale live metadata");
testSeparatesRegistryOutageFromMissingListing();
console.log("PASS MCP distribution separates registry outage from missing listing");
testDistributionInventoryMatchesManifest();
console.log("PASS MCP distribution inventory matches canonical manifest");
console.log("MCP distribution tests passed: 5/5");
