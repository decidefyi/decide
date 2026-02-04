import { getMetricsSnapshot } from "../lib/metrics-store.js";

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

  const snapshot = getMetricsSnapshot();
  const top = snapshot.top_vendor_requests_30d || [];

  return send(res, 200, {
    ok: true,
    window: "30d",
    updated_at: snapshot.updated_at || null,
    top_vendor_requests: top,
  });
}

