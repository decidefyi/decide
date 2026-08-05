import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
import { parseRequestQuery } from "../lib/request-query.js";

const query = parseRequestQuery({ url: "/api/example?policy=refund" });

assert.equal(query.policy, "refund");

const repeatedQuery = parseRequestQuery({ url: "/api/example?tag=one&tag=two" });

assert.deepEqual(repeatedQuery.tag, ["one", "two"]);

const blankQuery = parseRequestQuery({ url: "/api/example?optional=" });

assert.equal(blankQuery.optional, "");

const encodedQuery = parseRequestQuery({
  url: "/api/example?label=one+two&slash=%2F&city=Malm%C3%B6",
});

assert.deepEqual(
  { label: encodedQuery.label, slash: encodedQuery.slash, city: encodedQuery.city },
  { label: "one two", slash: "/", city: "Malmö" },
);

const malformedQuery = parseRequestQuery({ url: "/api/example?value=%ZZ" });

assert.equal(malformedQuery.value, "%ZZ");

const invalidUrlQuery = parseRequestQuery({ url: "http://[" });

assert.deepEqual(Object.keys(invalidUrlQuery), []);

function assertNoCompatibilityQueryReads(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assertNoCompatibilityQueryReads(filePath);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    assert.doesNotMatch(
      fs.readFileSync(filePath, "utf8"),
      /\b(?:req|request)\.query\b/,
      `${filePath} must derive query parameters from req.url`,
    );
  }
}

assertNoCompatibilityQueryReads(fileURLToPath(new URL("../api/", import.meta.url)));

const request = { url: "/api/v1/ignored/ignored?policy=missing&action=route" };
Object.defineProperty(request, "query", {
  get() {
    throw new Error("the Vercel compatibility query getter must not be read");
  },
});
const response = {
  statusCode: 200,
  headers: {},
  body: "",
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  end(body) {
    this.body = String(body || "");
  },
};

await v1PolicyDispatcher(request, response);

assert.equal(response.statusCode, 404);
assert.equal(JSON.parse(response.body).endpoint, "/api/v1/missing/route");

const workflowRequest = {
  url: "/api/v1/workflows/zendesk/ignored?workflow=missing",
};
Object.defineProperty(workflowRequest, "query", {
  get() {
    throw new Error("the Vercel compatibility query getter must not be read");
  },
});
const workflowResponse = {
  ...response,
  statusCode: 200,
  headers: {},
  body: "",
};

await zendeskWorkflowDispatcher(workflowRequest, workflowResponse);

assert.equal(workflowResponse.statusCode, 404);
assert.equal(
  JSON.parse(workflowResponse.body).endpoint,
  "/api/v1/workflows/zendesk/missing",
);

console.log("request query regression: ok");
