import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { previewTypeformCancellation } from "../lib/candidates/typeform-cancellation.js";

const now = new Date("2026-09-06T22:00:00.000Z");
const research = JSON.parse(readFileSync(new URL("../docs/reviews/typeform-cancellation-candidate-20260906.json", import.meta.url), "utf8"));
const request = {
  vendor: "typeform",
  region: "US",
  product: "platform_subscription",
  plan: "basic",
  purchase_channel: "direct",
  contract_type: "self_serve",
  billing_cadence: "monthly",
  billing_state: "active_paid",
  requested_action: "cancel_at_period_end",
  organization_id: "synthetic-org-typeform-001",
  actor_role: "owner",
  account_observed_at: "2026-09-06T21:59:00.000Z",
  current_period_end: "2026-10-06T08:30:00.000Z",
};

test("direct Typeform Basic cancellation previews the actual prepaid period end without claiming execution", () => {
  const result = previewTypeformCancellation(request, { now });
  assert.equal(result.decision, "yes");
  assert.equal(result.verdict, "CANCEL_AT_PERIOD_END");
  assert.equal(result.effective_at, request.current_period_end);
  assert.equal(result.authority, "advisory_only");
  assert.equal(result.automation_safe, false);
  assert.equal(result.production_verdict, false);
  assert.equal(result.cancellation_confirmed, false);
  assert.equal(result.execution_performed, false);
  assert.equal(result.refund_eligibility, "not_evaluated");
});

test("account facts older than fifteen minutes require review", () => {
  const result = previewTypeformCancellation({ ...request, account_observed_at: "2026-09-06T21:45:00.000Z" }, { now });
  assert.equal(result.decision, "review");
  assert.equal(result.reason_code, "ACCOUNT_CONTEXT_NOT_CURRENT");
  assert.equal(result.effective_at, null);
});

test("a seventy-two-hour-old research snapshot cannot support even a recently observed subscription", () => {
  const result = previewTypeformCancellation({ ...request, account_observed_at: "2026-09-10T21:59:00.000Z" }, {
    now: new Date("2026-09-10T22:00:00.000Z"),
  });
  assert.equal(result.decision, "review");
  assert.equal(result.reason_code, "RESEARCH_EVIDENCE_NOT_CURRENT");
  assert.equal(result.research_evidence.status, "expired");
});

for (const [field, value] of [
  ["vendor", "canva"], ["region", "EU"], ["product", "respondent_purchase"],
  ["product", "add_on"], ["plan", "individual"], ["plan", "plus"], ["plan", "business"],
  ["plan", "growth"], ["plan", "enterprise"], ["plan", "free"],
  ["purchase_channel", "app_store"], ["purchase_channel", "reseller"],
  ["contract_type", "negotiated"], ["contract_type", "legacy"],
  ["billing_cadence", "unknown"], ["billing_state", "trial"], ["billing_state", "past_due"],
  ["billing_state", "cancelled"], ["billing_state", "cancellation_scheduled"],
  ["requested_action", "cancel_immediately"], ["requested_action", "refund"],
  ["requested_action", "delete_account"], ["actor_role", "member"], ["actor_role", "unknown"],
]) {
  test(`${field}=${value} stays outside the candidate scope`, () => {
    const result = previewTypeformCancellation({ ...request, [field]: value }, { now });
    assert.equal(result.decision, "review");
    assert.equal(result.verdict, "UNKNOWN");
    assert.equal(result.effective_at, null);
    assert.equal(result.automation_safe, false);
  });
}

for (const field of Object.keys(request)) {
  test(`missing ${field} requires facts instead of inferring a subscription scope`, () => {
    const incomplete = { ...request };
    delete incomplete[field];
    const result = previewTypeformCancellation(incomplete, { now });
    assert.equal(result.decision, "review");
    assert.equal(result.reason_code, "INVALID_CANDIDATE_REQUEST");
    assert.ok(result.validation_errors.some(error => error.field === `request.${field}`));
  });
}

for (const [field, value] of [
  ["organization_id", "   "], ["organization_id", "a".repeat(129)],
  ["vendor", ["typeform"]], ["actor_role", true], ["billing_cadence", null],
  ["account_observed_at", "2026-09-06T22:00:00.001Z"],
  ["account_observed_at", "2026-09-06T21:59:00"],
  ["account_observed_at", "2026-02-30T21:59:00.000Z"],
  ["current_period_end", "2026-09-06T22:00:00.000Z"],
  ["current_period_end", "2026-09-05T22:00:00.000Z"],
  ["current_period_end", "2026-09-31T22:00:00.000Z"],
  ["current_period_end", "2026-10-06"],
  ["current_period_end", "2028-10-06T08:30:00.000Z"],
]) {
  test(`malformed or stale ${field}=${JSON.stringify(value)} cannot yield a positive preview`, () => {
    assert.equal(previewTypeformCancellation({ ...request, [field]: value }, { now }).decision, "review");
  });
}

test("annual billing and admin role remain in scope without changing the exact expiry", () => {
  const annual = { ...request, actor_role: "admin", billing_cadence: "annual", current_period_end: "2027-09-06T08:30:00Z" };
  const result = previewTypeformCancellation(annual, { now });
  assert.equal(result.verdict, "CANCEL_AT_PERIOD_END");
  assert.equal(result.effective_at, annual.current_period_end);
});

