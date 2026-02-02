import { NextResponse } from "next/server";

export function middleware(request) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  // Route cancel.decide.fyi/api/mcp → /api/cancel-mcp
  if (host.startsWith("cancel.") && pathname === "/api/mcp") {
    return NextResponse.rewrite(new URL("/api/cancel-mcp", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/mcp"],
};
