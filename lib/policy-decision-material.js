const POLICY_DECISION_MATERIAL = Symbol("policy_decision_material");

function readHeader(req, name) {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(req?.headers || {})) {
    if (String(key || "").toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
}

export function attachPolicyDecisionMaterial(result, { rulebook, inputs } = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const context = {
    workflow: String(rulebook?.rulebook_id || ""),
    requested_action: String(result.action || ""),
    subject: typeof inputs?.vendor === "string" ? inputs.vendor : "",
    inputs: inputs && typeof inputs === "object" && !Array.isArray(inputs) ? inputs : {},
  };
  Object.defineProperty(result, POLICY_DECISION_MATERIAL, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: {
      schema_version: "direct_rulebook_decision_material_v1",
      request: {
        mode: "rulebook",
        rulebook,
        context,
      },
    },
  });
  return result;
}

export function exposePolicyDecisionMaterial(req, payload) {
  if (readHeader(req, "x-decide-policy-record").trim() !== "1") return payload;
  const material = payload?.rulebook_result?.[POLICY_DECISION_MATERIAL];
  if (!material) return payload;
  return {
    ...payload,
    decision_record_material: material,
  };
}
