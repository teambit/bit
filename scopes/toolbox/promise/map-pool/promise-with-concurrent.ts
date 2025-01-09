/**
 * the reason for not using p-map package is because the stacktrace is lost.
 * see here: https://github.com/sindresorhus/p-map/issues/34
 */

import { chunk } from 'lodash';

export async function pMapPool<T, X>(
  iterable: T[],
  mapper: (item: T) => Promise<X>,
  {
    concurrency = Infinity,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onCompletedChunk = (_completed: number) => {},
  } = {}
) {
  if (concurrency === Infinity) {
    return Promise.all(iterable.map((item) => mapper(item)));
  }

  const results: X[] = [];
  const chunks = chunk(iterable, concurrency);
  // console.log("🚀 ~ chunks:", chunks)

  for (const currentChunk of chunks) {
    // console.log("🚀 ~ currentChunk:", currentChunk)
    const batchResults = await Promise.all(currentChunk.map((item) => mapper(item)));
    results.push(...batchResults);
    onCompletedChunk(results.length);
  }

  return results;
}
