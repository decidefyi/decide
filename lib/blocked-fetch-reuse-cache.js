function isBlockedFetchFailure(value) {
  return Boolean(
    value &&
    !value.text &&
    typeof value.error === "string" &&
    value.error.trim()
  );
}

export function createBlockedFetchReuseCache({ isReusableFailure = isBlockedFetchFailure } = {}) {
  if (typeof isReusableFailure !== "function") {
    throw new TypeError("isReusableFailure must be a function");
  }

  const entries = new Map();
  const stats = {
    hitCount: 0,
    missCount: 0,
    retainedFailureCount: 0,
  };

  const validateKey = (key) => {
    if (typeof key !== "string" || !key) {
      throw new TypeError("cache key must be a non-empty string");
    }
  };

  return {
    has(key) {
      validateKey(key);
      return entries.has(key);
    },

    get(key) {
      validateKey(key);
      if (!entries.has(key)) {
        stats.missCount += 1;
        return undefined;
      }
      stats.hitCount += 1;
      return entries.get(key);
    },

    retain(key, value) {
      validateKey(key);
      if (!isReusableFailure(value)) return false;
      if (!entries.has(key)) {
        entries.set(key, value);
        stats.retainedFailureCount += 1;
      }
      return true;
    },

    snapshot() {
      return {
        ...stats,
        entryCount: entries.size,
      };
    },
  };
}
