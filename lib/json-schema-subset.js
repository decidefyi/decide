function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function valuesEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function resolveLocalSchemaRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((current, segment) => current?.[segment], rootSchema);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  return typeof value;
}

function schemaTypeMatches(value, expectedType) {
  if (expectedType === "null") return value === null;
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "object") return isPlainObject(value);
  if (expectedType === "integer") return Number.isInteger(value);
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expectedType;
}

function error(path, message) {
  return {
    field: path,
    code: "schema_violation",
    message,
  };
}

export function validateJsonSchemaSubset(value, schema, options = {}) {
  const rootSchema = options.rootSchema || schema;
  const path = options.path || "value";
  if (schema === true) return [];
  if (schema === false) return [error(path, "schema forbids this value")];
  if (!isPlainObject(schema)) return [];

  if (schema.$ref) {
    const referencedSchema = resolveLocalSchemaRef(rootSchema, schema.$ref);
    if (!referencedSchema) {
      return [error(path, `unresolved schema ref ${schema.$ref}`)];
    }
    return validateJsonSchemaSubset(value, referencedSchema, { rootSchema, path });
  }

  const errors = [];
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf
      .map((entry) => validateJsonSchemaSubset(value, entry, { rootSchema, path }))
      .filter((entryErrors) => entryErrors.length === 0);
    if (matches.length !== 1) {
      errors.push(error(path, "must match exactly one schema variant"));
      return errors;
    }
  }

  if (hasOwn(schema, "const") && !valuesEqual(value, schema.const)) {
    errors.push(error(path, `expected const ${JSON.stringify(schema.const)}`));
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => valuesEqual(value, entry))) {
    errors.push(error(path, `expected one of ${schema.enum.join(", ")}`));
  }

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((entry) => schemaTypeMatches(value, entry))) {
      errors.push(error(path, `expected type ${expectedTypes.join("|")}, received ${valueType(value)}`));
      return errors;
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(error(path, `minLength ${schema.minLength}`));
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(error(path, `maxLength ${schema.maxLength}`));
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(error(path, `pattern ${schema.pattern}`));
    }
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) {
      errors.push(error(path, "expected date-time"));
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(error(path, `minimum ${schema.minimum}`));
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(error(path, `maximum ${schema.maximum}`));
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(error(path, `minItems ${schema.minItems}`));
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(error(path, `maxItems ${schema.maxItems}`));
    }
    if (schema.items !== undefined) {
      value.forEach((entry, index) => {
        errors.push(...validateJsonSchemaSubset(entry, schema.items, { rootSchema, path: `${path}[${index}]` }));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!hasOwn(value, key)) {
        errors.push(error(`${path}.${key}`, "required"));
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (hasOwn(properties, key)) {
        errors.push(...validateJsonSchemaSubset(entry, properties[key], { rootSchema, path: `${path}.${key}` }));
      } else if (schema.additionalProperties === false) {
        errors.push(error(`${path}.${key}`, `additionalProperties forbids field ${key}`));
      } else if (isPlainObject(schema.additionalProperties)) {
        errors.push(
          ...validateJsonSchemaSubset(entry, schema.additionalProperties, { rootSchema, path: `${path}.${key}` })
        );
      }
    }
  }

  return errors;
}
