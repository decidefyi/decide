import { readFileSync } from "node:fs";

import { buildRulebookAttestation } from "./rulebook-attestation.js";
import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
import { evaluateRulebookV1 } from "./rulebook-v1.js";

export const RETURN_POLICY_RULEBOOK = Object.freeze(
  JSON.parse(readFileSync(new URL("../rules/return-policy-notary-v1.json", import.meta.url), "utf8"))
);

export function evaluateReturnPolicyRulebook(inputs) {
  const evaluation = evaluateRulebookV1({
    rulebook: RETURN_POLICY_RULEBOOK,
    inputs,
  });
  if (!evaluation.ok) {
    throw new Error(`Return policy rulebook invalid: ${evaluation.error}`);
  }
  const result = evaluation.result;
  const rulebookAttestation = buildRulebookAttestation(result);
  if (
    isRulebookAttestationSignatureRequired() &&
    rulebookAttestation.signature?.status !== "signed"
  ) {
    const error = new Error("Rulebook attestation signing is required, but no valid signing key is available.");
    error.code = "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED";
    error.statusCode = 503;
    error.signatureStatus = rulebookAttestation.signature?.status || "missing";
    error.signatureError = rulebookAttestation.signature?.error;
    throw error;
  }
  return {
    ...result,
    rulebook_attestation: rulebookAttestation,
  };
}
