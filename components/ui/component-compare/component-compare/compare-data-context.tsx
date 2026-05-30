import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
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
  query CompareComponents($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int) {
    getHost {
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
   * `null` = the pair failed to compare; `undefined` = the pair is not in this provider's
   * list, or its page has not loaded yet (check `loading` to disambiguate).
   */
  getData: (compareId: string) => CompareComponentData | null | undefined;
  /** true until every page has loaded */
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
 * do not have to memoize it.
 */
export function CompareDataProvider({ pairs, children }: { pairs: ComponentComparePair[]; children: ReactNode }) {
  // stabilize by content: a new array reference with the same pairs must not restart the query.
  const pairsKey = JSON.stringify(pairs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePairs = useMemo(() => pairs, [pairsKey]);

  const skip = stablePairs.length === 0;

  const { data, loading, fetchMore } = useQuery<CompareComponentsQueryResult>(QUERY_COMPARE_COMPONENTS, {
    variables: { pairs: stablePairs, offset: 0, limit: COMPARE_PAGE_SIZE },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<CompareComponentData | null> = data?.getHost?.compareComponents ?? [];
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
      variables: { pairs: stablePairs, offset: results.length, limit: COMPARE_PAGE_SIZE },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        const prevHost = prev.getHost;
        if (!fetchMoreResult || !prevHost) return prev;
        const newItems = fetchMoreResult.getHost?.compareComponents ?? [];
        if (newItems.length === 0) hasMoreRef.current = false;
        return {
          getHost: {
            ...prevHost,
            compareComponents: [...prevHost.compareComponents, ...newItems],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
      hasMoreRef.current = false;
    });
  }, [skip, loading, allLoaded, results.length, stablePairs, fetchMore]);

  const dataByCompareId = useMemo(() => {
    const map = new Map<string, CompareComponentData | null>();
    results.forEach((res, i) => {
      // prefer the result's own compareId; fall back to positional alignment for null (failed) slots.
      const key = res?.compareId ?? stablePairs[i]?.compareId;
      if (key) map.set(key, res ?? null);
    });
    return map;
  }, [results, stablePairs]);

  const value = useMemo<CompareDataContextModel>(
    () => ({
      getData: (compareId: string) => dataByCompareId.get(compareId),
      loading: !allLoaded,
      loadedCount: results.length,
    }),
    [dataByCompareId, allLoaded, results.length]
  );

  return <CompareDataContext.Provider value={value}>{children}</CompareDataContext.Provider>;
}
