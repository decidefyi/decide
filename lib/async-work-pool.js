export async function mapWithConcurrency(items, concurrency, mapper, options = {}) {
  const values = Array.from(items || []);
  const parsedConcurrency = Number(concurrency);
  if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }
  if (typeof mapper !== "function") {
    throw new TypeError("mapper must be a function");
  }

  const afterTask = options.afterTask;
  if (afterTask !== undefined && typeof afterTask !== "function") {
    throw new TypeError("afterTask must be a function when provided");
  }
  if (values.length === 0) return [];

  const results = new Array(values.length);
  const workerCount = Math.min(parsedConcurrency, values.length);
  let nextIndex = 0;
  let failed = false;
  let firstError;

  async function runWorker(workerIndex) {
    while (!failed) {
      const index = nextIndex;
      if (index >= values.length) return;
      nextIndex += 1;

      try {
        results[index] = await mapper(values[index], index, workerIndex);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }

      if (afterTask) {
        try {
          await afterTask({ item: values[index], index, workerIndex });
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, index) => runWorker(index)));
  if (failed) throw firstError;
  return results;
}
