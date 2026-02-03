export default async function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || "";
  const { pathname } = url;

  // Local development should bypass middleware rewrites to avoid recursion in vercel dev.
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
    return;
  }

  // cancel.decide.fyi/api/mcp → /api/cancel-mcp
  if (host.startsWith("cancel.") && pathname === "/api/mcp") {
    const dest = new URL("/api/cancel-mcp", url.origin);
    return fetch(dest, request);
  }

  // return.decide.fyi/api/mcp → /api/return-mcp
  if (host.startsWith("return.") && pathname === "/api/mcp") {
    const dest = new URL("/api/return-mcp", url.origin);
    return fetch(dest, request);
  }

  // trial.decide.fyi/api/mcp → /api/trial-mcp
  if (host.startsWith("trial.") && pathname === "/api/mcp") {
    const dest = new URL("/api/trial-mcp", url.origin);
    return fetch(dest, request);
  }

  // refund.decide.fyi routes pass through (api/mcp.js already handles refund)
  // All other routes pass through unchanged
  return;
}
