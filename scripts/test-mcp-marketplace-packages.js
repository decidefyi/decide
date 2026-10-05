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
assert.equal(submission.app_info.display_name, "Policy Notaries");
assert.match(submission.app_info.description, /Decide-owned, read-only service/);
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
assert.equal(cursorMarketplace.owner.name, "Decide");
assert.equal(cursorMarketplace.owner.email, "support@decide.fyi");
assert.equal(cursorMarketplace.plugins.length, 1);
assert.equal(cursorMarketplace.plugins[0].source, "decide-policy-notaries");
assert.deepEqual(Object.keys(cursorMarketplace.plugins[0]), ["name", "source", "description"]);

const cursorPluginDir = "decide-policy-notaries";
const cursorManifest = readJson(`${cursorPluginDir}/.cursor-plugin/plugin.json`);
assert.equal(cursorManifest.name, "decide-policy-notaries");
assert.equal(cursorManifest.displayName, "Policy Notaries");
assert.equal(cursorManifest.author.name, "Decide");
assert.equal(cursorManifest.homepage, "https://www.decide.fyi/resources/policy-notaries");
assert.match(cursorManifest.description, /Decide-owned, read-only service/);
assert.equal(cursorManifest.license, "MIT");
assert.equal(cursorManifest.logo, "assets/logo.png");
assert.equal(cursorManifest.mcpServers, "./mcp.json");
assert.equal(cursorManifest.skills, "./skills/");

const cursorMcp = readJson(`${cursorPluginDir}/mcp.json`);
assert.equal(cursorMcp.mcpServers["decide-policy-notaries"].url, endpoint);
assert.ok(existsSync(join(root, cursorPluginDir, "skills/policy-support-check/SKILL.md")));
assert.ok(existsSync(join(root, cursorPluginDir, "assets/logo.png")));
assert.ok(existsSync(join(root, cursorPluginDir, "LICENSE")));

const dockerDir = "distribution/submissions/docker-mcp-registry/decide-policy-notaries";
const dockerServer = readFileSync(join(root, dockerDir, "server.yaml"), "utf8");
assert.match(dockerServer, /^name: decide-policy-notaries$/m);
assert.match(dockerServer, /^type: remote$/m);
assert.match(dockerServer, /^  transport_type: streamable-http$/m);
assert.match(dockerServer, new RegExp(`^  url: ${endpoint.replaceAll(".", "\\.")}$`, "m"));
assert.deepEqual(readJson(`${dockerDir}/tools.json`), []);
const dockerReadme = readFileSync(join(root, dockerDir, "readme.md"), "utf8");
assert.match(dockerReadme, /resources\/docs/);
assert.match(dockerReadme, /standalone, read-only Decide service/);
assert.match(dockerReadme, /https:\/\/www\.decide\.fyi\/resources\/policy-notaries/);

const inventory = readJson("distribution/mcp-directories.json");
const serverManifest = readJson("server.json");
assert.equal(serverManifest.title, "Decide Policy Notaries");
assert.equal(inventory.directory_submission_profile.endpoint_url, endpoint);
assert.deepEqual(inventory.directory_submission_profile.tools, expectedTools);
assert.equal(inventory.application_submission_profile.name, "Policy Notaries");
assert.equal(inventory.application_submission_profile.publisher, "Decide");
assert.equal(inventory.application_submission_profile.runtime, "Decide");
assert.equal(inventory.application_submission_profile.endpoint_url, endpoint);
assert.equal(inventory.application_submission_profile.product_url, "https://www.decide.fyi/resources/policy-notaries");
assert.match(inventory.application_submission_profile.summary, /Decide-owned, read-only service/);

const constitution = readFileSync(join(root, 'docs/ECOSYSTEM_CONSTITUTION.md'), 'utf8');
for (const layer of ['### Decide Runtime', '### Decide Services', '### Krafthaus']) {
  assert.ok(constitution.includes(layer), `architecture must identify ${layer}`);
}
assert.match(constitution, /not a policy platform/);
assert.match(constitution, /Policy Notaries is a standalone Decide service, not a Krafthaus application/);
assert.doesNotMatch(constitution, /Policy Notaries by Krafthaus/);
assert.equal(inventory.ownership_copy_review.external_metadata_refresh, 'pending');

console.log("MCP marketplace package checks passed.");
