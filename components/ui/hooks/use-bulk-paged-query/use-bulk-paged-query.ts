import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentNode } from 'graphql';
import { useQuery } from '@apollo/client';

/** a transient page-fetch error is retried this many times before the remaining pairs read as failed */
const MAX_PAGE_RETRIES = 2;

/** shared empty results ref so the derived memos aren't invalidated by a fresh `[]` every loading render */
const EMPTY_RESULTS: never[] = [];

export type BulkQueryPair = {
  baseId: string;
  compareId: string;
};

export type UseBulkPagedQueryOptions = {
  /**
   * a GraphQL query of the shape
   * `query(...) { getHost(id: $host) { id, <resultField>(pairs, offset, limit) { ... } } }`.
   * the selected slice is returned aligned to the requested `pairs` window.
   */
  query: DocumentNode;
  /** name of the array field on `getHost`, e.g. `compareComponents` or `apiDiffs`. */
  resultField: string;
  /** the full set of pairs to fetch — stabilized internally by content, so callers need not memoize it. */
  pairs: BulkQueryPair[];
  /** how many pairs to request per page. */
  pageSize: number;
  /** GraphQL host id, e.g. `teambit.scope/scope`. */
  host?: string;
  /** when true, no query fires (e.g. a mounted-but-hidden pane). */
  skip?: boolean;
};

export type UseBulkPagedQueryResult<TItem> = {
  /**
   * look up a result by its pair `compareId`.
   * `undefined` = its page hasn't loaded yet (or the pair isn't in this list); `null` = the pair failed
   * to compute, or paging finished/exhausted its retries before reaching it (so it will never resolve).
   * A transient fetch error keeps un-fetched pairs `undefined` (pending) until the retry either recovers
   * or is exhausted — they are never prematurely reported as failed.
   */
  lookupByCompareId: (compareId: string) => TItem | null | undefined;
  /** true while pages are still loading; settles to false once every page loads or paging stops. */
  loading: boolean;
  /** number of pairs whose data has loaded so far. */
  loadedCount: number;
};

/**
 * Sequentially pages a bulk GraphQL query (page 1, then `fetchMore` for each subsequent page) and
 * exposes the accumulated results keyed by `compareId` — the batched replacement for firing one query
 * per pair. A short/empty page ends paging (remaining pairs read as failed); a transient fetch error is
 * retried up to MAX_PAGE_RETRIES before giving up, so one dropped request doesn't permanently fail every
 * later pair. Shared by the component-compare and api-diff bulk providers.
 */