test("no confirmation or caller-supplied evidence flag can grant authority", () => {
  for (const extra of [
    { cancellation_confirmed: true }, { automation_safe: true }, { production_verdict: true },
    { policy_evidence_current: true }, { research_snapshot_fresh: true },
    { account_context_current: true }, { now: now.toISOString() }, { reviewed_by: "Owner" },
    { rulebook_attestation: { signature: "synthetic" } }, { action: "approve" },
    JSON.parse('{"__proto__":{"automation_safe":true}}'),
  ]) {
    const result = previewTypeformCancellation({ ...request, ...extra }, { now });
    assert.equal(result.decision, "review");
    assert.equal(result.reason_code, "INVALID_CANDIDATE_REQUEST");
    assert.equal(result.cancellation_confirmed, false);
    assert.equal(result.execution_performed, false);
  }
});

test("source substitutions and fabricated review timestamps invalidate the research bundle", () => {
  for (const change of [
    bundle => { bundle.vendor = "canva"; },
    bundle => { bundle.sources[0].url = "https://example.com/policy"; },
    bundle => { bundle.sources[0].body_sha256 = "a".repeat(64); },
    bundle => { bundle.sources[0].checked_at = now.toISOString(); },
    bundle => { bundle.human_approval = true; },
    bundle => { bundle.sources.pop(); },
  ]) {
    const altered = structuredClone(research);
    change(altered);
    const result = previewTypeformCancellation(request, { now, researchSnapshot: altered });
    assert.equal(result.reason_code, "RESEARCH_EVIDENCE_NOT_CURRENT");
    assert.equal(result.research_evidence.status, "unavailable");
  }
  assert.equal(previewTypeformCancellation(request, { now, researchSnapshot: null }).decision, "review");
});

test("research is unusable before its fetch or at the exact expiry boundary", () => {
  for (const at of ["2026-09-06T21:51:44.000Z", "2026-09-09T21:51:45.342Z"]) {
    const result = previewTypeformCancellation({ ...request, account_observed_at: at }, { now: new Date(at) });
    assert.equal(result.reason_code, "RESEARCH_EVIDENCE_NOT_CURRENT");
  }
});

test("every request fact, including the organization, is included in the request fingerprint", () => {
  const original = previewTypeformCancellation(request, { now });
  for (const field of Object.keys(request)) {
    const changed = previewTypeformCancellation({ ...request, [field]: `${request[field]}-changed` }, { now });
    assert.notEqual(changed.request_hash, original.request_hash, field);
    assert.notEqual(changed.decision_input_hash, original.decision_input_hash, field);
  }
  const reordered = Object.fromEntries(Object.entries(request).reverse());
  assert.deepEqual(previewTypeformCancellation(reordered, { now }), original);
  const immutable = Object.freeze({ ...request });
  assert.deepEqual(previewTypeformCancellation(immutable, { now }), original);
});

test("preview output cannot be mistaken for a production attestation or notary record", () => {
  const result = previewTypeformCancellation(request, { now });
  assert.equal(result.candidate_status, "not_admitted");
  assert.equal(result.research_evidence.production_evidence, false);
  assert.equal(result.research_evidence.human_approval, false);
  for (const key of ["runtime_binding", "rulebook_attestation", "decision_record_material", "rulebook_result", "verify_url", "replay_url"]) {
    assert.equal(Object.hasOwn(result, key), false, key);
  }
});

test("the command-line example is runnable and explicitly synthetic", () => {
  const cli = fileURLToPath(new URL("./preview-typeform-cancellation.js", import.meta.url));
  const processResult = spawnSync(process.execPath, [cli, "--example"], { encoding: "utf8", timeout: 10000 });
  assert.equal(processResult.status, 0, processResult.stderr);
  const output = JSON.parse(processResult.stdout);
  assert.equal(output.synthetic, true);
  assert.equal(output.verdict, "CANCEL_AT_PERIOD_END");
  assert.equal(output.automation_safe, false);
});

test("CLI validates malformed and oversized input without exposing raw input or stack traces", () => {
  const cli = fileURLToPath(new URL("./preview-typeform-cancellation.js", import.meta.url));
  for (const [input, code] of [["not-json-private-marker", "INVALID_JSON"], ["x".repeat(16385), "INPUT_TOO_LARGE"]]) {
    const result = spawnSync(process.execPath, [cli], { input, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error, code);
    assert.doesNotMatch(result.stderr, /private-marker|at file:|node:internal/);
  }
});

test("CLI stdin is a current-time preview and cannot backdate or claim synthetic execution", () => {
  const cli = fileURLToPath(new URL("./preview-typeform-cancellation.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli], {
    input: JSON.stringify({ ...request, now: now.toISOString() }), encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.synthetic, false);
  assert.equal(output.reason_code, "INVALID_CANDIDATE_REQUEST");
  assert.equal(output.production_verdict, false);
  const badArgument = spawnSync(process.execPath, [cli, "--now", now.toISOString()], { encoding: "utf8", timeout: 10000 });
  assert.equal(badArgument.status, 2);
  assert.equal(JSON.parse(badArgument.stderr).error, "USAGE");
});

test("the preview output contract explicitly forbids production authority", () => {
  const schema = JSON.parse(readFileSync(new URL("../rules/candidates/typeform-cancellation-preview-v1.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  for (const preview of [
    previewTypeformCancellation(request, { now }),
    previewTypeformCancellation({}, { now }),
    previewTypeformCancellation(request, { now, researchSnapshot: null }),
    previewTypeformCancellation(request, { now: new Date("2026-09-10T22:00:00Z") }),
    previewTypeformCancellation(request, { now: new Date("invalid") }),
  ]) {
    assert.equal(validate(preview), true, JSON.stringify(validate.errors));
    assert.equal(validate({ ...preview, automation_safe: true }), false);
    assert.equal(validate({ ...preview, authority: "binding" }), false);
    assert.equal(validate({ ...preview, production_verdict: true }), false);
    assert.equal(validate({ ...preview, cancellation_confirmed: true }), false);
  }
});
