const STORE_KEY = "__decideClientMetrics";
const MAX_EVENTS = 5000;
const MAX_VENDOR_REQUESTS = 5000;

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = {
      events: [],
      vendorRequests: [],
      totalsByEvent: {},
      totalEvents: 0,
      updatedAt: null,
    };
  }
  return globalThis[STORE_KEY];
}

export function recordClientEvent(eventName, ts = Date.now()) {
  const store = getStore();
  const safeName = String(eventName || "unknown").slice(0, 64);
  const safeTs = Number.isFinite(ts) ? ts : Date.now();

  store.events.push({ event: safeName, ts: safeTs });
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }

  store.totalsByEvent[safeName] = (store.totalsByEvent[safeName] || 0) + 1;
  store.totalEvents += 1;
  store.updatedAt = new Date().toISOString();
}

export function recordVendorRequest(vendorName, ts = Date.now()) {
  const store = getStore();
  const vendor = String(vendorName || "").trim().toLowerCase().slice(0, 80);
  if (!vendor) return;
  const safeTs = Number.isFinite(ts) ? ts : Date.now();

  store.vendorRequests.push({ vendor, ts: safeTs });
  if (store.vendorRequests.length > MAX_VENDOR_REQUESTS) {
    store.vendorRequests.splice(0, store.vendorRequests.length - MAX_VENDOR_REQUESTS);
  }
  store.updatedAt = new Date().toISOString();
}

export function getMetricsSnapshot() {
  const store = getStore();
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  let lastHour = 0;
  let last24h = 0;
  let last7d = 0;
  const byEvent24h = {};
  const byVendor30d = {};

  for (const row of store.events) {
    if (row.ts >= oneHourAgo) lastHour += 1;
    if (row.ts >= oneDayAgo) {
      last24h += 1;
      byEvent24h[row.event] = (byEvent24h[row.event] || 0) + 1;
    }
    if (row.ts >= sevenDaysAgo) last7d += 1;
  }

  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  for (const row of store.vendorRequests) {
    if (row.ts >= thirtyDaysAgo) {
      byVendor30d[row.vendor] = (byVendor30d[row.vendor] || 0) + 1;
    }
  }

  const topVendorRequests30d = Object.entries(byVendor30d)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([vendor, count]) => ({ vendor, count }));

  return {
    total_events: store.totalEvents,
    events_last_hour: lastHour,
    events_last_24h: last24h,
    events_last_7d: last7d,
    recent_buffer_size: store.events.length,
    totals_by_event: store.totalsByEvent,
    by_event_24h: byEvent24h,
    top_vendor_requests_30d: topVendorRequests30d,
    vendor_requests_buffer_size: store.vendorRequests.length,
    updated_at: store.updatedAt,
  };
}