export function useBulkPagedQuery<TItem>({
  query,
  resultField,
  pairs,
  pageSize,
  host,
  skip: skipProp,
}: UseBulkPagedQueryOptions): UseBulkPagedQueryResult<TItem> {
  // stabilize by content: a new array reference with the same pairs must not restart the query.
  const pairsKey = JSON.stringify(pairs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePairs = useMemo(() => pairs, [pairsKey]);

  const skip = Boolean(skipProp) || stablePairs.length === 0;

  // raw `useQuery` (not the app's `useDataQuery` wrapper) on purpose: the wrapper pops an error toast on
  // failure, which would fire on every transient page error this hook is designed to silently retry.
  const { data, loading, fetchMore } = useQuery(query, {
    variables: { pairs: stablePairs, offset: 0, limit: pageSize, host },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<TItem | null> = data?.getHost?.[resultField] ?? EMPTY_RESULTS;
  const allLoaded = skip || results.length >= stablePairs.length;

  // legitimate end of paging: a page came back short/empty or the host was null, so the remaining
  // requested pairs genuinely have no data. reactive (not a ref) so the derived `loading` flag updates.
  const [stoppedShort, setStoppedShort] = useState(false);
  // consecutive transient page-fetch errors. a flaky page is retried up to MAX_PAGE_RETRIES before the
  // remaining pairs read as failed — so one dropped request no longer permanently fails every later pair.
  const [errorRetries, setErrorRetries] = useState(0);
  useEffect(() => {
    setStoppedShort(false);
    setErrorRetries(0);
  }, [pairsKey]);

  // the pairs set this hook is currently paging — a fetchMore started for an earlier set can still
  // resolve/reject after `pairs` changed, so its callbacks check this before terminating the new loop.
  // updated synchronously during render (not in an effect): passive effects flush after paint, so an
  // in-flight fetchMore from the previous session can resolve in the gap between commit and that flush;
  // if the ref lagged behind it would still pass `stillActive()` and mutate the new session's paging
  // state. Assigning here makes `pairsKeyRef.current` reflect the latest key the instant `pairs` change.
  const pairsKeyRef = useRef(pairsKey);
  pairsKeyRef.current = pairsKey;

  // every page loaded, paging stopped at a short page, or transient retries exhausted: no more requests.
  // NB: a transient error alone does NOT make us `done` — the loop retries it (up to MAX_PAGE_RETRIES),
  // and until then un-fetched pairs stay `undefined` (pending) rather than being reported as failed.
  const done = allLoaded || stoppedShort || errorRetries >= MAX_PAGE_RETRIES;

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skip || loading || done) return;
    // guard the async terminations below to this page's pairs set: an in-flight fetchMore from a
    // previous pairsKey must not terminate the paging loop of a newer one (rapid target switches).
    const activeKey = pairsKey;
    const stillActive = () => pairsKeyRef.current === activeKey;
    fetchMore({
      variables: { pairs: stablePairs, offset: results.length, limit: pageSize, host },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        const prevHost = prev.getHost;
        if (!fetchMoreResult || !prevHost) {
          // nothing came back, or the accumulated result has no host (getHost: null) to page against →
          // can't fetch further; stop so the effect stops re-issuing fetchMore and loading settles.
          if (stillActive()) setStoppedShort(true);
          return prev;
        }
        // a fetchMore issued for a previous pairs set can resolve after `pairs` changed; discard its
        // page rather than merging it into the current session's results (which would corrupt the new
        // set) or terminating the new loop.
        if (!stillActive()) return prev;
        const newItems = fetchMoreResult.getHost?.[resultField] ?? [];
        // a short page is the real end of the data; a full page means a successful fetch, so clear any
        // transient-error budget spent recovering earlier pages.
        if (newItems.length === 0) setStoppedShort(true);
        else setErrorRetries(0);
        return {
          getHost: {
            ...prevHost,
            [resultField]: [...prevHost[resultField], ...newItems],
          },
        };
      },
    }).catch(() => {
      // a transient fetch failure: bump the retry counter so the effect re-issues this page (up to
      // MAX_PAGE_RETRIES) instead of permanently failing every not-yet-fetched pair.
      if (stillActive()) setErrorRetries((n) => n + 1);
    });
  }, [
    skip,
    loading,
    done,
    results.length,
    stablePairs,
    fetchMore,
    pairsKey,
    host,
    pageSize,
    resultField,
    errorRetries,
  ]);

  const dataByCompareId = useMemo(() => {
    // results are returned aligned to the requested slice and concatenated in order, so position `i`
    // corresponds to `stablePairs[i]`. key by the requested pair's compareId — the alignment guarantee
    // makes positional keying correct without the hook needing to know each item's shape.
    const map = new Map<string, TItem | null>();
    results.forEach((res, i) => {
      const key = stablePairs[i]?.compareId;
      if (key) map.set(key, res ?? null);
    });
    return map;
  }, [results, stablePairs]);

  // every compareId this hook was asked to fetch — lets lookupByCompareId tell "requested but unresolved"
  // (paging stopped/exhausted) apart from "not in this list" once paging is done.
  const requestedCompareIds = useMemo(() => new Set(stablePairs.map((p) => p.compareId)), [stablePairs]);

  return useMemo<UseBulkPagedQueryResult<TItem>>(
    () => ({
      lookupByCompareId: (compareId: string) => {
        const found = dataByCompareId.get(compareId);
        if (found !== undefined) return found;
        // paging finished (fully, on a short page / null host, or after exhausting transient retries)
        // but this requested pair never produced an entry → surface it as failed (null) rather than
        // "still loading" (undefined). while a transient error is still being retried, `done` is false,
        // so un-fetched pairs stay `undefined` (pending) and are not prematurely reported as failed.
        if (done && requestedCompareIds.has(compareId)) return null;
        return undefined;
      },
      loading: !done,
      loadedCount: results.length,
    }),
    [dataByCompareId, done, requestedCompareIds, results.length]
  );
}
