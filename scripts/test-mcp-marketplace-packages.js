import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const endpoint = "https://policy.decide.fyi/api/mcp";
const expectedTools = [
  "refund_eligibility",
  "cancellation_penalty",
  "return_eligibility",
  "trial_terms",
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function assertToolAnnotations(tools) {
  assert.deepEqual(Object.keys(tools), expectedTools);
  for (const toolName of expectedTools) {
    assert.deepEqual(tools[toolName].annotations, {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
  }
}

const submission = readJson("chatgpt-app-submission.json");
assert.equal(submission.schema_version, 1);
assert.equal(submission.app_info.display_name, "Decide Policy Notaries");
assert.ok(submission.app_info.subtitle.length <= 30);
assertToolAnnotations(submission.tools);
assert.equal(submission.test_cases.length, 5);
assert.equal(submission.negative_test_cases.length, 3);
for (const testCase of submission.test_cases) {
  assert.ok(expectedTools.includes(testCase.tools_triggered));
}
for (const testCase of submission.negative_test_cases) {
  assert.equal(testCase.tools_triggered, null);
}

const cursorMarketplace = readJson(".cursor-plugin/marketplace.json");
assert.equal(cursorMarketplace.plugins.length, 1);
assert.equal(cursorMarketplace.plugins[0].source, "integrations/cursor-policy-notaries");

const cursorManifest = readJson("integrations/cursor-policy-notaries/.cursor-plugin/plugin.json");
assert.equal(cursorManifest.name, "decide-policy-notaries");
assert.equal(cursorManifest.mcpServers, "./mcp.json");
assert.equal(cursorManifest.skills, "./skills/");

const cursorMcp = readJson("integrations/cursor-policy-notaries/mcp.json");
assert.equal(cursorMcp.mcpServers["decide-policy-notaries"].url, endpoint);
assert.ok(existsSync(join(root, "integrations/cursor-policy-notaries/skills/policy-support-check/SKILL.md")));

const dockerDir = "distribution/submissions/docker-mcp-registry/decide-policy-notaries";
const dockerServer = readFileSync(join(root, dockerDir, "server.yaml"), "utf8");
assert.match(dockerServer, /^name: decide-policy-notaries$/m);
assert.match(dockerServer, /^type: remote$/m);
assert.match(dockerServer, /^  transport_type: streamable-http$/m);
assert.match(dockerServer, new RegExp(`^  url: ${endpoint.replaceAll(".", "\\.")}$`, "m"));
assert.deepEqual(readJson(`${dockerDir}/tools.json`), []);
assert.match(readFileSync(join(root, dockerDir, "readme.md"), "utf8"), /resources\/docs/);

const inventory = readJson("distribution/mcp-directories.json");
assert.equal(inventory.directory_submission_profile.endpoint_url, endpoint);
assert.deepEqual(inventory.directory_submission_profile.tools, expectedTools);

console.log("MCP marketplace package checks passed.");
