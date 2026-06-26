import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
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
   * `null` = the pair's diff could not be computed; `undefined` = the pair is not in this
   * provider's list, or its page has not loaded yet (check `loading` to disambiguate).
   */
  getApiDiff: (compareId: string) => APIDiffResult | null | undefined;
  /** true until every page has loaded */
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

  // flips off once a page returns empty (or a page fails) — guarantees the paging loop terminates
  // even if the server returns fewer results than requested. reset when the pairs list changes.
  const hasMoreRef = useRef(true);
  useEffect(() => {
    hasMoreRef.current = true;
  }, [pairsKey]);

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skip || loading || allLoaded || !hasMoreRef.current) return;
    fetchMore({
      variables: { pairs: stablePairs, offset: results.length, limit: API_DIFF_PAGE_SIZE, host },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        const prevHost = prev.getHost;
        if (!fetchMoreResult || !prevHost) return prev;
        const newItems = fetchMoreResult.getHost?.apiDiffs ?? [];
        if (newItems.length === 0) hasMoreRef.current = false;
        return {
          getHost: {
            ...prevHost,
            apiDiffs: [...prevHost.apiDiffs, ...newItems],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
      hasMoreRef.current = false;
    });
  }, [skip, loading, allLoaded, results.length, stablePairs, fetchMore, host]);

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

  const value = useMemo<ApiDiffDataContextModel>(
    () => ({
      getApiDiff: (compareId: string) => dataByCompareId.get(compareId),
      loading: !allLoaded,
      loadedCount: results.length,
    }),
    [dataByCompareId, allLoaded, results.length]
  );

  return <ApiDiffDataContext.Provider value={value}>{children}</ApiDiffDataContext.Provider>;
}
