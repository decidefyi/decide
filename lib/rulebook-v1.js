import { createHash } from "node:crypto";

import { validateJsonSchemaSubset } from "./json-schema-subset.js";
import {
  RULEBOOK_EVALUATOR_VERSION,
  RULEBOOK_JSON_SCHEMA,
  RULEBOOK_RUNTIME_CONTRACT,
  RULEBOOK_SCHEMA_HASH,
  RULEBOOK_SCHEMA_URL,
  RULEBOOK_SCHEMA_VERSION,
  buildRulebookRuntimeBinding,
} from "./rulebook-runtime-contract.js";

const DECISION_VALUES = new Set(["yes", "no", "review"]);
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,159}$/;
const ID_PATTERN = /^[a-z][a-z0-9_.:-]{1,119}$/;
const VERDICT_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;
const MAX_RULES = 100;
const MAX_CONDITION_DEPTH = 8;
const MAX_CONDITION_NODES = 256;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function validateAllowedKeys(source, allowedKeys, path, errors) {
  if (!isPlainObject(source)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      errors.push({
        field: `${path}.${key}`,
        code: "unknown_field",
        message: "is not part of the rulebook_v1 declarative schema",
      });
    }
  }
}

function getFieldValue(inputs, path) {
  const segments = String(path || "").split(".");
  let current = inputs;
  for (const segment of segments) {
    if (!isPlainObject(current) || !hasOwn(current, segment)) {
      return { exists: false, value: undefined };
    }
    current = current[segment];
  }
  return { exists: true, value: current };
}

function valueTypeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return false;
}

function validateOutcome(outcome, path, errors) {
  if (!isPlainObject(outcome)) {
    errors.push({ field: path, code: "invalid_type", message: "must be an object" });
    return;
  }
  validateAllowedKeys(outcome, ["decision", "verdict", "action", "reason_code"], path, errors);
  const decision = String(outcome.decision || "").trim().toLowerCase();
  const verdict = String(outcome.verdict || "").trim();
  const action = String(outcome.action || "").trim();
  const reasonCode = String(outcome.reason_code || "").trim();
  if (!DECISION_VALUES.has(decision)) {
    errors.push({ field: `${path}.decision`, code: "invalid_value", message: "must be yes, no, or review" });
  }
  if (!VERDICT_PATTERN.test(verdict)) {
    errors.push({ field: `${path}.verdict`, code: "invalid_value", message: "must be an uppercase verdict token" });
  }
  if (!action || action.length > 160) {
    errors.push({ field: `${path}.action`, code: "invalid_value", message: "must be 1-160 characters" });
  }
  if (!VERDICT_PATTERN.test(reasonCode)) {
    errors.push({ field: `${path}.reason_code`, code: "invalid_value", message: "must be an uppercase reason token" });
  }
}

