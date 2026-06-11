import { Worker } from "node:worker_threads";

import {
  TRUSTED_ADAPTER_RESOURCE_LIMITS,
  TRUSTED_ADAPTER_TIMEOUT_MS,
} from "./trusted-adapter-capabilities.js";

export function executeTrustedAdapterIsolated({
  adapterId,
  version,
  input,
  timeoutMs = TRUSTED_ADAPTER_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(new URL("./trusted-adapter-worker.js", import.meta.url), {
      workerData: { adapterId, version, input },
      env: {},
      resourceLimits: TRUSTED_ADAPTER_RESOURCE_LIMITS,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: "TRUSTED_ADAPTER_EXECUTION_TIMEOUT",
        message: "Trusted adapter execution exceeded its registered hard timeout.",
      });
    }, timeoutMs);

    worker.once("message", finish);
    worker.once("error", () => {
      finish({
        ok: false,
        error: "TRUSTED_ADAPTER_EXECUTION_FAILED",
        message: "Trusted adapter isolated runtime failed.",
      });
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish({
          ok: false,
          error: "TRUSTED_ADAPTER_EXECUTION_FAILED",
          message: "Trusted adapter isolated runtime exited unexpectedly.",
        });
      }
    });
  });
}
