import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { gql, useQuery } from '@apollo/client';
import type { APIDiffResult } from './api-diff-model';
import { API_DIFF_RESULT_FIELDS } from './api-diff-model';

/** number of component pairs requested per bulk api-diff page */
export const API_DIFF_PAGE_SIZE = 25;

export type ApiDiffPair = {
  baseId: string;
  compareId: string;
};

type ApiDiffsQueryResult = {
  getHost: { id: string; apiDiffs: Array<APIDiffResult | null> } | null;
};

export const QUERY_API_DIFFS = gql`
  query ApiDiffs($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int, $host: String) {
    getHost(id: $host) {
      id
      apiDiffs(pairs: $pairs, offset: $offset, limit: $limit) {
        ${API_DIFF_RESULT_FIELDS}
      }
    }
  }
`;

export type ApiDiffDataContextModel = {
  /**
   * look up bulk api-diff data for a component pair by its `compareId`.
   * `null` = the pair's diff could not be computed, OR it was requested but paging finished/stopped
   * early before reaching it (so it will never resolve); `undefined` = the pair is not in this
   * provider's list, or its page has not loaded yet (check `loading` to disambiguate).
   */
  getApiDiff: (compareId: string) => APIDiffResult | null | undefined;
  /** true while pages are still loading; settles to false once every page loads or paging stops early */
  loading: boolean;
  /** number of pairs whose data has loaded so far */
  loadedCount: number;
};

const ApiDiffDataContext = createContext<ApiDiffDataContextModel | undefined>(undefined);

export function useApiDiffData(): ApiDiffDataContextModel | undefined {
  return useContext(ApiDiffDataContext);
}

/**
 * fires the bulk `apiDiffs` query for the whole `pairs` list and exposes the results via context —
 * the batched replacement for one `apiDiff` query per component. loads sequentially in pages of
 * API_DIFF_PAGE_SIZE (page 1 first, then `fetchMore` for each subsequent page) so the API tab makes
 * ceil(pairs.length / API_DIFF_PAGE_SIZE) requests instead of N.
 *
 * gated by `active`: when the API view is not the active tab the query is skipped entirely, so the
 * mounted-but-hidden pane never touches the network until the user opens it. results stay cached
 * afterwards (both in Apollo and in the server-side `getAPIDiff` memo). `pairs` is stabilized
 * internally by content, so callers do not have to memoize it.
 */
export function ApiDiffDataProvider({
  pairs,
  active,
  host,
  children,
}: {
  pairs: ApiDiffPair[];
  active?: boolean;
  /** GraphQL host id, e.g. "teambit.scope/scope" */
  host?: string;
  children: ReactNode;
}) {
  // stabilize by content: a new array reference with the same pairs must not restart the query.
  const pairsKey = JSON.stringify(pairs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePairs = useMemo(() => pairs, [pairsKey]);

  // only fetch when the API view is active — otherwise the mounted-but-hidden pane fires the bulk query on load.
  const skip = !active || stablePairs.length === 0;

  const { data, loading, fetchMore } = useQuery<ApiDiffsQueryResult>(QUERY_API_DIFFS, {
    variables: { pairs: stablePairs, offset: 0, limit: API_DIFF_PAGE_SIZE, host },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<APIDiffResult | null> = data?.getHost?.apiDiffs ?? [];
  const allLoaded = skip || results.length >= stablePairs.length;

  // flips true once paging terminates early — a page returns empty/short, a fetch fails, or the host is
  // null — so the loop stops AND `loading` can settle even when fewer results than pairs came back.
  // reactive (not a ref) so the derived `loading` flag updates. reset on pairs change.
  const [terminated, setTerminated] = useState(false);
  useEffect(() => {
    setTerminated(false);
  }, [pairsKey]);

  // the pairs set this provider is currently paging — a fetchMore started for an earlier set can still
  // resolve/reject after `pairs` changed, so its callbacks check this before terminating the new loop.
  const pairsKeyRef = useRef(pairsKey);
  useEffect(() => {
    pairsKeyRef.current = pairsKey;
  }, [pairsKey]);

  // every page loaded, or paging stopped early: no further requests will be made.
  const done = allLoaded || terminated;

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skip || loading || done) return;
    // guard the async terminations to this page's pairs set: an in-flight fetchMore from a previous
    // pairsKey must not terminate the paging loop of a newer one.
    const activeKey = pairsKey;
    const stillActive = () => pairsKeyRef.current === activeKey;
    fetchMore({
      variables: { pairs: stablePairs, offset: results.length, limit: API_DIFF_PAGE_SIZE, host },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        const prevHost = prev.getHost;
        if (!fetchMoreResult || !prevHost) {
          // nothing came back, or the accumulated result has no host (getHost: null) to page against →
          // can't fetch further; terminate so the effect stops re-issuing fetchMore and loading settles.
          if (stillActive()) setTerminated(true);
          return prev;
        }
        // a fetchMore issued for a previous pairs set can resolve after `pairs` changed; discard its
        // page rather than merging it into the current session's results (which would corrupt the new
        // diff set) or terminating the new loop.
        if (!stillActive()) return prev;
        const newItems = fetchMoreResult.getHost?.apiDiffs ?? [];
        if (newItems.length === 0) setTerminated(true);
        return {
          getHost: {
            ...prevHost,
            apiDiffs: [...prevHost.apiDiffs, ...newItems],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
      if (stillActive()) setTerminated(true);
    });
  }, [skip, loading, done, results.length, stablePairs, fetchMore, host, pairsKey]);

  const dataByCompareId = useMemo(() => {
    // results are returned aligned to the requested slice and concatenated in order, so position
    // `i` corresponds to `stablePairs[i]` (APIDiffResult carries no id to key on directly).
    const map = new Map<string, APIDiffResult | null>();
    results.forEach((res, i) => {
      const key = stablePairs[i]?.compareId;
      if (key) map.set(key, res ?? null);
    });
    return map;
  }, [results, stablePairs]);

  // every compareId this provider was asked to fetch — lets getApiDiff tell "requested but unresolved"
  // (paging stopped early) apart from "not in this provider's list" once paging is done.
  const requestedCompareIds = useMemo(() => new Set(stablePairs.map((p) => p.compareId)), [stablePairs]);

  const value = useMemo<ApiDiffDataContextModel>(
    () => ({
      getApiDiff: (compareId: string) => {
        const found = dataByCompareId.get(compareId);
        if (found !== undefined) return found;
        // paging finished (fully, or stopped early on a short page / fetch error / null host) but this
        // requested pair never produced an entry → surface it as failed (null) rather than "still
        // loading" (undefined), so consumers keyed on `getApiDiff(...) === undefined` don't spin forever.
        if (done && requestedCompareIds.has(compareId)) return null;
        return undefined;
      },
      loading: !done,
      loadedCount: results.length,
    }),
    [dataByCompareId, done, requestedCompareIds, results.length]
  );

  return <ApiDiffDataContext.Provider value={value}>{children}</ApiDiffDataContext.Provider>;
}
