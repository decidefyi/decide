#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRulebookRuntimeManifest } from "../lib/rulebook-runtime-contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, "..", "public", "manifests");
const outputPath = join(outputDir, "rulebook-runtime-v1.json");

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(buildRulebookRuntimeManifest(), null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
