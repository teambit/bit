import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useBulkPagedQuery } from '@teambit/ui-foundation.ui.hooks.use-bulk-paged-query';

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
  compareDataFor: (compareId: string) => CompareComponentData | null | undefined;
  /** true while pages are still loading; settles to false once every page loads or paging stops early */
  loading: boolean;
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
  const { lookupByCompareId, loading } = useBulkPagedQuery<CompareComponentData>({
    query: QUERY_COMPARE_COMPONENTS,
    resultField: 'compareComponents',
    pairs,
    pageSize: COMPARE_PAGE_SIZE,
    host,
  });

  const value = useMemo<CompareDataContextModel>(
    () => ({ compareDataFor: lookupByCompareId, loading }),
    [lookupByCompareId, loading]
  );

  return <CompareDataContext.Provider value={value}>{children}</CompareDataContext.Provider>;
}
