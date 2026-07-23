import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useBulkPagedQuery } from '@teambit/ui-foundation.ui.hooks.use-bulk-paged-query';
import type { APIDiffResult } from './api-diff-model';
import { API_DIFF_RESULT_FIELDS } from './use-api-diff';

/** number of component pairs requested per bulk api-diff page */
export const API_DIFF_PAGE_SIZE = 25;

export type ApiDiffPair = {
  baseId: string;
  compareId: string;
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
  apiDiffFor: (compareId: string) => APIDiffResult | null | undefined;
  /** true while pages are still loading; settles to false once every page loads or paging stops early */
  loading: boolean;
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
  const { lookupByCompareId, loading } = useBulkPagedQuery<APIDiffResult>({
    query: QUERY_API_DIFFS,
    resultField: 'apiDiffs',
    pairs,
    pageSize: API_DIFF_PAGE_SIZE,
    host,
    // only fetch when the API view is active — otherwise the mounted-but-hidden pane fires the query on load.
    skip: !active,
  });

  const value = useMemo<ApiDiffDataContextModel>(
    () => ({ apiDiffFor: lookupByCompareId, loading }),
    [lookupByCompareId, loading]
  );

  return <ApiDiffDataContext.Provider value={value}>{children}</ApiDiffDataContext.Provider>;
}