function validateCondition(condition, path, errors, state, depth = 0) {
  if (!isPlainObject(condition)) {
    errors.push({ field: path, code: "invalid_type", message: "must be an object" });
    return;
  }
  state.nodes += 1;
  if (state.nodes > MAX_CONDITION_NODES) {
    errors.push({ field: path, code: "too_complex", message: `must contain at most ${MAX_CONDITION_NODES} condition nodes` });
    return;
  }
  if (depth > MAX_CONDITION_DEPTH) {
    errors.push({ field: path, code: "too_deep", message: `must be at most ${MAX_CONDITION_DEPTH} levels deep` });
    return;
  }

  const combinators = ["all", "any", "not"].filter((key) => hasOwn(condition, key));
  const hasLeaf = hasOwn(condition, "field") || hasOwn(condition, "operator");
  if (combinators.length + (hasLeaf ? 1 : 0) !== 1) {
    errors.push({
      field: path,
      code: "invalid_condition",
      message: "must define exactly one of all, any, not, or a field/operator condition",
    });
    return;
  }

  if (hasOwn(condition, "all") || hasOwn(condition, "any")) {
    const key = hasOwn(condition, "all") ? "all" : "any";
    validateAllowedKeys(condition, [key], path, errors);
    const children = condition[key];
    if (!Array.isArray(children) || children.length === 0 || children.length > 32) {
      errors.push({ field: `${path}.${key}`, code: "invalid_value", message: "must contain 1-32 conditions" });
      return;
    }
    children.forEach((child, index) => validateCondition(child, `${path}.${key}[${index}]`, errors, state, depth + 1));
    return;
  }

  if (hasOwn(condition, "not")) {
    validateAllowedKeys(condition, ["not"], path, errors);
    validateCondition(condition.not, `${path}.not`, errors, state, depth + 1);
    return;
  }

  validateAllowedKeys(condition, ["field", "operator", "value"], path, errors);
  const field = String(condition.field || "").trim();
  const operator = String(condition.operator || "").trim();
  const operators = new Set([
    "exists",
    "not_exists",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "contains",
    "not_contains",
  ]);
  if (!FIELD_PATTERN.test(field)) {
    errors.push({ field: `${path}.field`, code: "invalid_value", message: "must be a safe dotted input path" });
  }
  if (!operators.has(operator)) {
    errors.push({ field: `${path}.operator`, code: "unsupported_operator", message: "operator is not supported by rulebook_v1" });
  }
}

function validateRulebook(rulebook) {
  const errors = [];
  if (!isPlainObject(rulebook)) {
    return [{ field: "rulebook", code: "invalid_type", message: "must be an object" }];
  }
  errors.push(...validateJsonSchemaSubset(rulebook, RULEBOOK_JSON_SCHEMA, { path: "rulebook" }));
  validateAllowedKeys(
    rulebook,
    ["schema_version", "rulebook_id", "version", "input_schema", "rules", "default_outcome"],
    "rulebook",
    errors
  );
  if (rulebook.schema_version !== RULEBOOK_SCHEMA_VERSION) {
    errors.push({
      field: "rulebook.schema_version",
      code: "unsupported_version",
      message: `must equal ${RULEBOOK_SCHEMA_VERSION}`,
    });
  }
  if (!ID_PATTERN.test(String(rulebook.rulebook_id || ""))) {
    errors.push({ field: "rulebook.rulebook_id", code: "invalid_value", message: "must be a stable lowercase identifier" });
  }
  const version = String(rulebook.version || "").trim();
  if (!version || version.length > 80) {
    errors.push({ field: "rulebook.version", code: "invalid_value", message: "must be 1-80 characters" });
  }

  const inputSchema = isPlainObject(rulebook.input_schema) ? rulebook.input_schema : {};
  validateAllowedKeys(inputSchema, ["required", "properties"], "rulebook.input_schema", errors);
  const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
  const properties = isPlainObject(inputSchema.properties) ? inputSchema.properties : {};
  required.forEach((field, index) => {
    if (!FIELD_PATTERN.test(String(field || ""))) {
      errors.push({ field: `rulebook.input_schema.required[${index}]`, code: "invalid_value", message: "must be a safe input path" });
    }
  });
  Object.entries(properties).forEach(([field, definition]) => {
    if (!FIELD_PATTERN.test(field)) {
      errors.push({ field: `rulebook.input_schema.properties.${field}`, code: "invalid_value", message: "invalid property name" });
      return;
    }
    validateAllowedKeys(definition, ["type"], `rulebook.input_schema.properties.${field}`, errors);
    const type = String(isPlainObject(definition) ? definition.type || "" : "");
    if (!["array", "object", "number", "integer", "string", "boolean", "null"].includes(type)) {
      errors.push({ field: `rulebook.input_schema.properties.${field}.type`, code: "invalid_value", message: "unsupported input type" });
    }
  });

  const rules = Array.isArray(rulebook.rules) ? rulebook.rules : [];
  if (rules.length === 0 || rules.length > MAX_RULES) {
    errors.push({ field: "rulebook.rules", code: "invalid_value", message: `must contain 1-${MAX_RULES} rules` });
  }
  const seenRuleIds = new Set();
  const conditionState = { nodes: 0 };
  rules.forEach((rule, index) => {
    const path = `rulebook.rules[${index}]`;
    if (!isPlainObject(rule)) {
      errors.push({ field: path, code: "invalid_type", message: "must be an object" });
      return;
    }
    validateAllowedKeys(rule, ["rule_id", "priority", "condition", "outcome"], path, errors);
    const ruleId = String(rule.rule_id || "");
    if (!ID_PATTERN.test(ruleId)) {
      errors.push({ field: `${path}.rule_id`, code: "invalid_value", message: "must be a stable lowercase identifier" });
    } else if (seenRuleIds.has(ruleId)) {
      errors.push({ field: `${path}.rule_id`, code: "duplicate_value", message: "must be unique" });
    }
    seenRuleIds.add(ruleId);
    if (rule.priority !== undefined && (!Number.isInteger(rule.priority) || rule.priority < -1000 || rule.priority > 1000)) {
      errors.push({ field: `${path}.priority`, code: "invalid_value", message: "must be an integer from -1000 to 1000" });
    }
    validateCondition(rule.condition, `${path}.condition`, errors, conditionState);
    validateOutcome(rule.outcome, `${path}.outcome`, errors);
  });
  validateOutcome(rulebook.default_outcome, "rulebook.default_outcome", errors);
  return errors;
}

