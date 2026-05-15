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
assert(html.includes("Product surfaces built on this runtime now live on Krafthaus"), "home page should point products to Krafthaus");
assert(!html.includes("https://www.krafthaus.app/policy-notaries"), "home page should not billboard Krafthaus product CTAs");
pass("Decide root positions engine and bridges to Krafthaus");

assert(html.includes("This Decide URL remains the stable MCP and REST runtime"), "notary subdomain copy should preserve stable runtime message");
assert(html.includes("The human-facing Policy MCP Notaries product now lives on Krafthaus"), "notary subdomain copy should bridge product ownership");
pass("notary subdomain bridge copy is present");

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
pass("old mixed product positioning is absent");
