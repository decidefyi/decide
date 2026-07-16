#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPolicyFreshnessReport } from "../lib/policy-freshness.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyFiles = [
  { policy: "refund", rules: "rules/v1_us_individual.json", sources: "rules/policy-sources.json" },
  { policy: "cancel", rules: "rules/v1_us_individual_cancel.json", sources: "rules/cancel-policy-sources.json" },
  { policy: "return", rules: "rules/v1_us_individual_return.json", sources: "rules/return-policy-sources.json" },
  { policy: "trial", rules: "rules/v1_us_individual_trial.json", sources: "rules/trial-policy-sources.json" },
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function readArgValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return String(process.argv[index + 1] || fallback);
}

const parsedMaxAge = Number.parseInt(readArgValue("--max-age-days", "90"), 10);
const maxAgeDays = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 90;
const policies = policyFiles.map((entry) => {
  const rules = readJson(entry.rules);
  const sources = readJson(entry.sources);
  return {
    policy: entry.policy,
    rulesVersion: rules.rules_version,
    lastChecked: sources.last_checked,
    lastVerifiedUtc: sources.last_verified_utc,
  };
});
const report = buildPolicyFreshnessReport({ policies, maxAgeDays });

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--strict") && report.status !== "current") {
  process.exitCode = 1;
}
