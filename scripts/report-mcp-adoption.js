#!/usr/bin/env node

import {
  buildMcpAdoptionReport,
  MCP_ADOPTION_EVENT_COLUMNS,
  POLICY_MCP_TELEMETRY_SURFACES,
} from "../lib/mcp-adoption-report.js";
import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SELECT_COLUMNS = MCP_ADOPTION_EVENT_COLUMNS.join(",");

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

async function fetchPolicyMcpEvents(config, { since, maxRows }) {
  const rows = [];
  const pageSize = Math.min(1000, maxRows);
  let offset = 0;
  let truncated = false;

  while (rows.length < maxRows) {
    const result = await supabaseRestRequest(config, {
      path: "/rest/v1/mcp_usage_events",
      params: {
        select: SELECT_COLUMNS,
        surface: `in.(${POLICY_MCP_TELEMETRY_SURFACES.join(",")})`,
        timestamp: `gte.${since}`,
        order: "timestamp.asc",
        limit: Math.min(pageSize, maxRows - rows.length),
        offset,
      },
    });
    if (!result.ok) {
      throw new Error(`Unable to query MCP telemetry (${result.status}): ${result.error}`);
    }

    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
    if (rows.length >= maxRows) truncated = true;
  }

  return { rows, truncated };
}

async function main() {
  const days = positiveInteger(argValue("--days", "30"), 30);
  const maxRows = positiveInteger(argValue("--max-rows", "10000"), 10000);
  const config = getPolicySupabaseConfig();
  if (!config.configured) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this operator environment.");
  }

  const generatedAt = new Date().toISOString();
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { rows, truncated } = await fetchPolicyMcpEvents(config, { since, maxRows });
  const report = buildMcpAdoptionReport({ events: rows, generatedAt });
  report.window = {
    since,
    days,
    surfaces: POLICY_MCP_TELEMETRY_SURFACES,
    rows_read: rows.length,
    truncated,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
