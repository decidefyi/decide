#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { previewTypeformCancellation } from "../lib/candidates/typeform-cancellation.js";

// This command is offline and never calls Typeform or the deployed Decide API.
const args = process.argv.slice(2);
const limit = 16 * 1024;
try {
  let request;
  let options = {};
  let synthetic = false;
  if (args.length === 1 && args[0] === "--example") {
    const example = JSON.parse(readFileSync(new URL("../examples/candidates/typeform-cancellation.json", import.meta.url), "utf8"));
    request = example.request;
    options = { now: new Date(example.evaluated_at) };
    synthetic = true;
  } else if (args.length || process.stdin.isTTY) {
    throw new Error("USAGE");
  } else {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > limit) throw new Error("INPUT_TOO_LARGE");
      chunks.push(chunk);
    }
    try {
      request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("INVALID_JSON");
    }
  }
  const preview = previewTypeformCancellation(request, options);
  process.stdout.write(`${JSON.stringify({ ...preview, synthetic }, null, 2)}\n`);
} catch (error) {
  const messages = {
    USAGE: "Use --example for a synthetic case, or provide one JSON request on stdin.",
    INPUT_TOO_LARGE: "Candidate input must not exceed 16 KiB.",
    INVALID_JSON: "Provide a valid JSON request on stdin.",
  };
  const code = Object.hasOwn(messages, error.message) ? error.message : "PREVIEW_FAILED";
  process.stderr.write(`${JSON.stringify({ error: code, message: messages[code] || "Candidate preview could not be evaluated." })}\n`);
  process.exitCode = 2;
}
