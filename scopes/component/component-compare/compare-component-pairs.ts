import pMap from 'p-map';

export type ComponentComparePair = {
  baseId: string;
  compareId: string;
};

export type CompareComponentPairsOptions = {
  /** index into `pairs` to start from (default 0) */
  offset?: number;
  /** number of pairs to process from `offset` (default: the rest of the list) */
  limit?: number;
  /** max number of pairs compared in parallel */
  concurrency: number;
  /** invoked when a single pair's comparison throws; that pair's slot becomes null */
  onError?: (pair: ComponentComparePair, err: unknown) => void;
};

/**
 * compares a paginated slice of component pairs with bounded concurrency.
 * a pair whose `compareFn` throws becomes `null` in the result instead of failing the whole batch.
 * the returned array is aligned to the requested slice (`pairs[offset .. offset + limit]`).
 */
export async function compareComponentPairs<T>(
  pairs: ComponentComparePair[],
  compareFn: (baseId: string, compareId: string) => Promise<T>,
  options: CompareComponentPairsOptions
): Promise<Array<T | null>> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? pairs.length - offset;
  const slice = pairs.slice(offset, offset + limit);

  return pMap(
    slice,
    async (pair): Promise<T | null> => {
      try {
        return await compareFn(pair.baseId, pair.compareId);
      } catch (err) {
        options.onError?.(pair, err);
        return null;
      }
    },
    { concurrency: options.concurrency }
  );
}
