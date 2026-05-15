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

assert(html.includes("decide.fyi is the Decision API engine"), "home page should position Decide as API engine");
assert(html.includes("Reference applications show the same contract powering policy MCPs"), "home page should show proof applications");
assert(html.includes("Applications prove the primitive"), "home page should frame applications as proof");
assert(!html.includes("Krafthaus"), "home page should stay Decide-only");
assert(!html.includes("krafthaus"), "home page should not mention external product brand");
pass("Decide root positions engine and proof applications");

assert(html.includes("This Decide URL remains the stable MCP and REST runtime"), "notary subdomain copy should preserve stable runtime message");
assert(html.includes("policy-check reference applications"), "notary subdomain copy should frame reference applications");
pass("notary subdomain runtime copy is present");

for (const endpoint of [
  "https://refund.decide.fyi/api/mcp",
  "https://cancel.decide.fyi/api/mcp",
  "https://return.decide.fyi/api/mcp",
  "https://trial.decide.fyi/api/mcp",
]) {
  assert(html.includes(endpoint), `public bridge page should preserve endpoint ${endpoint}`);
  assert(
    server.remotes.some((remote) => remote.url === endpoint),
    `server.json should preserve remote ${endpoint}`,
  );
}
pass("MCP remotes remain stable in page and server.json");

assert(!html.includes("Deterministic decision infrastructure: REST endpoints for systems, plus MCP notaries for agents."), "old mixed product positioning should be removed");
assert(!server.description.includes("Krafthaus"), "server metadata should stay Decide-only");
pass("old mixed product positioning is absent");
