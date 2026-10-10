import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentNode } from 'graphql';
import { useApolloClient, useQuery } from '@apollo/client';

/** a transient page-fetch error is retried this many times before the remaining pairs read as failed */
const MAX_PAGE_RETRIES = 2;

/** shared empty results ref so the derived memos aren't invalidated by a fresh `[]` every loading render */
const EMPTY_RESULTS: never[] = [];

/** how many single-pair requests the compatibility path keeps in flight at once */
const FALLBACK_CONCURRENCY = 8;

/**
 * Hosts (keyed by `host|resultField`) whose schema has no bulk field, remembered for the page's
 * lifetime so later mounts skip straight to the per-pair path instead of each paying for a rejected
 * bulk request first. Not persisted: a host that gains the field only has to be re-detected on reload.
 */
const bulkUnsupportedHosts = new Set<string>();

/**
 * Did this query fail because the host's schema has no such field, as opposed to failing transiently?
 * A missing field is a *validation* error, so the server rejects the document before executing it and
 * retrying can never help — the only useful response is to stop asking.
 */
function isFieldUnsupported(
  error: { graphQLErrors?: ReadonlyArray<{ message?: string }> } | undefined,
  resultField: string
): boolean {
  return Boolean(
    error?.graphQLErrors?.some((gqlError) => gqlError?.message?.includes(`Cannot query field "${resultField}"`))
  );
}

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
  /**
   * A single-pair query of the shape
   * `query(...) { getHost(id: $host) { id, <fallbackResultField>(baseId, compareId) { ... } } }`,
   * used when the host's schema has no bulk field.
   *
   * bit.cloud implements the bulk resolvers but serves them through a bit version whose schema
   * predates the bulk fields, so the field is unreachable there while the singular one works. Without
   * this the whole compare surface renders empty against that host. It costs one request per pair —
   * exactly what the bulk field exists to avoid — so it is strictly a compatibility path, taken only
   * after the host has rejected the bulk field, and it retires itself the moment the host catches up.
   */
  fallbackQuery?: DocumentNode;
  /** name of the single-pair field on `getHost`, e.g. `compareComponent`. */
  fallbackResultField?: string;
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
  fallbackQuery,
  fallbackResultField,
}: UseBulkPagedQueryOptions): UseBulkPagedQueryResult<TItem> {
  // stabilize by content: a new array reference with the same pairs must not restart the query.
  // memoized on the reference so the O(n) stringify doesn't re-run on every provider re-render
  // (which happens per page arrival) — only when the caller actually hands us a new array.
  const pairsKey = useMemo(() => JSON.stringify(pairs), [pairs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePairs = useMemo(() => pairs, [pairsKey]);

  const skip = Boolean(skipProp) || stablePairs.length === 0;

  // the full paging identity: everything that makes this a distinct paging session. `pairsKey` alone
  // isn't enough — a host switch (or skip toggle) with an identical pairs list must also start a
  // clean session rather than inherit the previous session's termination state.
  const sessionKey = `${host ?? ''}|${resultField}|${pageSize}|${pairsKey}`;

  const capabilityKey = `${host ?? ''}|${resultField}`;
  const canFallback = Boolean(fallbackQuery && fallbackResultField);
  const [bulkUnsupported, setBulkUnsupported] = useState(() => bulkUnsupportedHosts.has(capabilityKey));
  useEffect(() => setBulkUnsupported(bulkUnsupportedHosts.has(capabilityKey)), [capabilityKey]);

  const onFallback = canFallback && bulkUnsupported;
  // once the host has rejected the bulk field there is nothing to retry — stop issuing it entirely
  const skipBulk = skip || onFallback;

  // raw `useQuery` (not the app's `useDataQuery` wrapper) on purpose: the wrapper pops an error toast on
  // failure, which would fire on every transient page error this hook is designed to silently retry.
  const { data, loading, error, fetchMore } = useQuery(query, {
    variables: { pairs: stablePairs, offset: 0, limit: pageSize, host },
    skip: skipBulk,
    notifyOnNetworkStatusChange: true,
    // the workspace UI's Apollo client defaults watchQuery to `network-only` (live workspace data must
    // not go stale), which would replay page 1 AND the whole fetchMore chain on every remount of the
    // provider (tab navigation, parent remounts) — for a large lane that's the full bulk payload again.
    // this query is safe to cache: the pairs pin exact snap hashes, so a cached result can never be
    // stale. `nextFetchPolicy` keeps it cache-first after the first resolution too.
    fetchPolicy: 'cache-first',
    nextFetchPolicy: 'cache-first',
  });

  useEffect(() => {
    if (!canFallback || !isFieldUnsupported(error, resultField)) return;
    bulkUnsupportedHosts.add(capabilityKey);
    setBulkUnsupported(true);
  }, [error, canFallback, resultField, capabilityKey]);

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
  }, [sessionKey, skip]);

  // the session this hook is currently paging — a fetchMore started for an earlier session can still
  // resolve/reject after the inputs changed, so its callbacks check this before terminating the new
  // loop. updated synchronously during render (not in an effect): passive effects flush after paint,
  // so an in-flight fetchMore from the previous session can resolve in the gap between commit and that
  // flush; if the ref lagged behind it would still pass `stillActive()` and mutate the new session's
  // paging state. Assigning here makes the ref reflect the latest session the instant inputs change.
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  // Compatibility path: one request per pair, a few at a time, accumulated as they land so the surface
  // fills in progressively rather than waiting for the slowest pair.
  const client = useApolloClient();
  const [fallbackData, setFallbackData] = useState<Map<string, TItem | null>>(() => new Map());
  const [fallbackDone, setFallbackDone] = useState(false);

  useEffect(() => {
    if (!onFallback || skip) return undefined;
    let cancelled = false;
    setFallbackData(new Map());
    setFallbackDone(false);

    const remaining = [...stablePairs];
    const collected = new Map<string, TItem | null>();

    const worker = async () => {
      for (;;) {
        const pair = remaining.shift();
        if (!pair || cancelled) return;
        let item: TItem | null = null;
        try {
          const response = await client.query({
            query: fallbackQuery as DocumentNode,
            variables: { baseId: pair.baseId, compareId: pair.compareId, host },
            fetchPolicy: 'cache-first',
          });
          item = (response?.data as any)?.getHost?.[fallbackResultField as string] ?? null;
        } catch {
          // a pair that cannot be compared is reported as failed, exactly as the bulk path reports it
          item = null;
        }
        if (cancelled) return;
        collected.set(pair.compareId, item);
        setFallbackData(new Map(collected));
      }
    };

    void Promise.all(Array.from({ length: Math.min(FALLBACK_CONCURRENCY, remaining.length) }, worker)).then(() => {
      if (!cancelled) setFallbackDone(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFallback, skip, sessionKey, client, fallbackQuery, fallbackResultField, host]);

  // every page loaded, paging stopped at a short page, or transient retries exhausted: no more requests.
  // NB: a transient error alone does NOT make us `done` — the loop retries it (up to MAX_PAGE_RETRIES),
  // and until then un-fetched pairs stay `undefined` (pending) rather than being reported as failed.
  const done = onFallback ? fallbackDone : allLoaded || stoppedShort || errorRetries >= MAX_PAGE_RETRIES;

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skipBulk || loading || done) return;
    // guard the async terminations below to this session: an in-flight fetchMore from a previous
    // session must not terminate the paging loop of a newer one (rapid target switches).
    const activeKey = sessionKey;
    const stillActive = () => sessionKeyRef.current === activeKey;
    fetchMore({
      variables: { pairs: stablePairs, offset: results.length, limit: pageSize, host },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        // a fetchMore issued for a previous session can resolve after the inputs changed; discard its
        // page rather than merging it into the current session's results (which would corrupt the new
        // set) or terminating the new loop.
        if (!stillActive()) return prev;
        const prevHost = prev?.getHost;
        const nextHost = fetchMoreResult?.getHost;
        if (!nextHost) {
          // nothing came back, or the host resolved to null → can't page further; stop so the effect
          // stops re-issuing fetchMore and loading settles.
          setStoppedShort(true);
          return prev;
        }
        const newItems = nextHost[resultField] ?? [];
        // a short page is the real end of the data; a full page means a successful fetch, so clear any
        // transient-error budget spent recovering earlier pages.
        if (newItems.length === 0) setStoppedShort(true);
        else setErrorRetries(0);
        // recover when the ACCUMULATED result has no host (e.g. the initial page transiently returned
        // `getHost: null`) but this page does: initialize from the fresh response instead of discarding
        // a perfectly good page and terminating — which made a one-off transient failure permanent.
        if (!prevHost) return { getHost: nextHost };
        return {
          getHost: {
            ...prevHost,
            [resultField]: [...(prevHost[resultField] ?? []), ...newItems],
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
    sessionKey,
    host,
    pageSize,
    resultField,
    errorRetries,
  ]);

  const dataByCompareId = useMemo(() => {
    if (onFallback) return fallbackData;
    // results are returned aligned to the requested slice and concatenated in order, so position `i`
    // corresponds to `stablePairs[i]`. key by the requested pair's compareId — the alignment guarantee
    // makes positional keying correct without the hook needing to know each item's shape.
    const map = new Map<string, TItem | null>();
    results.forEach((res, i) => {
      const key = stablePairs[i]?.compareId;
      if (key) map.set(key, res ?? null);
    });
    return map;
  }, [results, stablePairs, onFallback, fallbackData]);

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
      loadedCount: onFallback ? fallbackData.size : results.length,
    }),
    [dataByCompareId, done, requestedCompareIds, results.length, onFallback, fallbackData]
  );
}
