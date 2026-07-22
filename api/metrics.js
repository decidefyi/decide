import { getMetricsSnapshot } from "../lib/metrics-store.js";
import { getAxiomMetricsSnapshot } from "../lib/metrics-axiom.js";
import { getClientIp } from "../lib/rate-limit.js";
import { getPolicyGrowthReports } from "../lib/policy-growth-store.js";

const POLICY_GROWTH_CACHE_MS = 5 * 60 * 1000;
let policyGrowthCache = { expiresAt: 0, reports: null };

async function getCachedPolicyGrowthReports() {
  if (policyGrowthCache.reports && Date.now() < policyGrowthCache.expiresAt) {
    return policyGrowthCache.reports;
  }
  const reports = await getPolicyGrowthReports({ days: 30, maxRows: 10000 });
  policyGrowthCache = {
    expiresAt: Date.now() + POLICY_GROWTH_CACHE_MS,
    reports,
  };
  return reports;
}

export function resetMcpAdoptionCacheForTests() {
  policyGrowthCache = { expiresAt: 0, reports: null };
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-metrics-token");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["GET"] });
  }

  const adminToken = process.env.METRICS_ADMIN_TOKEN || "";
  const requestToken = String(req.headers["x-metrics-token"] || "");
  const clientIp = getClientIp(req);
  const isLocal = clientIp === "127.0.0.1" || clientIp === "::1";

  const authorized = adminToken
    ? Boolean(requestToken && requestToken === adminToken)
    : isLocal;

  const axiomEnabled = Boolean(process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN);
  const runtimeSnapshot = getMetricsSnapshot();
  let snapshot = {
    source: "in_memory_runtime",
    ...runtimeSnapshot,
  };

  if (axiomEnabled) {
    try {
      const axiomSnapshot = await getAxiomMetricsSnapshot();
      if (axiomSnapshot) {
        snapshot = {
          ...snapshot,
          ...axiomSnapshot,
          // Keep local totals available for quick debugging.
          local_runtime: runtimeSnapshot,
        };
      }
    } catch {
      // Swallow errors and keep runtime snapshot.
    }
  }

  // Public-safe subset: used by the marketing site (e.g. vendor request leaderboard).
  // Full metrics remain gated behind METRICS_ADMIN_TOKEN (or localhost if unset).
  if (!authorized) {
    return send(res, 200, {
      ok: true,
      limited: true,
      axiom_enabled: axiomEnabled,
      source: snapshot.source,
      top_vendor_requests_30d: snapshot.top_vendor_requests_30d || [],
      updated_at: snapshot.updated_at || null,
      message: adminToken
        ? "Provide x-metrics-token to access full metrics."
        : "Set METRICS_ADMIN_TOKEN to enable full remote metrics access.",
    });
  }

  let mcpAdoption = null;
  let policyFunnel = null;
  try {
    const reports = await getCachedPolicyGrowthReports();
    mcpAdoption = reports.mcpAdoption;
    policyFunnel = reports.policyFunnel;
  } catch {
    // Runtime metrics stay available when the private Supabase report is unavailable.
  }

  return send(res, 200, {
    ok: true,
    axiom_enabled: axiomEnabled,
    ...snapshot,
    mcp_adoption_available: Boolean(mcpAdoption),
    mcp_adoption: mcpAdoption,
    policy_funnel_available: Boolean(policyFunnel),
    policy_funnel: policyFunnel,
  });
}
