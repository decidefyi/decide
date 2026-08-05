const REQUEST_URL_BASE = "http://localhost";

export function parseRequestQuery(request) {
  const query = Object.create(null);
  let url;
  try {
    url = new URL(String(request?.url || "/"), REQUEST_URL_BASE);
  } catch {
    return query;
  }

  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(query, key)) {
      query[key] = value;
      continue;
    }

    const existing = query[key];
    query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return query;
}
