import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { gql, useQuery } from '@apollo/client';

/** number of component pairs requested per bulk page */
export const COMPARE_PAGE_SIZE = 25;

export type ComponentComparePair = {
  baseId: string;
  compareId: string;
};

/** shape of a single bulk `compareComponents` result (mirrors the per-component `compareComponent` query) */
export type CompareComponentData = {
  id: string;
  baseId: string;
  compareId: string;
  code: Array<{
    status?: string;
    fileName: string;
    diffOutput?: string;
    baseContent?: string;
    compareContent?: string;
  }>;
  aspects: Array<{ fieldName: string; diffOutput?: string }>;
  tests?: Array<{
    status?: string;
    fileName: string;
    diffOutput?: string;
    baseContent?: string;
    compareContent?: string;
  }>;
};

type CompareComponentsQueryResult = {
  getHost: { id: string; compareComponents: Array<CompareComponentData | null> } | null;
};

export const QUERY_COMPARE_COMPONENTS = gql`
  query CompareComponents($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int, $host: String) {
    getHost(id: $host) {
      id
      compareComponents(pairs: $pairs, offset: $offset, limit: $limit) {
        id
        baseId
        compareId
        code {
          status
          fileName
          diffOutput
          baseContent
          compareContent
        }
        aspects {
          fieldName
          diffOutput
        }
        tests {
          status
          fileName
          diffOutput
          baseContent
          compareContent
        }
      }
    }
  }
`;

export type CompareDataContextModel = {
  /**
   * look up bulk compare data for a component by its `compareId`.
   * `null` = the pair failed to compare, OR it was requested but paging finished/stopped early before
   * reaching it (so it will never resolve); `undefined` = the pair is not in this provider's list, or
   * its page has not loaded yet (check `loading` to disambiguate).
   */
  getData: (compareId: string) => CompareComponentData | null | undefined;
  /** true while pages are still loading; settles to false once every page loads or paging stops early */
  loading: boolean;
  /** number of pairs whose data has loaded so far */
  loadedCount: number;
};

const CompareDataContext = createContext<CompareDataContextModel | undefined>(undefined);

export function useCompareData(): CompareDataContextModel | undefined {
  return useContext(CompareDataContext);
}

/**
 * fires the bulk `compareComponents` query for the whole `pairs` list and exposes the results via context.
 * loads sequentially in pages of COMPARE_PAGE_SIZE — page 1 first, then fetchMore for each subsequent page
 * in the background until all pairs are covered. `pairs` is stabilized internally by content, so callers
 * do not have to memoize it. `host` targets a specific GraphQL host (e.g. the workspace or a scope);
 * omitting it resolves against the server default host.
 */
export function CompareDataProvider({
  pairs,
  host,
  children,
}: {
  pairs: ComponentComparePair[];
  /** GraphQL host id, e.g. "teambit.scope/scope" or "workspace" — must match the host of the compared models */
  host?: string;
  children: ReactNode;
}) {
  // stabilize by content: a new array reference with the same pairs must not restart the query.
  const pairsKey = JSON.stringify(pairs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePairs = useMemo(() => pairs, [pairsKey]);

  const skip = stablePairs.length === 0;

  const { data, loading, fetchMore } = useQuery<CompareComponentsQueryResult>(QUERY_COMPARE_COMPONENTS, {
    variables: { pairs: stablePairs, offset: 0, limit: COMPARE_PAGE_SIZE, host },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<CompareComponentData | null> = data?.getHost?.compareComponents ?? [];
  const allLoaded = skip || results.length >= stablePairs.length;

  // flips true once paging terminates early — a page returns empty/short or a fetch fails — so the loop
  // stops AND `loading` can settle even when fewer results than pairs came back. reactive (not a ref) so
  // the derived `loading` flag updates; without it `loading` could stay true forever. reset on pairs change.
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
    // guard the async terminations below to this page's pairs set: an in-flight fetchMore from a
    // previous pairsKey must not terminate the paging loop of a newer one (rapid target switches).
    const activeKey = pairsKey;
    const stillActive = () => pairsKeyRef.current === activeKey;
    fetchMore({
      variables: { pairs: stablePairs, offset: results.length, limit: COMPARE_PAGE_SIZE, host },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        const prevHost = prev.getHost;
        if (!fetchMoreResult || !prevHost) {
          // nothing came back, or the accumulated result has no host (getHost: null) to page against →
          // can't fetch further; terminate so the effect stops re-issuing fetchMore and loading settles.
          if (stillActive()) setTerminated(true);
          return prev;
        }
        const newItems = fetchMoreResult.getHost?.compareComponents ?? [];
        if (newItems.length === 0 && stillActive()) setTerminated(true);
        return {
          getHost: {
            ...prevHost,
            compareComponents: [...prevHost.compareComponents, ...newItems],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
      if (stillActive()) setTerminated(true);
    });
  }, [skip, loading, done, results.length, stablePairs, fetchMore, pairsKey, host]);

  const dataByCompareId = useMemo(() => {
    const map = new Map<string, CompareComponentData | null>();
    results.forEach((res, i) => {
      // prefer the result's own compareId; fall back to positional alignment for null (failed) slots.
      const key = res?.compareId ?? stablePairs[i]?.compareId;
      if (key) map.set(key, res ?? null);
    });
    return map;
  }, [results, stablePairs]);

  // every compareId this provider was asked to fetch — lets getData tell "requested but unresolved"
  // (paging stopped early) apart from "not in this provider's list" once paging is done.
  const requestedCompareIds = useMemo(() => new Set(stablePairs.map((p) => p.compareId)), [stablePairs]);

  const value = useMemo<CompareDataContextModel>(
    () => ({
      getData: (compareId: string) => {
        const found = dataByCompareId.get(compareId);
        if (found !== undefined) return found;
        // paging finished (fully, or stopped early on a short page / fetch error) but this requested
        // pair never produced an entry → surface it as failed (null) rather than "still loading"
        // (undefined), so consumers keyed on `getData(...) === undefined` don't spin forever.
        if (done && requestedCompareIds.has(compareId)) return null;
        return undefined;
      },
      loading: !done,
      loadedCount: results.length,
    }),
    [dataByCompareId, done, requestedCompareIds, results.length]
  );

  return <CompareDataContext.Provider value={value}>{children}</CompareDataContext.Provider>;
}
