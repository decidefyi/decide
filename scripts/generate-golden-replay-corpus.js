#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
import {
  RULEBOOK_DIRECT_BINDING_MODE,
  RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE,
} from "../lib/rulebook-runtime-contract.js";
import { executeTrustedAdapter } from "../lib/trusted-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outDir = join(repoRoot, "public", "replay", "rulebook-v1");

const CORPUS_VERSION = "rulebook_v1_golden_replay_v1";
const REPLAY_CONTRACT = "historical_rulebook_replay_v1";
const COMPATIBILITY_POLICY = "compatibility_policy_v1";
const RECORDED_AT = "2026-06-11T00:00:00.000Z";
const API_REPLAY_ORIGIN = "https://api.decide.fyi/replay/rulebook-v1";

function loadJson(...segments) {
  return JSON.parse(readFileSync(join(repoRoot, ...segments), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(fileName, value) {
  writeFileSync(join(outDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function conformanceRequest(fileName) {
  return loadJson("public", "conformance", "rulebook-v1", fileName).request;
}

function rulebookRequest({ rulebookFile, workflow, sourceRecordId, requestedAction, inputs }) {
  return {
    method: "POST",
    path: "/api/decide",
    headers: {
      "content-type": "application/json",
    },
    body: {
      mode: "rulebook",
      rulebook: loadJson("rules", rulebookFile),
      context: {
        workflow,
        source_record_id: sourceRecordId,
        requested_action: requestedAction,
        inputs,
      },
    },
  };
}

async function evaluateRequest(request) {
  assert.equal(request?.body?.mode, "rulebook", "golden replay requests must use mode=rulebook");
  const rulebook = request.body.rulebook;
  let runtimeInputs = request.body.context?.inputs || {};
  let trustedAdapter = null;

  if (request.body.adapter) {
    const adapterEvaluation = await executeTrustedAdapter(request.body.adapter);
    assert.equal(adapterEvaluation.ok, true, `adapter evaluation failed: ${adapterEvaluation.error || "unknown"}`);
    runtimeInputs = adapterEvaluation.facts;
    trustedAdapter = adapterEvaluation.attestation;
  }

  const evaluation = evaluateRulebookV1({
    rulebook,
    inputs: runtimeInputs,
    bindingMode: trustedAdapter ? RULEBOOK_TRUSTED_ADAPTER_BINDING_MODE : RULEBOOK_DIRECT_BINDING_MODE,
  });
  assert.equal(evaluation.ok, true, `rulebook evaluation failed: ${evaluation.error || "unknown"}`);

  const result = {
    ...evaluation.result,
    ...(trustedAdapter
      ? {
          trusted_adapter: trustedAdapter,
          adapter_facts: runtimeInputs,
        }
      : {}),
  };
  const rulebookAttestation = buildRulebookAttestation(result);

  return {
    result,
    runtimeInputs,
    trustedAdapter,
    rulebookAttestation,
  };
}

async function buildFixture({ id, title, kind, request, notes }) {
  const evaluation = await evaluateRequest(request);
  const result = evaluation.result;
  const fileName = `${id.replaceAll("_", "-")}.json`;
  return {
    fileName,
    body: {
      corpus_version: CORPUS_VERSION,
      id,
      title,
      kind,
      compatibility_policy: COMPATIBILITY_POLICY,
      replay_contract: REPLAY_CONTRACT,
      recorded_at: RECORDED_AT,
      notes,
      replay: {
        request: clone(request),
        stored_material: {
          evaluator_version: result.evaluator_version,
          rulebook_snapshot: clone(request.body.rulebook),
          canonical_inputs: request.body.adapter ? null : clone(request.body.context?.inputs || {}),
          trusted_adapter_invocation: request.body.adapter ? clone(request.body.adapter) : null,
          trusted_adapter_dependency: evaluation.trustedAdapter ? clone(evaluation.trustedAdapter) : null,
        },
      },
      historical_record: {
        statusCode: 200,
        engine: result.engine,
        evaluator_version: result.evaluator_version,
        rulebook: result.rulebook,
        runtime_binding: result.runtime_binding,
        input_hash: result.input_hash,
        rulebook_attestation: {
          schema_version: evaluation.rulebookAttestation.schema_version,
          bundle_hash: evaluation.rulebookAttestation.bundle_hash,
        },
        semantic_output: {
          status: result.status,
          verdict: result.verdict,
          application_verdict: result.application_verdict,
          action: result.action,
          reason_code: result.reason_code,
          matched_rule_id: result.matched_rule_id,
        },
        ...(evaluation.trustedAdapter ? { trusted_adapter: evaluation.trustedAdapter } : {}),
        ...(result.adapter_facts ? { adapter_facts: result.adapter_facts } : {}),
      },
    },
  };
}

const fixtureSpecs = [
  {
    id: "pricing_exception_direct_approve",
    title: "Pricing exception direct approval",
    kind: "direct_rulebook",
    request: conformanceRequest("pricing-exception-direct-approve.json"),
    notes: "Baseline direct Rulebook v1 decision before CRM or billing state changes.",
  },
  {
    id: "solana_execution_gate_adapter_approve",
    title: "Solana execution gate adapter approval",
    kind: "trusted_adapter_rulebook",
    request: conformanceRequest("solana-execution-gate-adapter-approve.json"),
    notes: "Adapter-backed Krafthaus execution gate with pinned adapter dependency and emitted facts.",
  },
  {
    id: "krafthaus_workflow_readiness_adapter_bind",
    title: "Krafthaus workflow readiness binding",
    kind: "trusted_adapter_rulebook",
    request: conformanceRequest("krafthaus-workflow-readiness-adapter-bind.json"),
    notes: "Adapter-backed Krafthaus workflow application binding with pinned adapter dependency and emitted facts.",
  },
  {
    id: "refund_policy_notary_allow",
    title: "Refund Policy Notary approval",
    kind: "direct_policy_notary_rulebook",
    request: rulebookRequest({
      rulebookFile: "refund-policy-notary-v1.json",
      workflow: "refund_policy_notary",
      sourceRecordId: "golden_refund_adobe_5d",
      requestedAction: "refund_eligibility",
      inputs: {
        region_supported: true,
        plan_supported: true,
        vendor_supported: true,
        refunds_supported: true,
        within_window: true,
        days_since_purchase: 5,
        window_days: 14,
        vendor: "adobe",
        region: "US",
        plan: "individual",
        policy_rules_version: "2026-02-15",
        policy_source_url: "https://www.adobe.com/legal/subscription-terms.html",
        policy_source_notes: "14-day refund window for individual subscription purchases.",
      },
    }),
    notes: "Direct policy facts for the Refund MCP notary without a trusted adapter.",
  },
  {
    id: "trial_policy_notary_auto_convert",
    title: "Trial Policy Notary auto-convert approval",
    kind: "direct_policy_notary_rulebook",
    request: rulebookRequest({
      rulebookFile: "trial-policy-notary-v1.json",
      workflow: "trial_policy_notary",
      sourceRecordId: "golden_trial_adobe_auto_convert",
      requestedAction: "trial_terms",
      inputs: {
        region_supported: true,
        plan_supported: true,
        vendor_supported: true,
        trial_available: true,
        auto_converts: true,
        trial_days: 7,
        card_required: true,
        vendor: "adobe",
        region: "US",
        plan: "individual",
        policy_rules_version: "2026-02-15",
        policy_source_url: "https://www.adobe.com/creativecloud/plans.html",
        policy_source_notes: "Trial offer is available and converts automatically unless canceled.",
      },
    }),
    notes: "Direct policy facts for the Trial MCP notary without a trusted adapter.",
  },
  {
    id: "cancel_policy_notary_penalty",
    title: "Cancel Policy Notary penalty route",
    kind: "direct_policy_notary_rulebook",
    request: rulebookRequest({
      rulebookFile: "cancel-policy-notary-v1.json",
      workflow: "cancel_policy_notary",
      sourceRecordId: "golden_cancel_adobe_etf",
      requestedAction: "cancellation_penalty",
      inputs: {
        region_supported: true,
        plan_supported: true,
        vendor_supported: true,
        policy: "etf",
        notice_days: 0,
        penalty: "early_termination_fee",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        policy_rules_version: "2026-02-15",
        policy_source_url: "https://www.adobe.com/legal/subscription-terms.html",
        policy_source_notes: "Annual plan cancellation can trigger an early termination fee.",
      },
    }),
    notes: "Direct policy facts for the Cancel MCP notary without a trusted adapter.",
  },
  {
    id: "return_policy_notary_full_return",
    title: "Return Policy Notary full return approval",
    kind: "direct_policy_notary_rulebook",
    request: rulebookRequest({
      rulebookFile: "return-policy-notary-v1.json",
      workflow: "return_policy_notary",
      sourceRecordId: "golden_return_adobe_full",
      requestedAction: "return_eligibility",
      inputs: {
        region_supported: true,
        plan_supported: true,
        vendor_supported: true,
        return_supported: true,
        within_window: true,
        days_since_purchase: 12,
        return_window_days: 14,
        return_type: "full_refund",
        method: "self_service",
        conditions: "cancel within 14 days",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        policy_rules_version: "2026-02-15",
        policy_source_url: "https://www.adobe.com/legal/subscription-terms.html",
        policy_source_notes: "14-day return window for full refund.",
      },
    }),
    notes: "Direct policy facts for the Return MCP notary without a trusted adapter.",
  },
];

mkdirSync(outDir, { recursive: true });

const fixtures = [];
for (const spec of fixtureSpecs) {
  const fixture = await buildFixture(spec);
  writeJson(fixture.fileName, fixture.body);
  fixtures.push({
    id: fixture.body.id,
    title: fixture.body.title,
    kind: fixture.body.kind,
    url: `${API_REPLAY_ORIGIN}/${fixture.fileName}`,
  });
}

writeJson("index.json", {
  corpus_version: CORPUS_VERSION,
  schema_version: "rulebook_v1",
  compatibility_policy: COMPATIBILITY_POLICY,
  replay_contract: REPLAY_CONTRACT,
  recorded_at: RECORDED_AT,
  description:
    "Golden Rulebook v1 historical replay corpus. Each fixture freezes a stored rulebook snapshot, evaluator version, input or trusted-adapter dependency, semantic output, rulebook hash, input hash, and attestation bundle hash.",
  fixtures,
});

console.log(`Wrote ${fixtures.length} golden replay fixtures to ${outDir}`);
