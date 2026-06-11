#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
import { executeTrustedAdapter } from "../lib/trusted-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const defaultCorpusPath = join(repoRoot, "public", "replay", "rulebook-v1", "index.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveFromRepo(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function usage() {
  return `Usage: npm run rulebook:migration-dry-run -- [options]

Options:
  --json                                      Print machine-readable JSON
  --allow-drift                               Exit 0 while preserving ok:false on drift/error
  --corpus <path>                             Corpus index path (default: public/replay/rulebook-v1/index.json)
  --fixture <id>                              Replay only one fixture; repeatable
  --candidate-evaluator-version <label>      Label the evaluator candidate under test
  --candidate-rulebook <rulebook_id>=<path>   Replace matching stored rulebook snapshots; repeatable
  --candidate-adapter <id>@<version>=<hash>   Replace matching adapter dependency; repeatable
  --help                                      Show this help
`;
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseCandidateRulebook(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid --candidate-rulebook value: ${value}`);
  }
  return {
    rulebookId: value.slice(0, separator),
    path: resolveFromRepo(value.slice(separator + 1)),
  };
}

function parseCandidateAdapter(value) {
  const separator = value.indexOf("=");
  const target = value.slice(0, separator);
  const manifestHash = value.slice(separator + 1);
  const versionSeparator = target.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1 || versionSeparator <= 0 || versionSeparator === target.length - 1) {
    throw new Error(`Invalid --candidate-adapter value: ${value}`);
  }
  return {
    adapterId: target.slice(0, versionSeparator),
    version: target.slice(versionSeparator + 1),
    manifestHash,
  };
}

function parseArgs(argv) {
  const options = {
    json: false,
    allowDrift: false,
    corpusPath: defaultCorpusPath,
    fixtureIds: [],
    candidateEvaluatorVersion: null,
    candidateRulebooks: new Map(),
    candidateAdapters: new Map(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-drift") {
      options.allowDrift = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--corpus") {
      options.corpusPath = resolveFromRepo(takeValue(argv, index, arg));
      index += 1;
    } else if (arg === "--fixture") {
      options.fixtureIds.push(takeValue(argv, index, arg));
      index += 1;
    } else if (arg === "--candidate-evaluator-version") {
      options.candidateEvaluatorVersion = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--candidate-rulebook") {
      const candidate = parseCandidateRulebook(takeValue(argv, index, arg));
      options.candidateRulebooks.set(candidate.rulebookId, candidate);
      index += 1;
    } else if (arg === "--candidate-adapter") {
      const candidate = parseCandidateAdapter(takeValue(argv, index, arg));
      options.candidateAdapters.set(candidate.adapterId, candidate);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function evaluateReplayRequest(request, options) {
  if (request?.body?.mode !== "rulebook") {
    throw new Error("Replay request must use mode=rulebook");
  }
  const body = clone(request.body);
  const candidateRulebook = options.candidateRulebooks.get(String(body.rulebook?.rulebook_id || ""));
  if (candidateRulebook) {
    const rulebook = loadJson(candidateRulebook.path);
    if (rulebook.rulebook_id !== candidateRulebook.rulebookId) {
      throw new Error(
        `Candidate rulebook selector ${candidateRulebook.rulebookId} loaded rulebook_id ${rulebook.rulebook_id || "missing"}`
      );
    }
    body.rulebook = rulebook;
  }

  const candidateAdapter = body.adapter ? options.candidateAdapters.get(String(body.adapter.adapter_id || "")) : null;
  if (candidateAdapter) {
    body.adapter = {
      ...body.adapter,
      version: candidateAdapter.version,
      manifest_hash: candidateAdapter.manifestHash,
    };
  }

  let runtimeInputs = body.context?.inputs || {};
  let trustedAdapter = null;
  if (body.adapter) {
    if (body.context?.inputs && Object.keys(body.context.inputs).length > 0) {
      throw new Error("Replay request cannot combine adapter input with context.inputs");
    }
    const adapterEvaluation = await executeTrustedAdapter(body.adapter);
    if (!adapterEvaluation.ok) {
      const detail =
        adapterEvaluation.expected_manifest_hash || adapterEvaluation.registered_manifest_hash
          ? ` expected=${adapterEvaluation.expected_manifest_hash || "n/a"} registered=${
              adapterEvaluation.registered_manifest_hash || "n/a"
            }`
          : "";
      throw new Error(`${adapterEvaluation.error}: ${adapterEvaluation.message || "adapter evaluation failed"}${detail}`);
    }
    runtimeInputs = adapterEvaluation.facts;
    trustedAdapter = adapterEvaluation.attestation;
  }

  const evaluation = evaluateRulebookV1({
    rulebook: body.rulebook,
    inputs: runtimeInputs,
  });
  if (!evaluation.ok) {
    throw new Error(`${evaluation.error}: ${evaluation.message || "rulebook evaluation failed"}`);
  }

  const result = {
    ...evaluation.result,
    ...(trustedAdapter
      ? {
          trusted_adapter: trustedAdapter,
          adapter_facts: runtimeInputs,
        }
      : {}),
  };
  result.rulebook_attestation = buildRulebookAttestation(result);
  return {
    statusCode: 200,
    json: result,
  };
}

function semanticOutput(result) {
  return {
    status: result?.status,
    verdict: result?.verdict,
    application_verdict: result?.application_verdict,
    action: result?.action,
    reason_code: result?.reason_code,
    matched_rule_id: result?.matched_rule_id,
  };
}

function actualHistoricalRecord(evaluation) {
  const result = evaluation.json || {};
  return {
    statusCode: evaluation.statusCode,
    engine: result.engine,
    evaluator_version: result.evaluator_version,
    semantic_output: semanticOutput(result),
    rulebook: result.rulebook,
    input_hash: result.input_hash,
    attestation_hash: result.rulebook_attestation?.bundle_hash,
    trusted_adapter: result.trusted_adapter || null,
    adapter_facts: result.adapter_facts || null,
  };
}

function expectedHistoricalRecord(record) {
  return {
    statusCode: record?.statusCode,
    engine: record?.engine,
    evaluator_version: record?.evaluator_version,
    semantic_output: record?.semantic_output,
    rulebook: record?.rulebook,
    input_hash: record?.input_hash,
    attestation_hash: record?.rulebook_attestation?.bundle_hash,
    trusted_adapter: record?.trusted_adapter || null,
    adapter_facts: record?.adapter_facts || null,
  };
}

function valuesEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function compareHistoricalRecord(expected, actual) {
  const fields = [
    "statusCode",
    "engine",
    "evaluator_version",
    "semantic_output",
    "rulebook",
    "input_hash",
    "attestation_hash",
    "trusted_adapter",
    "adapter_facts",
  ];
  const drifts = [];
  for (const field of fields) {
    if (!valuesEqual(expected[field], actual[field])) {
      drifts.push({
        field,
        expected: expected[field],
        actual: actual[field],
      });
    }
  }
  return drifts;
}

function fileNameFromFixtureRef(fixtureRef) {
  const url = String(fixtureRef.url || "");
  const tail = url.split("/").filter(Boolean).pop();
  if (!tail || !tail.endsWith(".json")) {
    throw new Error(`Fixture ${fixtureRef.id || "unknown"} has no JSON URL`);
  }
  return tail;
}

async function runDryRun(options) {
  const configErrors = [];
  let index = null;
  try {
    index = loadJson(options.corpusPath);
  } catch (error) {
    configErrors.push(`Unable to load corpus index: ${error.message}`);
  }

  const candidateRulebookIds = [...options.candidateRulebooks.keys()].sort();
  const candidateAdapters = [...options.candidateAdapters.values()]
    .map((entry) => `${entry.adapterId}@${entry.version}`)
    .sort();

  if (!index) {
    return {
      ok: false,
      corpus_version: null,
      replay_contract: null,
      compatibility_policy: null,
      fixtures_total: 0,
      pass_count: 0,
      drift_count: 0,
      error_count: 0,
      config_errors: configErrors,
      candidate_evaluator_version: options.candidateEvaluatorVersion,
      candidate_rulebooks: candidateRulebookIds,
      candidate_adapters: candidateAdapters,
      results: [],
    };
  }

  for (const candidate of options.candidateRulebooks.values()) {
    try {
      const rulebook = loadJson(candidate.path);
      if (rulebook.rulebook_id !== candidate.rulebookId) {
        configErrors.push(
          `Candidate rulebook selector ${candidate.rulebookId} loaded rulebook_id ${rulebook.rulebook_id || "missing"}`
        );
      }
    } catch (error) {
      configErrors.push(`Unable to load candidate rulebook ${candidate.rulebookId}: ${error.message}`);
    }
  }

  const fixtureIds = new Set(options.fixtureIds);
  let fixtureRefs = Array.isArray(index.fixtures) ? index.fixtures : [];
  if (fixtureIds.size) {
    fixtureRefs = fixtureRefs.filter((fixtureRef) => fixtureIds.has(fixtureRef.id));
    for (const id of fixtureIds) {
      if (!fixtureRefs.some((fixtureRef) => fixtureRef.id === id)) {
        configErrors.push(`Fixture not found in corpus: ${id}`);
      }
    }
  }

  const corpusDir = dirname(options.corpusPath);
  const results = [];
  if (!configErrors.length) {
    for (const fixtureRef of fixtureRefs) {
      let fixture = null;
      try {
        fixture = loadJson(join(corpusDir, fileNameFromFixtureRef(fixtureRef)));
        const evaluation = await evaluateReplayRequest(fixture.replay?.request, options);
        const drifts = compareHistoricalRecord(
          expectedHistoricalRecord(fixture.historical_record),
          actualHistoricalRecord(evaluation)
        );
        results.push({
          id: fixture.id,
          title: fixture.title,
          kind: fixture.kind,
          status: drifts.length ? "drift" : "pass",
          drifts,
        });
      } catch (error) {
        results.push({
          id: fixture?.id || fixtureRef.id,
          title: fixture?.title || fixtureRef.title,
          kind: fixture?.kind || fixtureRef.kind,
          status: "error",
          drifts: [],
          error: String(error?.message || error),
        });
      }
    }
  }

  const passCount = results.filter((entry) => entry.status === "pass").length;
  const driftCount = results.filter((entry) => entry.status === "drift").length;
  const errorCount = results.filter((entry) => entry.status === "error").length;
  return {
    ok: configErrors.length === 0 && driftCount === 0 && errorCount === 0,
    corpus_version: index.corpus_version || null,
    replay_contract: index.replay_contract || null,
    compatibility_policy: index.compatibility_policy || null,
    fixtures_total: fixtureRefs.length,
    pass_count: passCount,
    drift_count: driftCount,
    error_count: errorCount,
    config_errors: configErrors,
    candidate_evaluator_version: options.candidateEvaluatorVersion,
    candidate_rulebooks: candidateRulebookIds,
    candidate_adapters: candidateAdapters,
    results,
  };
}

function printText(report) {
  const status = report.ok ? "PASS" : "DRIFT";
  console.log(`${status} ${report.corpus_version || "unknown-corpus"} fixtures=${report.fixtures_total}`);
  for (const result of report.results) {
    const suffix = result.status === "drift" ? ` (${result.drifts.map((entry) => entry.field).join(", ")})` : "";
    const error = result.status === "error" ? ` (${result.error})` : "";
    console.log(`${result.status.toUpperCase()} ${result.id}${suffix}${error}`);
  }
  if (report.config_errors.length) {
    for (const error of report.config_errors) console.error(`CONFIG ${error}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error?.message || error));
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const report = await runDryRun(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }

  if (report.config_errors.length) process.exit(2);
  if (!report.ok && !options.allowDrift) process.exit(1);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(2);
});
