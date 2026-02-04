import { getMetricsSnapshot } from "../lib/metrics-store.js";
import { getAxiomMetricsSnapshot } from "../lib/metrics-axiom.js";
import { getClientIp } from "../lib/rate-limit.js";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["GET"] });
  }

  const adminToken = process.env.METRICS_ADMIN_TOKEN || "";
  const requestToken = String(
    req.headers["x-metrics-token"] ||
    req.query?.token ||
    ""
  );
  const clientIp = getClientIp(req);
  const isLocal = clientIp === "127.0.0.1" || clientIp === "::1";

  if (adminToken) {
    if (!requestToken || requestToken !== adminToken) {
      return send(res, 401, { ok: false, error: "UNAUTHORIZED_METRICS" });
    }
  } else if (!isLocal) {
    return send(res, 503, {
      ok: false,
      error: "METRICS_TOKEN_NOT_CONFIGURED",
      message: "Set METRICS_ADMIN_TOKEN to enable remote metrics access.",
    });
  }

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

  return send(res, 200, {
    ok: true,
    axiom_enabled: axiomEnabled,
    ...snapshot,
  });
}
