import {
  buildMcpAdoptionReport,
  buildMcpAdoptionTrend,
  POLICY_MCP_TELEMETRY_SURFACES,
} from "./mcp-adoption-report.js";
import { fetchPolicyMcpEvents } from "./mcp-adoption-store.js";
import {
  buildPolicyFunnelReport,
  POLICY_FUNNEL_EVENT_COLUMNS,
} from "./policy-funnel-report.js";
import { getPolicySupabaseConfig, supabaseRestRequest } from "./policy-supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SELECT_COLUMNS = POLICY_FUNNEL_EVENT_COLUMNS.join(",");

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function fetchPolicyFunnelEvents(config, { since, maxRows = 10000 } = {}) {
  const rows = [];
  const rowLimit = positiveInteger(maxRows, 10000);
  const pageSize = Math.min(1000, rowLimit);
  let offset = 0;
  let truncated = false;

  while (rows.length < rowLimit) {
    const limit = Math.min(pageSize, rowLimit - rows.length);
    const result = await supabaseRestRequest(config, {
      path: "/rest/v1/policy_funnel_events",
      params: {
        select: SELECT_COLUMNS,
        timestamp: `gte.${since}`,
        order: "timestamp.asc",
        limit,
        offset,
      },
    });
    if (!result.ok) {
      throw new Error(`Unable to query policy funnel telemetry (${result.status}): ${result.error}`);
    }
    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page);
    if (page.length < limit) break;
    offset += page.length;
    if (rows.length >= rowLimit) truncated = true;
  }

  return { rows, truncated };
}

export async function getPolicyGrowthReports({
  env = process.env,
  days = 30,
  maxRows = 10000,
  now = () => new Date(),
} = {}) {
  const windowDays = positiveInteger(days, 30);
  const rowLimit = positiveInteger(maxRows, 10000);
  const config = getPolicySupabaseConfig(env);
  if (!config.configured) {
    throw new Error("Supabase is not configured for private Policy Notaries reporting.");
  }

  const generatedAt = now().toISOString();
  const since = new Date(Date.parse(generatedAt) - windowDays * DAY_MS).toISOString();
  const [mcpResult, funnelResult] = await Promise.allSettled([
    fetchPolicyMcpEvents(config, { since, maxRows: rowLimit }),
    fetchPolicyFunnelEvents(config, { since, maxRows: rowLimit }),
  ]);

  const mcpEvents = mcpResult.status === "fulfilled" ? mcpResult.value.rows : [];
  let mcpAdoption = null;
  if (mcpResult.status === "fulfilled") {
    mcpAdoption = buildMcpAdoptionReport({ events: mcpEvents, generatedAt });
    mcpAdoption.trend = buildMcpAdoptionTrend({ events: mcpEvents, generatedAt, days: 7 });
    mcpAdoption.window = {
      since,
      days: windowDays,
      surfaces: POLICY_MCP_TELEMETRY_SURFACES,
      rows_read: mcpEvents.length,
      truncated: mcpResult.value.truncated,
    };
  }

  let policyFunnel = null;
  if (funnelResult.status === "fulfilled") {
    policyFunnel = buildPolicyFunnelReport({
      events: funnelResult.value.rows,
      mcpEvents,
      evaluatorDataAvailable: mcpResult.status === "fulfilled",
      generatedAt,
    });
    policyFunnel.window = {
      since,
      days: windowDays,
      rows_read: funnelResult.value.rows.length,
      truncated: funnelResult.value.truncated,
    };
  }

  return {
    mcpAdoption,
    policyFunnel,
    errors: {
      mcp: mcpResult.status === "rejected" ? String(mcpResult.reason?.message || mcpResult.reason) : "",
      funnel: funnelResult.status === "rejected" ? String(funnelResult.reason?.message || funnelResult.reason) : "",
    },
  };
}
