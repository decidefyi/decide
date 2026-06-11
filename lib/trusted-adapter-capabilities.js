export const TRUSTED_ADAPTER_EXECUTION_ISOLATION = "worker_thread_one_shot_v1";
export const TRUSTED_ADAPTER_CAPABILITY_ENFORCEMENT = "ambient_capability_deny_v1";
export const TRUSTED_ADAPTER_TIMEOUT_MS = 250;
export const TRUSTED_ADAPTER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8,
  stackSizeMb: 2,
});

const CAPABILITY_PATTERNS = Object.freeze([
  {
    capability: "clock_access",
    pattern: /\bDate\b|\bperformance\b|\bsetInterval\b|\bsetTimeout\b/,
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

function deniedCapability(name) {
  return () => {
    throw new Error(`Trusted adapter denied ambient capability: ${name}`);
  };
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
        throw new Error("Trusted adapter denied ambient capability: clock_access");
      }
      super(...args);
    }

    static now() {
      throw new Error("Trusted adapter denied ambient capability: clock_access");
    }
  }

  globalThis.Date = DeniedAmbientDate;
  globalThis.fetch = deniedCapability("network_access");
  globalThis.WebSocket = deniedCapability("network_access");
  globalThis.EventSource = deniedCapability("network_access");
  globalThis.XMLHttpRequest = deniedCapability("network_access");
  Math.random = deniedCapability("randomness_access");
  globalThis.setInterval = deniedCapability("clock_access");
  globalThis.setTimeout = deniedCapability("clock_access");
}
