#!/usr/bin/env node

import { getMcpAdoptionReport } from "../lib/mcp-adoption-store.js";

function argValue(name, fallback = "") {
  const exact = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : String(process.argv[index + 1] || fallback);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const days = positiveInteger(argValue("--days", "30"), 30);
  const maxRows = positiveInteger(argValue("--max-rows", "10000"), 10000);
  const report = await getMcpAdoptionReport({ days, maxRows });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
