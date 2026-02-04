function toUnixSeconds(ms) {
  return Math.floor(ms / 1000);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseAxiomRows(payload) {
  const rows = payload?.rows || payload?.tables?.[0]?.rows || [];
  const cols = payload?.columns || payload?.tables?.[0]?.columns || [];
  if (!Array.isArray(rows)) return [];
  if (!Array.isArray(cols) || !cols.length) return rows;

  const colNames = cols.map((c) => (typeof c === "string" ? c : c?.name || ""));
  return rows.map((row) => {
    if (!Array.isArray(row)) return row;
    const obj = {};
    for (let i = 0; i < colNames.length; i += 1) {
      obj[colNames[i]] = row[i];
    }
    return obj;
  });
}

export async function getAxiomMetricsSnapshot() {
  const dataset = process.env.AXIOM_DATASET;
  const token = process.env.AXIOM_TOKEN;
  if (!dataset || !token) return null;

  const now = Date.now();
  const hourAgo = toUnixSeconds(now - (60 * 60 * 1000));
  const dayAgo = toUnixSeconds(now - (24 * 60 * 60 * 1000));
  const sevenDaysAgo = toUnixSeconds(now - (7 * 24 * 60 * 60 * 1000));

  // APL syntax can vary over time; this query is wrapped in try/catch and
  // callers should gracefully fall back to in-memory metrics if unavailable.
  const apl = `
['${dataset}']
| where event == "client_event"
| extend ts = unixtime_seconds_todatetime(toint(timestamp(_time)))
| summarize
    total_events=count(),
    events_last_hour=countif(toint(timestamp(_time)) >= ${hourAgo}),
    events_last_24h=countif(toint(timestamp(_time)) >= ${dayAgo}),
    events_last_7d=countif(toint(timestamp(_time)) >= ${sevenDaysAgo})
`;

  const topApl = `
['${dataset}']
| where event == "client_event"
| where toint(timestamp(_time)) >= ${dayAgo}
| summarize count=count() by event_name
| sort by count desc
| limit 50
`;

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const [summaryResp, topResp] = await Promise.all([
    fetch(`https://api.axiom.co/v1/datasets/${dataset}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ apl }),
    }),
    fetch(`https://api.axiom.co/v1/datasets/${dataset}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ apl: topApl }),
    }),
  ]);

  if (!summaryResp.ok || !topResp.ok) {
    return null;
  }

  const [summaryPayload, topPayload] = await Promise.all([
    summaryResp.json(),
    topResp.json(),
  ]);

  const summaryRows = parseAxiomRows(summaryPayload);
  const topRows = parseAxiomRows(topPayload);
  const summary = summaryRows?.[0] || {};
  const byEvent24h = {};

  for (const row of topRows || []) {
    const key = row?.event_name || row?.["event_name"] || "unknown";
    byEvent24h[key] = safeNumber(row?.count);
  }

  return {
    source: "axiom_query",
    total_events: safeNumber(summary.total_events),
    events_last_hour: safeNumber(summary.events_last_hour),
    events_last_24h: safeNumber(summary.events_last_24h),
    events_last_7d: safeNumber(summary.events_last_7d),
    by_event_24h: byEvent24h,
    updated_at: new Date().toISOString(),
  };
}

