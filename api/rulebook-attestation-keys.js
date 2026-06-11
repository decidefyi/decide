import { getRulebookAttestationSigningKeys } from "../lib/rulebook-attestation-signing.js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    sendJson(res, 405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Use GET to retrieve active Rulebook v1 attestation verification keys.",
    });
    return;
  }

  const payload = {
    ok: true,
    ...getRulebookAttestationSigningKeys(),
  };

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.end();
    return;
  }

  sendJson(res, 200, payload);
}
