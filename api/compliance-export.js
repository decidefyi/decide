import { buildComplianceSnapshot, snapshotToCsv } from "../lib/compliance-export.js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readFormat(req) {
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    return String(parsed.searchParams.get("format") || "").toLowerCase();
  } catch {
    return "";
  }
}

export default async function complianceExportHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["GET"] });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const snapshot = buildComplianceSnapshot();
    const format = readFormat(req);
    if (format === "json") {
      return sendJson(res, 200, { ok: true, ...snapshot });
    }

    const csv = snapshotToCsv(snapshot);
    const dateStamp = String(snapshot.generated_at || "").slice(0, 10) || "unknown-date";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="decide-compliance-export-${dateStamp}.csv"`);
    res.end(csv);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: "COMPLIANCE_EXPORT_FAILED",
      message: String(error?.message || error || "unknown"),
    });
  }
}
