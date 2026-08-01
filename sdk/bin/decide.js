#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { formatRulebookConformanceSummary, runRulebookConformance } = require('../conformance');
const {
  verifyApplicationBinding,
  verifyDecisionPacketWithRegistry,
  verifyDecisionRecordWithRegistry
} = require('../verifier');

function usage() {
  return [
    'Usage:',
    '  decide verify <record.json> [--input input.json] [--public-key public.pem] [--key-registry url] [--hmac-secret secret] [--application-binding] [--json|--summary]',
    '  decide verify-packet <packet.json> [--input input.json] [--public-key public.pem] [--key-registry url] [--hmac-secret secret] [--json|--summary]',
    '  decide rulebook-conformance [--index url] [--endpoint url] [--api-key key] [--json|--summary]',
    '',
    'Examples:',
    '  npx @decide-fyi/sdk verify decision-record.json --input decision-input.json',
    '  npx @decide-fyi/sdk verify app-record.json --application-binding --summary',
    '  npx @decide-fyi/sdk verify decision-record.json --key-registry https://www.decide.fyi/api/decision/receipt-keys --json',
    '  npx @decide-fyi/sdk verify-packet decision-packet.json --key-registry https://www.decide.fyi/api/decision/receipt-keys --summary',
    '  npx @decide-fyi/sdk rulebook-conformance --endpoint https://api.decide.fyi/api/decide --summary',
    '',
    'Verifies Decision Record v1 and Decision Packet v1 hashes offline. Ed25519',
    'receipt signatures verify when the record carries receipt_public_key, --public-key',
    'is provided, or --key-registry resolves a matching public key. HMAC signatures',
    'verify only with --hmac-secret or DECIDE_RECEIPT_SIGNING_SECRET. Add',
    '--application-binding to require decide_application_binding_v1 material',
    'before an app-level execution handoff.'
  ].join('\n');
}

