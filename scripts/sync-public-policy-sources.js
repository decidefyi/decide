#!/usr/bin/env node

import { copyFileSync } from "node:fs";

const sourceFiles = [
  "policy-sources.json",
  "cancel-policy-sources.json",
  "return-policy-sources.json",
  "trial-policy-sources.json",
];

for (const file of sourceFiles) {
  const canonical = new URL(`../rules/${file}`, import.meta.url);
  const published = new URL(`../public/rules/${file}`, import.meta.url);
  copyFileSync(canonical, published);
}

console.log(`Synced public policy source mirrors (${sourceFiles.length}/${sourceFiles.length})`);
