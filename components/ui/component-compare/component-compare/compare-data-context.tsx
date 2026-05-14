import React, { createContext, useContext, useEffect, useMemo } from 'react';
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
  /** look up bulk compare data for a component by its `compareId`; `null` = failed to compare, `undefined` = not loaded yet */
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
 * in the background until all pairs are covered.
 */
export function CompareDataProvider({ pairs, children }: { pairs: ComponentComparePair[]; children: ReactNode }) {
  const skip = pairs.length === 0;

  const { data, loading, fetchMore } = useQuery(QUERY_COMPARE_COMPONENTS, {
    variables: { pairs, offset: 0, limit: COMPARE_PAGE_SIZE },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<CompareComponentData | null> = data?.getHost?.compareComponents ?? [];
  const allLoaded = skip || results.length >= pairs.length;

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skip || loading || allLoaded) return;
    fetchMore({
      variables: { pairs, offset: results.length, limit: COMPARE_PAGE_SIZE },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        if (!fetchMoreResult) return prev;
        return {
          getHost: {
            ...prev.getHost,
            compareComponents: [
              ...(prev.getHost?.compareComponents ?? []),
              ...(fetchMoreResult.getHost?.compareComponents ?? []),
            ],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
    });
  }, [skip, loading, allLoaded, results.length, pairs, fetchMore]);

  const dataByCompareId = useMemo(() => {
    const map = new Map<string, CompareComponentData | null>();
    results.forEach((res, i) => {
      const pair = pairs[i];
      if (pair) map.set(pair.compareId, res ?? null);
    });
    return map;
  }, [results, pairs]);

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
