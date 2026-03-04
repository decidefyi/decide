const NOTARY_HOSTS = new Set(["refund", "cancel", "return", "trial"]);

function normalizeHost(req) {
  const forwardedHostRaw =
    typeof req?.headers?.["x-forwarded-host"] === "string" ? req.headers["x-forwarded-host"] : "";
  const hostRaw = typeof req?.headers?.host === "string" ? req.headers.host : "";
  const candidate = (forwardedHostRaw || hostRaw || "").split(",")[0].trim().toLowerCase();
  if (!candidate) return "";
  return candidate.split(":")[0];
}

function inferServiceFromHost(host) {
  if (!host) {
    return {
      service: "decide.fyi",
      notary: null,
    };
  }

  const exactNotaryMatch = host.match(/^(refund|cancel|return|trial)\.decide\.fyi$/);
  if (exactNotaryMatch) {
    const notary = exactNotaryMatch[1];
    return {
      service: `${notary}.decide.fyi`,
      notary,
    };
  }

  const subdomainMatch = host.match(/^([a-z0-9-]+)\.decide\.fyi$/);
  if (subdomainMatch && NOTARY_HOSTS.has(subdomainMatch[1])) {
    const notary = subdomainMatch[1];
    return {
      service: `${notary}.decide.fyi`,
      notary,
    };
  }

  if (host === "decide.fyi" || host === "www.decide.fyi") {
    return {
      service: "decide.fyi",
      notary: null,
    };
  }

  return {
    service: host,
    notary: null,
  };
}

export default function handler(req, res) {
  const host = normalizeHost(req);
  const identity = inferServiceFromHost(host);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      service: identity.service,
      notary: identity.notary,
      host,
      ts: new Date().toISOString(),
    })
  );
}
