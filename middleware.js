export default async function middleware(request) {
  // Apply before host shortcuts and rewrites, including direct Vercel aliases.
  // Store only a digest at the origin; Cloudflare owns the dedicated raw token.
  const originGuard = process.env.DECIDE_ORIGIN_GUARD;
  if (originGuard !== undefined && originGuard !== "off") {
    const expectedHash = process.env.DECIDE_ORIGIN_TOKEN_SHA256 || "";
    if (originGuard !== "required" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      return Response.json({ error: "ORIGIN_PROTECTION_UNAVAILABLE" }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const token = request.headers.get("x-decide-origin-token") || "";
    let tokenHash = "";
    if (/^[a-f0-9]{64}$/.test(token)) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    // A digest comparison does not reveal a useful prefix of the raw token.
    if (!tokenHash || tokenHash !== expectedHash) {
      return Response.json({ error: "ORIGIN_ACCESS_DENIED" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  const url = new URL(request.url);
  const host = request.headers.get("host") || "";
  const { pathname } = url;

  // Local development should bypass middleware rewrites to avoid recursion in vercel dev.
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
    return;
  }

  // policy.decide.fyi/api/mcp -> /api/policy-mcp
  if (host.startsWith("policy.") && pathname === "/api/mcp") {
    const dest = new URL("/api/policy-mcp", url.origin);
    return fetch(dest, request);
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
