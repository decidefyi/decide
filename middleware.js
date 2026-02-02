function withBasePath(url, basePath) {
  if (url.pathname.startsWith(`${basePath}/`) || url.pathname === basePath) {
    return url;
  }

  const nextUrl = new URL(url);
  nextUrl.pathname = `${basePath}${url.pathname}`;
  return nextUrl;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || "";

  if (host.startsWith("cancel.")) {
    const nextUrl = withBasePath(url, "/cancel");
    return fetch(nextUrl, request);
  }

  if (host.startsWith("refund.")) {
    const nextUrl = withBasePath(url, "/refund");
    return fetch(nextUrl, request);
  }

  return fetch(request);
}
