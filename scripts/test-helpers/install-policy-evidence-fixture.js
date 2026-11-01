// Test-only durable-state boundary. No environment switch bypasses runtime checks.
import { mock } from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-07T12:00:00Z") });
// These availability fixtures describe hypothetical current evidence in September.
// A later real source review must not become a future-dated fixture. Dedicated
// freshness/review tests read the real ledgers without importing this helper.
const sourcePaths = new Set([
  "policy-sources.json", "cancel-policy-sources.json", "return-policy-sources.json", "trial-policy-sources.json",
].map((name) => fileURLToPath(new URL(`../../rules/${name}`, import.meta.url))));
const readFileSync = fs.readFileSync;
mock.method(fs, "readFileSync", (file, options) => {
  const content = readFileSync(file, options);
  const path = file instanceof URL ? fileURLToPath(file) : typeof file === "string" ? resolve(file) : null;
  if (!sourcePaths.has(path)) return content;
  const sources = JSON.parse(String(content));
  for (const source of Object.values(sources.vendors || {})) {
    if (source.last_verified_utc) source.last_verified_utc = sources.last_verified_utc;
  }
  const fixture = JSON.stringify(sources);
  return Buffer.isBuffer(content) ? Buffer.from(fixture) : fixture;
});
syncBuiltinESMExports();
const { buildPolicyEvidenceSnapshot, readPolicyEvidenceCatalog, POLICY_EVIDENCE_ARTIFACT_PATH } =
  await import("../../lib/policy-evidence-snapshot.js");
const catalog = readPolicyEvidenceCatalog();
const report = {
  generated_at_utc: "2026-09-07T03:00:00Z", run_id: "1", run_attempt: "1", commit_sha: "a".repeat(40),
  rows: Object.entries(catalog).flatMap(([policy, family]) => Object.entries(family.vendors).map(([vendor, source]) => ({
    policy, vendor, status: "unchanged", flags: [], source_url: source.url,
    last_successful_fetch_utc: "2026-09-07T02:00:00Z", last_confirmed_change_utc: "",
  }))),
};
const snapshot = buildPolicyEvidenceSnapshot(report);
const content = JSON.stringify(snapshot);
const artifact = {
  artifact_path: POLICY_EVIDENCE_ARTIFACT_PATH, content_text: content,
  content_sha256: createHash("sha256").update(content).digest("hex"), source: "check-policies.js",
  run_id: report.run_id, run_attempt: report.run_attempt, commit_sha: report.commit_sha,
  updated_at_utc: "2026-09-07T03:01:00Z",
};
process.env.SUPABASE_URL = "https://policy-evidence-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-not-a-real-key";
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin === process.env.SUPABASE_URL && url.pathname === "/rest/v1/rpc/read_policy_runtime_evidence") {
    return new Response(JSON.stringify([artifact]));
  }
  throw new Error("TEST_EXTERNAL_NETWORK_DISABLED");
};

export const testPolicyEvidenceSnapshot = { ...snapshot, snapshot_hash: artifact.content_sha256 };
