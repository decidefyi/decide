import { parentPort, workerData } from "node:worker_threads";

import { installDeniedAmbientCapabilities } from "./trusted-adapter-capabilities.js";
import { getRegisteredTrustedAdapter } from "./trusted-adapter-definitions.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}

const entry = getRegisteredTrustedAdapter(workerData?.adapterId, workerData?.version);
if (!entry) {
  parentPort?.postMessage({
    ok: false,
    error: "TRUSTED_ADAPTER_NOT_REGISTERED",
    message: "The requested adapter id and version are not registered in the isolated runtime.",
  });
} else {
  installDeniedAmbientCapabilities();
  try {
    const input = deepFreeze(workerData?.input);
    const facts = await entry.execute(input);
    parentPort?.postMessage({ ok: true, facts });
  } catch {
    parentPort?.postMessage({
      ok: false,
      error: "TRUSTED_ADAPTER_EXECUTION_FAILED",
      message: "Trusted adapter execution failed inside the isolated runtime.",
    });
  }
}
