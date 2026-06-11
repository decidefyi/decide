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
const KEY_HISTORY_ENV = "DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON";
const DEFAULT_KEY_ID = "decide-rulebook-attestation-ed25519-v1";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function normalizeOptionalTimestamp(value, field, index) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`key_history[${index}].${field} must be an ISO timestamp.`);
  }
  return normalized;
}

function normalizeHistoryKey(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`key_history[${index}] must be an object.`);
  }

  const keyId = String(entry.key_id || "").trim();
  if (!keyId) {
    throw new Error(`key_history[${index}].key_id is required.`);
  }

  const algorithm = String(entry.algorithm || RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM).trim();
  if (algorithm !== RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM) {
    throw new Error(`key_history[${index}].algorithm must be ${RULEBOOK_ATTESTATION_SIGNATURE_ALGORITHM}.`);
  }

  const publicKeyPem = normalizePem(entry.public_key_pem);
  if (!publicKeyPem) {
    throw new Error(`key_history[${index}].public_key_pem is required.`);
  }

  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`key_history[${index}].public_key_pem must be an Ed25519 public key.`);
  }

  const status = String(entry.status || "retired").trim().toLowerCase();
  if (status !== "retired") {
    throw new Error(`key_history[${index}].status must be retired.`);
  }

  const notBefore = normalizeOptionalTimestamp(entry.not_before, "not_before", index);
  const notAfter = normalizeOptionalTimestamp(entry.not_after, "not_after", index);
  if (notBefore && notAfter && Date.parse(notBefore) > Date.parse(notAfter)) {
    throw new Error(`key_history[${index}].not_before must be before not_after.`);
  }

  return {
    key_id: keyId,
    algorithm,
    public_key_pem: publicKeyPem,
    use: String(entry.use || "rulebook_attestation_signature").trim() || "rulebook_attestation_signature",
    status,
    ...(notBefore ? { not_before: notBefore } : {}),
    ...(notAfter ? { not_after: notAfter } : {}),
  };
}

function resolveKeyHistory(env = process.env) {
  const raw = String(env[KEY_HISTORY_ENV] || "").trim();
  if (!raw) {
    return { ok: true, keys: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${KEY_HISTORY_ENV} must be a JSON array.`);
    }
    const keys = parsed.map((entry, index) => normalizeHistoryKey(entry, index));
    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key.key_id)) {
        throw new Error(`Duplicate key_id in ${KEY_HISTORY_ENV}: ${key.key_id}.`);
      }
      seen.add(key.key_id);
    }
    return { ok: true, keys };
  } catch (error) {
    return {
      ok: false,
      keys: [],
      error: "RULEBOOK_ATTESTATION_KEY_HISTORY_INVALID",
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
  const history = resolveKeyHistory(env);
  if (!history.ok) {
    return {
      schema_version: RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION,
      active_key_id: key.ok ? key.keyId : null,
      keys: [],
      key_history_count: 0,
      status: "error",
      error: history.error,
      message: history.message,
    };
  }

  if (!key.ok) {
    return {
      schema_version: RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION,
      active_key_id: null,
      keys: history.keys,
      key_history_count: history.keys.length,
      status: key.configured ? "error" : "unsigned",
      error: key.error,
      message: key.configured ? "Rulebook attestation signing key is configured but invalid." : "No active signing key is configured.",
    };
  }

  if (history.keys.some((entry) => entry.key_id === key.keyId)) {
    return {
      schema_version: RULEBOOK_ATTESTATION_KEYS_SCHEMA_VERSION,
      active_key_id: key.keyId,
      keys: [],
      key_history_count: 0,
      status: "error",
      error: "RULEBOOK_ATTESTATION_KEY_HISTORY_INVALID",
      message: `Retired key history must not duplicate active key id ${key.keyId}.`,
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
        status: "active",
      },
      ...history.keys,
    ],
    key_history_count: history.keys.length,
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