function rulebookContract() {
  return { ...RULEBOOK_RUNTIME_CONTRACT };
}

function compareScalar(left, right, operator) {
  if (operator === "eq") return Object.is(left, right);
  if (operator === "neq") return !Object.is(left, right);
  if (operator === "gt") return typeof left === "number" && typeof right === "number" && left > right;
  if (operator === "gte") return typeof left === "number" && typeof right === "number" && left >= right;
  if (operator === "lt") return typeof left === "number" && typeof right === "number" && left < right;
  if (operator === "lte") return typeof left === "number" && typeof right === "number" && left <= right;
  if (operator === "in") return Array.isArray(right) && right.some((entry) => Object.is(entry, left));
  if (operator === "not_in") return Array.isArray(right) && !right.some((entry) => Object.is(entry, left));
  if (operator === "contains") {
    if (Array.isArray(left)) return left.some((entry) => Object.is(entry, right));
    if (typeof left === "string" && typeof right === "string") return left.includes(right);
    return false;
  }
  if (operator === "not_contains") return !compareScalar(left, right, "contains");
  return false;
}

function evaluateCondition(condition, inputs) {
  if (hasOwn(condition, "all")) {
    const children = condition.all.map((entry) => evaluateCondition(entry, inputs));
    return { passed: children.every((entry) => entry.passed), checks: children.flatMap((entry) => entry.checks) };
  }
  if (hasOwn(condition, "any")) {
    const children = condition.any.map((entry) => evaluateCondition(entry, inputs));
    return { passed: children.some((entry) => entry.passed), checks: children.flatMap((entry) => entry.checks) };
  }
  if (hasOwn(condition, "not")) {
    const child = evaluateCondition(condition.not, inputs);
    return { passed: !child.passed, checks: child.checks };
  }

  const field = String(condition.field);
  const operator = String(condition.operator);
  const resolved = getFieldValue(inputs, field);
  let passed;
  if (operator === "exists") passed = resolved.exists;
  else if (operator === "not_exists") passed = !resolved.exists;
  else passed = resolved.exists && compareScalar(resolved.value, condition.value, operator);
  return {
    passed,
    checks: [{ field, operator, passed }],
  };
}

function normalizeOutcome(outcome) {
  return {
    decision: String(outcome.decision).toLowerCase(),
    verdict: String(outcome.verdict),
    action: String(outcome.action),
    reasonCode: String(outcome.reason_code),
  };
}