function readText(filePath) {
  if (filePath === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function takeValue(args, flag) {
  const value = args.shift();
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseVerifyArgs(argv) {
  const args = [...argv];
  const options = {
    recordPath: '',
    inputPath: '',
    publicKeyPath: '',
    keyRegistryUrl: '',
    hmacSecret: '',
    applicationBinding: false,
    json: false,
    summary: false
  };

  while (args.length) {
    const next = args.shift();
    if (next === '--help' || next === '-h') {
      options.help = true;
      continue;
    }
    if (next === '--input') {
      options.inputPath = takeValue(args, next);
      continue;
    }
    if (next === '--public-key') {
      options.publicKeyPath = takeValue(args, next);
      continue;
    }
    if (next === '--key-registry') {
      options.keyRegistryUrl = takeValue(args, next);
      continue;
    }
    if (next === '--hmac-secret') {
      options.hmacSecret = takeValue(args, next);
      continue;
    }
    if (next === '--application-binding') {
      options.applicationBinding = true;
      continue;
    }
    if (next === '--json') {
      options.json = true;
      continue;
    }
    if (next === '--summary') {
      options.summary = true;
      continue;
    }
    if (next.startsWith('-')) throw new Error(`Unknown option: ${next}`);
    if (!options.recordPath) {
      options.recordPath = next;
      continue;
    }
    throw new Error(`Unexpected argument: ${next}`);
  }

  return options;
}

function parseVerifyPacketArgs(argv) {
  const options = parseVerifyArgs(argv);
  options.packetPath = options.recordPath;
  delete options.recordPath;
  return options;
}

function parseRulebookConformanceArgs(argv) {
  const args = [...argv];
  const options = {
    indexUrl: '',
    endpoint: '',
    apiKey: '',
    json: false,
    summary: false
  };

  while (args.length) {
    const next = args.shift();
    if (next === '--help' || next === '-h') {
      options.help = true;
      continue;
    }
    if (next === '--index') {
      options.indexUrl = takeValue(args, next);
      continue;
    }
    if (next === '--endpoint') {
      options.endpoint = takeValue(args, next);
      continue;
    }
    if (next === '--api-key') {
      options.apiKey = takeValue(args, next);
      continue;
    }
    if (next === '--json') {
      options.json = true;
      continue;
    }
    if (next === '--summary') {
      options.summary = true;
      continue;
    }
    if (next.startsWith('-')) throw new Error(`Unknown option: ${next}`);
    throw new Error(`Unexpected argument: ${next}`);
  }

  return options;
}

function summarizeChecks(checks = {}) {
  const entries = Object.entries(checks);
  const passed = entries.filter(([, value]) => value === true);
  const failed = entries.filter(([, value]) => value === false);
  const skipped = entries.filter(([, value]) => value === null || value === undefined);
  return { entries, passed, failed, skipped };
}

function formatSummary(result, label = 'Decision Record') {
  const { passed, failed, skipped } = summarizeChecks(result.checks || {});
  const lines = [
    result.verified ? `${label} verified.` : `${label} not verified.`,
    `checks: ${passed.length} passed, ${failed.length} failed, ${skipped.length} not checked`
  ];
  if (result.key_source) lines.push(`key_source: ${result.key_source}`);
  if (result.actual?.receipt_signature_algorithm) lines.push(`signature: ${result.actual.receipt_signature_algorithm}`);
  if (result.actual?.packet_hash) lines.push(`packet_hash: ${result.actual.packet_hash}`);
  if (result.actual?.record_hash) lines.push(`record_hash: ${result.actual.record_hash}`);
  if (result.actual?.receipt_hash) lines.push(`receipt_hash: ${result.actual.receipt_hash}`);
  if (result.actual?.input_hash) lines.push(`input_hash: ${result.actual.input_hash}`);
  if (result.application_binding_verification) {
    const appBinding = result.application_binding_verification;
    lines.push(appBinding.verified ? 'application_binding: verified' : 'application_binding: not verified');
    if (appBinding.missing?.length) lines.push(`application_binding_missing: ${appBinding.missing.join(', ')}`);
  }
  if (failed.length) lines.push(`failed: ${failed.map(([key]) => key).join(', ')}`);
  if (result.error) lines.push(`error: ${result.error}`);
  return lines.join('\n');
}

async function runVerify(argv) {
  const options = parseVerifyArgs(argv);
  if (options.help || !options.recordPath) {
    console.log(usage());
    return options.help ? 0 : 2;
  }

  const record = readJson(options.recordPath);
  const input = options.inputPath ? readJson(options.inputPath) : undefined;
  const publicKey = options.publicKeyPath ? readText(options.publicKeyPath) : '';
  const result = await verifyDecisionRecordWithRegistry({
    record,
    input,
    publicKey,
    keyRegistryUrl: options.keyRegistryUrl,
    hmacSecret: options.hmacSecret,
    keySource: publicKey ? 'public_key_file' : ''
  });
  if (options.applicationBinding) {
    const applicationBinding = verifyApplicationBinding(record);
    result.application_binding_verification = applicationBinding;
    result.checks = {
      ...(result.checks || {}),
      application_binding: applicationBinding.verified === true
    };
    result.ok = result.verified === true && applicationBinding.verified === true;
    result.verified = result.ok;
  }

  if (options.json && !options.summary) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSummary(result));
  }
  return result.verified ? 0 : 1;
}

async function runVerifyPacket(argv) {
  const options = parseVerifyPacketArgs(argv);
  if (options.help || !options.packetPath) {
    console.log(usage());
    return options.help ? 0 : 2;
  }

  const packet = readJson(options.packetPath);
  const input = options.inputPath ? readJson(options.inputPath) : undefined;
  const publicKey = options.publicKeyPath ? readText(options.publicKeyPath) : '';
  const result = await verifyDecisionPacketWithRegistry({
    packet,
    input,
    publicKey,
    keyRegistryUrl: options.keyRegistryUrl,
    hmacSecret: options.hmacSecret,
    keySource: publicKey ? 'public_key_file' : ''
  });

  if (options.json && !options.summary) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSummary(result, 'Decision Packet'));
  }
  return result.verified ? 0 : 1;
}

async function runRulebookConformanceCli(argv) {
  const options = parseRulebookConformanceArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const result = await runRulebookConformance({
    indexUrl: options.indexUrl || undefined,
    endpoint: options.endpoint || undefined,
    apiKey: options.apiKey || process.env.DECIDE_API_KEY || ''
  });

  if (options.json && !options.summary) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatRulebookConformanceSummary(result));
  }
  return result.ok ? 0 : 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return command ? 0 : 2;
  }
  if (command === 'verify') {
    return runVerify(rest);
  }
  if (command === 'verify-packet') {
    return runVerifyPacket(rest);
  }
  if (command === 'rulebook-conformance') {
    return runRulebookConformanceCli(rest);
  }
  {
    throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error?.message || 'Decision Record verification failed');
    process.exit(2);
  });
