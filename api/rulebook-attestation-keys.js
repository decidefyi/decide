import {
  getRulebookAttestationSigningKeys,
  isRulebookAttestationSignatureRequired,
} from "../lib/rulebook-attestation-signing.js";

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

  const signatureRequired = isRulebookAttestationSignatureRequired();
  const signingKeys = getRulebookAttestationSigningKeys();
  const payload = {
    ok: !signatureRequired || signingKeys.status === "signed",
    signature_required: signatureRequired,
    ...signingKeys,
  };
  if (signatureRequired && signingKeys.status !== "signed") {
    payload.error = "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED";
    payload.signing_error = signingKeys.error;
    payload.message = "Rulebook attestation signing is required, but no valid signing key is available.";
  }
  const statusCode = payload.ok ? 200 : 503;

  if (req.method === "HEAD") {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.end();
    return;
  }

  sendJson(res, statusCode, payload);
}
