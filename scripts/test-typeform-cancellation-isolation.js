import "./test-helpers/install-policy-evidence-fixture.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getSupportedVendors } from "../lib/cancel-compute.js";
import cancelRest from "../lib/routes/v1/policies/cancel-penalty.js";
import cancelMcp from "../api/cancel-mcp.js";
import policyMcp from "../api/policy-mcp.js";
import { invokeJson } from "./test-helpers/http-harness.js";

assert.equal(getSupportedVendors().includes("typeform"), true);
const args = { vendor: "typeform", region: "US", plan: "individual" };
const rest = await invokeJson(cancelRest, { method: "POST", body: args });
assert.equal(rest.statusCode, 200);
assert.equal(rest.json.code, "NON_INDIVIDUAL_PLAN");
assert.equal(rest.json.verdict, "UNKNOWN");
assert.equal(rest.json.automation_safe, false);

for (const handler of [cancelMcp, policyMcp]) {
  const list = await invokeJson(handler, { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  const tool = list.json.result.tools.find(entry => entry.name === "cancellation_penalty");
  assert.equal(tool.inputSchema.properties.vendor.enum.includes("typeform"), true);
  assert.equal(list.json.result.tools.some(entry => entry.name.includes("typeform")), false);
  const call = await invokeJson(handler, { method: "POST", body: {
    jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "cancellation_penalty", arguments: args },
  } });
  assert.equal(call.json.result.structuredContent.verdict, "UNKNOWN");
  assert.equal(call.json.result.structuredContent.automation_safe, false);
}

const registry = JSON.parse(readFileSync(new URL("../rules/policy-vendor-candidates.json", import.meta.url), "utf8"));
assert.equal(registry.candidates.typeform.policies.return.review_status, "awaiting_maintainer_signoff");
assert.equal(registry.candidates.typeform.policies.return.reviewed_by, null);
for (const family of ["v1_us_individual", "v1_us_individual_return", "v1_us_individual_trial"]) {
  const rules = JSON.parse(readFileSync(new URL(`../rules/${family}.json`, import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(rules.vendors, "typeform"), false);
}
console.log("PASS: Typeform admission does not approve legacy individual requests, other policies or human sign-off");
