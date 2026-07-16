#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS site-bridge ${message}`);
}

const html = read("public/index.html");
const server = JSON.parse(read("server.json"));
const readme = read("README.md");
const customerRunbook = read("docs/FIRST_CUSTOMER_RUNBOOK.md");
const customerSmoke = read("scripts/customer-key-smoke.js");

assert(html.includes("decide.fyi is the Decision API engine"), "home page should position Decide as API engine");
assert(html.includes("Binding production verdicts use Rulebook v1"), "home page should lead with the production rulebook boundary");
assert(html.includes("Legacy LLM-assisted modes are advisory only"), "home page should separate advisory modes from production verdicts");
assert(html.includes("Reference applications show the same contract powering workflow apps, policy MCPs"), "home page should show proof applications");
assert(html.includes("Applications prove the primitive"), "home page should frame applications as proof");
assert(!html.includes("Krafthaus"), "home page should stay Decide-only");
assert(!html.includes("krafthaus"), "home page should not mention external product brand");
pass("Decide root positions engine and proof applications");

assert(html.includes("This Decide URL remains the stable MCP and REST runtime"), "notary subdomain copy should preserve stable runtime message");
assert(html.includes("policy-check reference applications"), "notary subdomain copy should frame reference applications");
pass("notary subdomain runtime copy is present");

const canonicalEndpoint = "https://policy.decide.fyi/api/mcp";
assert(html.includes(canonicalEndpoint), "public bridge page should lead with the canonical policy MCP endpoint");
assert(
  server.remotes.length === 1 && server.remotes[0]?.url === canonicalEndpoint,
  "server.json should publish one canonical policy MCP remote",
);
assert(readme.includes(canonicalEndpoint), "README should lead MCP installation with the canonical endpoint");
assert(
  readme.includes("Specialist compatibility configuration"),
  "README should preserve an explicit specialist compatibility configuration",
);

for (const endpoint of [
  "https://refund.decide.fyi/api/mcp",
  "https://cancel.decide.fyi/api/mcp",
  "https://return.decide.fyi/api/mcp",
  "https://trial.decide.fyi/api/mcp",
]) {
  assert(html.includes(endpoint), `public bridge page should preserve endpoint ${endpoint}`);
}
pass("canonical MCP install and specialist compatibility remotes are separated");

assert(!html.includes("Deterministic decision infrastructure: REST endpoints for systems, plus MCP notaries for agents."), "old mixed product positioning should be removed");
assert(!html.includes("Stable runtime endpoints for deterministic system and agent decisions."), "old broad runtime positioning should be removed");
assert(!server.description.includes("Krafthaus"), "server metadata should stay Decide-only");
pass("old mixed product positioning is absent");

for (const source of [
  ["README", readme],
  ["customer runbook", customerRunbook],
  ["customer key smoke", customerSmoke],
]) {
  assert(!source[1].includes("yes`, `no`, or `tie"), `${source[0]} should not document tie as a single-decision class`);
  assert(!source[1].includes("yes | no | tie"), `${source[0]} should not document tie as a single-decision class`);
  assert(!source[1].includes('"yes", "no", "tie"'), `${source[0]} should not accept tie as a single-decision class`);
}
assert(customerRunbook.includes('"mode":"rulebook"'), "customer runbook should smoke the production rulebook path");
assert(!customerRunbook.includes("deterministic API verdict"), "customer runbook should not call single-mode smoke deterministic");
assert(customerSmoke.includes('mode: "rulebook"'), "customer key smoke should use the production rulebook path");
assert(customerSmoke.includes("rulebook_contract"), "customer key smoke should validate rulebook contract material");
assert(customerSmoke.includes("runtime_binding"), "customer key smoke should validate runtime binding material");
assert(customerSmoke.includes("rulebook_attestation"), "customer key smoke should validate attestation material");
assert(!customerSmoke.includes("Should this support workflow use one deterministic API verdict for routing?"), "customer key smoke should not use legacy deterministic single-mode prompt");
for (const marker of ["decision_record_version", "decision_id", "record_hash", "verify_url"]) {
  assert(customerRunbook.includes(marker), `customer runbook should mention public Decision Record field ${marker}`);
  assert(customerSmoke.includes(marker), `customer key smoke should validate public Decision Record field ${marker}`);
}
pass("customer key smoke matches public Decision Record contract");
