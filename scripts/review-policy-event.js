#!/usr/bin/env node

import { buildPolicyReviewUpdate, POLICY_REVIEW_STATUSES } from "../lib/policy-review.js";
import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return String(process.argv[index + 1] || fallback);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  let update;
  try {
    update = buildPolicyReviewUpdate({
      eventId: argValue("--event-id"),
      status: argValue("--status"),
      reviewedBy: argValue("--reviewed-by"),
      note: argValue("--note"),
      rulebookVersion: argValue("--rulebook-version"),
    });
  } catch (error) {
    fail(`${error.message}\nAllowed statuses: ${POLICY_REVIEW_STATUSES.join(", ")}`);
    return;
  }

  if (!process.argv.includes("--apply")) {
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "dry_run", update }, null, 2)}\n`);
    return;
  }

  const config = getPolicySupabaseConfig();
  if (!config.configured) {
    fail("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const existing = await supabaseRestRequest(config, {
    method: "GET",
    path: "/rest/v1/policy_events",
    params: {
      select: "event_id,policy,vendor,date_utc,review_status",
      event_id: `eq.${update.event_id}`,
      limit: 1,
    },
  });
  if (!existing.ok) {
    fail(`Could not load policy event: ${existing.error}`);
    return;
  }
  const event = Array.isArray(existing.data) ? existing.data[0] : null;
  if (!event) {
    fail(`Policy event not found: ${update.event_id}`);
    return;
  }

  const applied = await supabaseRestRequest(config, {
    method: "PATCH",
    path: "/rest/v1/policy_events",
    params: { event_id: `eq.${update.event_id}` },
    body: update,
    prefer: "return=representation",
  });
  if (!applied.ok) {
    fail(`Could not update policy event: ${applied.error}`);
    return;
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "applied",
    event: {
      event_id: event.event_id,
      policy: event.policy,
      vendor: event.vendor,
      date_utc: event.date_utc,
    },
    update,
  }, null, 2)}\n`);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
