#!/usr/bin/env node

/**
 * Daily policy checker — fetches each vendor's refund policy page,
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
const SOURCES_PATH = join(__dirname, "..", "rules", "policy-sources.json");
const HASHES_PATH = join(__dirname, "..", "rules", "policy-hashes.json");

const sources = JSON.parse(readFileSync(SOURCES_PATH, "utf8"));
const storedHashes = existsSync(HASHES_PATH)
  ? JSON.parse(readFileSync(HASHES_PATH, "utf8"))
  : {};

const isUpdate = process.argv.includes("--update");

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RefundPolicyChecker/1.0; +https://refund.decide.fyi)",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const vendors = Object.entries(sources.vendors);
  const changed = [];
  const errors = [];
  const newHashes = { ...storedHashes };

  // Process in batches of 5 to avoid hammering
  for (let i = 0; i < vendors.length; i += 5) {
    const batch = vendors.slice(i, i + 5);
    const results = await Promise.all(
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
  writeFileSync(HASHES_PATH, JSON.stringify(newHashes, null, 2) + "\n");

  // Output results
  if (isUpdate) {
    console.log(`Hashes updated for ${Object.keys(newHashes).length} vendors.`);
    return;
  }

  if (errors.length > 0) {
    console.log(`::warning::Could not fetch ${errors.length} vendor(s): ${errors.join(", ")}`);
  }

  if (changed.length === 0) {
    console.log("No policy page changes detected.");
    process.exitCode = 0;
  } else {
    console.log(`CHANGED_VENDORS=${changed.map((c) => c.vendor).join(",")}`);
    // Build issue body for the GitHub Action
    const body = changed
      .map((c) => `- **${c.vendor}**: [policy page](${c.url})`)
      .join("\n");
    console.log(`ISSUE_BODY<<EOF\n${body}\nEOF`);
    process.exitCode = 0;
  }
}

main();
