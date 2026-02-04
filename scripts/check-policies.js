#!/usr/bin/env node

/**
 * Daily policy checker — fetches each vendor's policy pages (refund, cancel, return, trial),
 * hashes the text content, and compares against stored hashes.
 * If any page has changed, outputs a list of changed vendors.
 *
 * Usage:
 *   node scripts/check-policies.js           # check all vendors
 *   node scripts/check-policies.js --update   # update stored hashes without diffing
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const POLICY_SETS = [
  {
    name: "refund",
    sourcesPath: join(__dirname, "..", "rules", "policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "policy-hashes.json"),
    rulesFile: "v1_us_individual.json",
  },
  {
    name: "cancel",
    sourcesPath: join(__dirname, "..", "rules", "cancel-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "cancel-policy-hashes.json"),
    rulesFile: "v1_us_individual_cancel.json",
  },
  {
    name: "return",
    sourcesPath: join(__dirname, "..", "rules", "return-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "return-policy-hashes.json"),
    rulesFile: "v1_us_individual_return.json",
  },
  {
    name: "trial",
    sourcesPath: join(__dirname, "..", "rules", "trial-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "trial-policy-hashes.json"),
    rulesFile: "v1_us_individual_trial.json",
  },
];

const isUpdate = process.argv.includes("--update");

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; DecidePolicyChecker/1.0; +https://decide.fyi)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("empty body");
      return text;
    } catch {
      if (attempt < attempts) {
        await sleep(400 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function checkPolicySet({ name, sourcesPath, hashesPath, rulesFile }) {
  if (!existsSync(sourcesPath)) {
    console.log(`::warning::Sources file not found for ${name}: ${sourcesPath}`);
    return { name, changed: [], errors: [] };
  }

  const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));
  const storedHashes = existsSync(hashesPath)
    ? JSON.parse(readFileSync(hashesPath, "utf8"))
    : {};

  const vendors = Object.entries(sources.vendors);
  const changed = [];
  const errors = [];
  const newHashes = { ...storedHashes };

  // Process in batches of 5 to avoid hammering
  for (let i = 0; i < vendors.length; i += 5) {
    const batch = vendors.slice(i, i + 5);
    await Promise.all(
      batch.map(async ([vendor, { url }]) => {
        const text = await fetchText(url);
        if (!text) {
          errors.push(vendor);
          return;
        }
        const h = hash(text);
        newHashes[vendor] = h;

        if (!isUpdate && storedHashes[vendor] && storedHashes[vendor] !== h) {
          changed.push({ vendor, url });
        }
      })
    );
  }

  // Write updated hashes
  writeFileSync(hashesPath, JSON.stringify(newHashes, null, 2) + "\n");

  return { name, changed, errors, rulesFile };
}

async function main() {
  const allChanged = [];
  const allErrors = [];

  for (const policySet of POLICY_SETS) {
    const result = await checkPolicySet(policySet);

    if (result.errors.length > 0) {
      console.log(`::warning::Could not fetch ${result.errors.length} ${result.name} vendor(s): ${result.errors.join(", ")}`);
      allErrors.push(...result.errors.map((v) => `${result.name}:${v}`));
    }

    for (const c of result.changed) {
      allChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
  }

  if (isUpdate) {
    console.log(`Hashes updated for all policy sets.`);
    return;
  }

  if (allChanged.length === 0) {
    console.log("No policy page changes detected.");
    process.exitCode = 0;
  } else {
    const vendorNames = allChanged.map((c) => `${c.policyType}:${c.vendor}`).join(",");
    console.log(`CHANGED_VENDORS=${vendorNames}`);
    // Build issue body for the GitHub Action
    const body = allChanged
      .map((c) => `- **[${c.policyType}] ${c.vendor}**: [policy page](${c.url}) — update \`rules/${c.rulesFile}\``)
      .join("\n");
    console.log(`ISSUE_BODY<<EOF\n${body}\nEOF`);
    process.exitCode = 0;
  }
}

main();
