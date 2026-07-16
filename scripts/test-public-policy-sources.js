#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sourceFiles = [
  "policy-sources.json",
  "cancel-policy-sources.json",
  "return-policy-sources.json",
  "trial-policy-sources.json",
];

for (const file of sourceFiles) {
  const canonical = readFileSync(new URL(`../rules/${file}`, import.meta.url), "utf8");
  const published = readFileSync(new URL(`../public/rules/${file}`, import.meta.url), "utf8");

  assert.equal(
    published,
    canonical,
    `public/rules/${file} must exactly mirror rules/${file}; run npm run sync:public-policy-sources`
  );
}

console.log(`PASS public policy source mirrors (${sourceFiles.length}/${sourceFiles.length})`);
