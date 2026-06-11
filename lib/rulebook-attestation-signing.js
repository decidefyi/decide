import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

export const RULEBOOK_ATTESTATION_SIGNATURE_SCHEMA_VERSION = "rulebook_attestation_signature_v1";
export const RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION = "rulebook_attestation_keys_v1";
export const RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM = "Ed25519";
export const RULEBOOK_ATTESTATION_PUBLIC_KEY_URL = "https://api.decide.fyi/.well-known/rulebook-attestation-keys.json";

const PRIVATE_KEY_ENV = "DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM";
const KEY_ID_ENV = "DECIDE_RULEBOOK_ATTESTATION_KEY_ID";
const SIGNATURE_REQUIRED_ENV = "DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED";
const DEFAULT_KEY_ID = "decide-rulebook-attestation-ed25519-v1";

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64url(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function resolveSigningKey(env = process.env) {
  const privateKeyPem = normalizePem(env[PRIVATE_KEY_ENV]);
  if (!privateKeyPem) {
    return {
      ok: false,
      configured: false,
      error: "RULEBOOK_ATTESTATION_SIGNING_KEY_MISSING",
      message: `${PRIVATE_KEY_ENV} is not configured.`,
    };
  }

  try {
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey(privateKey);
    return {
      ok: true,
      configured: true,
      keyId: String(env[KEY_ID_ENV] || DEFAULT_KEY_ID).trim() || DEFAULT_KEY_ID,
      privateKey,
      publicKey,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: "RULEBOOK_ATTESTATION_SIGNING_KEY_INVALID",
      message: String(error?.message || error),
    };
  }
}

export function isRulebookAttestationSignatureRequired(env = process.env) {
  return ["1", "true", "yes", "required"].includes(
    String(env[SIGNATURE_REQUIRED_ENV] || "").trim().toLowerCase()
  );
}

export function signRulebookAttestationBundleHash(bundleHash, env = process.env) {
  const key = resolveSigningKey(env);
  if (!key.configured) {
    return {
      schema_version: RULEBOOK_ATTESTATION_SIGNATURE_SCHEMA_VERSION,
      status: "unsigned",
      algorithm: RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM,
      signed_field: "bundle_hash",
      key_id: null,
      public_key_url: RULEBOOK_ATTESTATION_PUBLIC_KEY_URL,
      signature: null,
    };
  }

  if (!key.ok) {
    return {
      schema_version: RULEBOOK_ATTESTATION_SIGNATURE_SCHEMA_VERSION,
      status: "error",
      algorithm: RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM,
      signed_field: "bundle_hash",
      key_id: String(env[KEY_ID_ENV] || DEFAULT_KEY_ID).trim() || DEFAULT_KEY_ID,
      public_key_url: RULEBOOK_ATTESTATION_PUBLIC_KEY_URL,
      signature: null,
      error: key.error,
      message: key.message,
    };
  }

  const signature = cryptoSign(null, Buffer.from(String(bundleHash || ""), "utf8"), key.privateKey);
  return {
    schema_version: RULEBOOK_ATTESTATION_SIGNATURE_SCHEMA_VERSION,
    status: "signed",
    algorithm: RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM,
    signed_field: "bundle_hash",
    key_id: key.keyId,
    public_key_url: RULEBOOK_ATTESTATION_PUBLIC_KEY_URL,
    public_key_pem: key.publicKeyPem,
    signature: base64url(signature),
  };
}

export function getRulebookAttestationSigningKeys(env = process.env) {
  const key = resolveSigningKey(env);
  if (!key.ok) {
    return {
      schema_version: RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION,
      active_key_id: null,
      keys: [],
      status: key.configured ? "error" : "unsigned",
      error: key.error,
      message: key.configured ? "Rulebook attestation signing key is configured but invalid." : "No active signing key is configured.",
    };
  }

  return {
    schema_version: RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION,
    active_key_id: key.keyId,
    keys: [
      {
        key_id: key.keyId,
        algorithm: RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM,
        public_key_pem: key.publicKeyPem,
        use: "rulebook_attestation_signature",
      },
    ],
    status: "signed",
  };
}

export function verifyRulebookAttestationSignature({ bundleHash, signature, publicKeyPem } = {}) {
  try {
    const publicKey = createPublicKey(normalizePem(publicKeyPem));
    return cryptoVerify(
      null,
      Buffer.from(String(bundleHash || ""), "utf8"),
      publicKey,
      fromBase64url(signature)
    );
  } catch {
    return false;
  }
}
