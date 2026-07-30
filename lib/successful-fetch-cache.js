function isSuccessfulRawFetch(value) {
  return Boolean(value?.ok && typeof value.text === "string" && value.text.trim());
}

export function createSuccessfulFetchCache({ isSuccess = isSuccessfulRawFetch } = {}) {
  if (typeof isSuccess !== "function") {
    throw new TypeError("isSuccess must be a function");
  }

  const entries = new Map();
  const stats = {
    hitCount: 0,
    missCount: 0,
    bypassCount: 0,
    networkLoadCount: 0,
    cachedSuccessCount: 0,
  };

  const retain = (key, value) => {
    if (!isSuccess(value)) return false;
    if (!entries.has(key)) {
      entries.set(key, value);
      stats.cachedSuccessCount += 1;
    }
    return true;
  };

  return {
    async load(key, loader, { bypass = false, retainSuccess = true } = {}) {
      if (typeof key !== "string" || !key) {
        throw new TypeError("cache key must be a non-empty string");
      }
      if (typeof loader !== "function") {
        throw new TypeError("loader must be a function");
      }

      if (bypass) {
        stats.bypassCount += 1;
        stats.networkLoadCount += 1;
        return loader();
      }

      if (entries.has(key)) {
        stats.hitCount += 1;
        return entries.get(key);
      }

      stats.missCount += 1;
      stats.networkLoadCount += 1;
      const value = await loader();
      if (retainSuccess) {
        retain(key, value);
      }
      return value;
    },

    retain(key, value) {
      if (typeof key !== "string" || !key) {
        throw new TypeError("cache key must be a non-empty string");
      }
      return retain(key, value);
    },

    snapshot() {
      return {
        ...stats,
        entryCount: entries.size,
      };
    },
  };
}
