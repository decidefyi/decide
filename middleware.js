export default async function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || "";
  const { pathname } = url;

  // cancel.decide.fyi/api/mcp → /api/cancel-mcp
  if (host.startsWith("cancel.") && pathname === "/api/mcp") {
    const dest = new URL("/api/cancel-mcp", url.origin);
    return fetch(dest, request);
  }

  // refund.decide.fyi routes pass through (api/mcp.js already handles refund)
  // All other routes pass through unchanged
  return fetch(request);
}