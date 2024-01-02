/**
 * the reason for not using p-map package is because the stacktrace is lost.
 * see here: https://github.com/sindresorhus/p-map/issues/34
 */

export async function pMapPool<T, X>(iterable: T[], mapper: (item: T) => Promise<X>, { concurrency = Infinity } = {}) {
  const results: X[] = [];
  const iterator = iterable[Symbol.iterator]();
  let completed = false;
  const runBatch = async () => {
    const items: T[] = [];
    for (let i = 0; i < concurrency; i += 1) {
      const iterableResult = iterator.next();
      if (iterableResult.done) {
        completed = true;
        break;
      }
      items.push(iterableResult.value);
    }
    const batchResults = await Promise.all(items.map((item) => mapper(item)));
    results.push(...batchResults);
    if (!completed) await runBatch();
  };
  await runBatch();

  return results;
}