function validateInputs(rulebook, inputs) {
  const schema = isPlainObject(rulebook.input_schema) ? rulebook.input_schema : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const missingFields = required.filter((field) => !getFieldValue(inputs, field).exists);
  const invalidFields = [];
  Object.entries(properties).forEach(([field, definition]) => {
    const resolved = getFieldValue(inputs, field);
    if (!resolved.exists) return;
    if (!valueTypeMatches(resolved.value, definition.type)) invalidFields.push(field);
  });
  return { missingFields, invalidFields };
}

export function evaluateRulebookV1({ rulebook, inputs, bindingMode } = {}) {
  const errors = validateRulebook(rulebook);
  if (errors.length) {
    return {
      ok: false,
      statusCode: 422,
      error: "RULEBOOK_INVALID",
      message: "Rulebook v1 validation failed.",
      errors,
    };
  }

  const normalizedInputs = isPlainObject(inputs) ? inputs : {};
  const runtimeBinding = buildRulebookRuntimeBinding({ bindingMode });
  const rulebookHash = sha256(canonicalJson(rulebook));
  const inputHash = sha256(canonicalJson(normalizedInputs));
  const inputValidation = validateInputs(rulebook, normalizedInputs);
  if (inputValidation.missingFields.length || inputValidation.invalidFields.length) {
    return {
      ok: true,
      result: {
        status: "needs_input",
        engine: RULEBOOK_EVALUATOR_VERSION,
        evaluator_version: RULEBOOK_EVALUATOR_VERSION,
        rulebook_contract: rulebookContract(),
        runtime_binding: runtimeBinding,
        verdict: "review",
        application_verdict: "NEEDS_INPUT",
        action: "collect_required_input",
        reason_code: "INPUT_SCHEMA_FAILED",
        evidence: ["INPUT_SCHEMA_FAILED"],
        matched_rule_id: null,
        missing_fields: inputValidation.missingFields,
        invalid_fields: inputValidation.invalidFields,
        input_hash: inputHash,
        policy_id: rulebook.rulebook_id,
        policy_version: rulebook.version,
        policy_hash: rulebookHash,
        rulebook: {
          schema_version: RULEBOOK_SCHEMA_VERSION,
          id: rulebook.rulebook_id,
          version: rulebook.version,
          hash: rulebookHash,
        },
      },
    };
  }

  const orderedRules = [...rulebook.rules].sort((left, right) => {
    const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
    return priorityDiff || String(left.rule_id).localeCompare(String(right.rule_id));
  });

  let matchedRule = null;
  let conditionResult = { passed: false, checks: [] };
  for (const rule of orderedRules) {
    const evaluated = evaluateCondition(rule.condition, normalizedInputs);
    if (evaluated.passed) {
      matchedRule = rule;
      conditionResult = evaluated;
      break;
    }
  }

  const outcome = normalizeOutcome(matchedRule ? matchedRule.outcome : rulebook.default_outcome);
  return {
    ok: true,
    result: {
      status: "ok",
      engine: RULEBOOK_EVALUATOR_VERSION,
      evaluator_version: RULEBOOK_EVALUATOR_VERSION,
      rulebook_contract: rulebookContract(),
      runtime_binding: runtimeBinding,
      c: outcome.decision,
      v: outcome.verdict,
      verdict: outcome.decision,
      application_verdict: outcome.verdict,
      action: outcome.action,
      reason_code: outcome.reasonCode,
      evidence: [outcome.reasonCode],
      matched_rule_id: matchedRule ? matchedRule.rule_id : null,
      input_hash: inputHash,
      evaluation: {
        matched: Boolean(matchedRule),
        checks: conditionResult.checks,
      },
      policy_id: rulebook.rulebook_id,
      policy_version: rulebook.version,
      policy_hash: rulebookHash,
      rulebook: {
        schema_version: RULEBOOK_SCHEMA_VERSION,
        id: rulebook.rulebook_id,
        version: rulebook.version,
        hash: rulebookHash,
      },
    },
  };
}

export { RULEBOOK_EVALUATOR_VERSION, RULEBOOK_SCHEMA_HASH, RULEBOOK_SCHEMA_URL, RULEBOOK_SCHEMA_VERSION };
