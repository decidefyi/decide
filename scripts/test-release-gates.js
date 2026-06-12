#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const runtimeSmokeWorkflowPath = ".github/workflows/rulebook-runtime-production-smoke.yml";

function read(path) {
  return readFileSync(path, "utf8");
}

assert.ok(existsSync(runtimeSmokeWorkflowPath), "rulebook runtime production smoke workflow must exist");

const workflow = read(runtimeSmokeWorkflowPath);
assert.match(workflow, /workflow_dispatch:/, "runtime smoke workflow must be manually runnable");
assert.match(workflow, /schedule:/, "runtime smoke workflow must run on a schedule");
assert.match(workflow, /npm run smoke:rulebook-runtime/, "runtime smoke workflow must run the production smoke command");
assert.match(workflow, /contents:\s*read/, "runtime smoke workflow should use read-only repository permissions");
assert.doesNotMatch(workflow, /secrets\./, "runtime smoke workflow must not depend on repository secrets by default");
assert.match(
  workflow,
  /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/,
  "runtime smoke workflow should opt JavaScript actions into Node 24"
);

const readme = read("README.md");
assert.match(
  readme,
  /npm run smoke:rulebook-runtime/,
  "README release guidance must include the rulebook runtime production smoke"
);
assert.match(
  readme,
  /hybrid_declarative_rulebook_with_trusted_adapters/,
  "README release guidance must name the production core being verified"
);

console.log("PASS release gates");
