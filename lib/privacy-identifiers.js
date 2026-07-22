import { createHmac } from "node:crypto";

export function buildPseudonymousCallerId(value = "", salt = "") {
  const normalizedValue = String(value || "").trim();
  const normalizedSalt = String(salt || "").trim();
  if (!normalizedValue || !normalizedSalt) return "";
  return createHmac("sha256", normalizedSalt)
    .update(normalizedValue)
    .digest("hex")
    .slice(0, 24);
}
