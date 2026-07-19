import {
  buildMcpAdoptionReport,
  MCP_ADOPTION_EVENT_COLUMNS,
  POLICY_MCP_TELEMETRY_SURFACES,
} from "./mcp-adoption-report.js";
import { getPolicySupabaseConfig, supabaseRestRequest } from "./policy-supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SELECT_COLUMNS = MCP_ADOPTION_EVENT_COLUMNS.join(",");

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function fetchPolicyMcpEvents(config, { since, maxRows = 10000 } = {}) {
  const rows = [];
  const rowLimit = positiveInteger(maxRows, 10000);
  const pageSize = Math.min(1000, rowLimit);
  let offset = 0;
  let truncated = false;

  while (rows.length < rowLimit) {
    const limit = Math.min(pageSize, rowLimit - rows.length);
    const result = await supabaseRestRequest(config, {
      path: "/rest/v1/mcp_usage_events",
      params: {
        select: SELECT_COLUMNS,
        surface: `in.(${POLICY_MCP_TELEMETRY_SURFACES.join(",")})`,
        timestamp: `gte.${since}`,
        order: "timestamp.asc",
        limit,
        offset,
      },
    });
    if (!result.ok) {
      throw new Error(`Unable to query MCP telemetry (${result.status}): ${result.error}`);
    }

    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page);
    if (page.length < limit) break;
    offset += page.length;
    if (rows.length >= rowLimit) truncated = true;
  }

  return { rows, truncated };
}

export async function getMcpAdoptionReport({
  env = process.env,
  days = 30,
  maxRows = 10000,
  now = () => new Date(),
} = {}) {
  const windowDays = positiveInteger(days, 30);
  const rowLimit = positiveInteger(maxRows, 10000);
  const config = getPolicySupabaseConfig(env);
  if (!config.configured) {
    throw new Error("Supabase is not configured for the private MCP adoption report.");
  }

  const generatedAt = now().toISOString();
  const since = new Date(Date.parse(generatedAt) - windowDays * DAY_MS).toISOString();
  const { rows, truncated } = await fetchPolicyMcpEvents(config, { since, maxRows: rowLimit });
  const report = buildMcpAdoptionReport({ events: rows, generatedAt });
  report.window = {
    since,
    days: windowDays,
    surfaces: POLICY_MCP_TELEMETRY_SURFACES,
    rows_read: rows.length,
    truncated,
  };
  return report;
}
