export const TRUSTED_ADAPTER_EXECUTION_ISOLATION = "worker_thread_one_shot_v1";
export const TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT = "ambient_capability_deny_v2";
export const TRUSTED_ADAPTER_TIMEOUT_MS = 250;
export const TRUSTED_ADAPTER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8,
  stackSizeMb: 2,
});

const CAPABILITY_PATTERNS = Object.freeze([
  {
    capability: "clock_access",
    pattern: /\bDate\b|\bperformance\b|\bsetImmediate\b|\bsetInterval\b|\bsetTimeout\b/,
  },
  {
    capability: "environment_access",
    pattern: /\bprocess\b|\bglobalThis\b/,
  },
  {
    capability: "network_access",
    pattern:
      /\bfetch\b|\bWebSocket\b|\bEventSource\b|\bXMLHttpRequest\b|\bnode:(?:http|https|net|tls|dgram)\b/,
  },
  {
    capability: "randomness_access",
    pattern: /\bMath\s*\.\s*random\b|\bcrypto\b|\brandomBytes\b|\brandomUUID\b/,
  },
]);

function capabilityDeniedError(name) {
  const error = new Error(`Trusted adapter denied ambient capability: ${name}`);
  error.code = "TRUSTED_ADAPTER_CAPABILITY_DENIED";
  error.capability = name;
  return error;
}

function deniedCapability(name) {
  return () => {
    throw capabilityDeniedError(name);
  };
}

function installDeniedValue(name, capability) {
  const denied = deniedCapability(capability);
  Object.defineProperty(globalThis, name, {
    configurable: false,
    enumerable: false,
    get: () => denied,
    set: denied,
  });
}

function installDeniedAccess(name, capability) {
  const denied = deniedCapability(capability);
  Object.defineProperty(globalThis, name, {
    configurable: false,
    enumerable: false,
    get: denied,
    set: denied,
  });
}

export function auditTrustedAdapterImplementation(implementation) {
  const source = String(implementation || "");
  const deniedCapabilities = CAPABILITY_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
    ({ capability }) => capability
  );
  return {
    ok: deniedCapabilities.length === 0,
    denied_capabilities: deniedCapabilities,
  };
}

export function installDeniedAmbientCapabilities() {
  const OriginalDate = Date;
  class DeniedAmbientDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        throw capabilityDeniedError("clock_access");
      }
      super(...args);
    }

    static now() {
      throw capabilityDeniedError("clock_access");
    }
  }

  Object.defineProperty(globalThis, "Date", {
    configurable: false,
    enumerable: false,
    value: DeniedAmbientDate,
    writable: false,
  });
  Object.defineProperty(Math, "random", {
    configurable: false,
    enumerable: false,
    value: deniedCapability("randomness_access"),
    writable: false,
  });
  Object.defineProperty(globalThis, "Math", {
    configurable: false,
    enumerable: false,
    value: Math,
    writable: false,
  });

  installDeniedValue("fetch", "network_access");
  installDeniedValue("WebSocket", "network_access");
  installDeniedValue("EventSource", "network_access");
  installDeniedValue("XMLHttpRequest", "network_access");
  installDeniedValue("setImmediate", "clock_access");
  installDeniedValue("setInterval", "clock_access");
  installDeniedValue("setTimeout", "clock_access");
  installDeniedAccess("crypto", "randomness_access");
  installDeniedAccess("performance", "clock_access");
  installDeniedAccess("process", "environment_access");
}
