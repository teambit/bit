import { useContext, useEffect } from 'react';
import { gql, useQuery } from '@apollo/client';
import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';
import { isUnsupportedQueryError } from '@teambit/ui-foundation.ui.hooks.use-bulk-paged-query';
import type { APIDiffResult } from './api-diff-model';
import { UNSUPPORTED_API_DIFF } from './api-diff-model';

const API_DIFF_CHANGE_FIELDS = `
  status
  visibility
  exportName
  schemaType
  schemaTypeRaw
  impact
  baseSignature
  compareSignature
  changes {
    changeKind
    description
    impact
    from
    to
    signature
  }
`;

/**
 * GraphQL selection set for a single `APIDiffResult`. Shared by the per-component `apiDiff`
 * query (below) and the bulk `apiDiffs` query (`api-diff-data-context`) so the two never drift.
 */
export const API_DIFF_RESULT_FIELDS = `
  status
  base {
    available
    reason
  }
  compare {
    available
    reason
  }
  hasChanges
  impact
  internalImpact
  unresolvedExports
  added
  removed
  modified
  breaking
  nonBreaking
  patch
  publicChanges {
    ${API_DIFF_CHANGE_FIELDS}
  }
  internalChanges {
    ${API_DIFF_CHANGE_FIELDS}
  }
`;

export const API_DIFF_QUERY = gql`
  query ApiDiff($baseId: String!, $compareId: String!, $host: String) {
    getHost(id: $host) {
      id
      apiDiff(baseId: $baseId, compareId: $compareId) {
        ${API_DIFF_RESULT_FIELDS}
      }
    }
  }
`;

export type UseApiDiffOptions = {
  host?: string;
  skip?: boolean;
};

export type UseApiDiffResult = {
  /**
   * undefined while loading, null when the server could not compute the diff at all, and
   * `UNSUPPORTED_API_DIFF` when the server has no API diff support (see `unsupported`).
   */
  result: APIDiffResult | null | undefined;
  loading?: boolean;
  error?: string;
  /** the server's GraphQL schema has no API diff support, e.g. an older backend. */
  unsupported?: boolean;
};

export function useApiDiff(baseId?: string, compareId?: string, options?: UseApiDiffOptions): UseApiDiffResult {
  const skip = options?.skip || !baseId || !compareId || baseId === compareId;
  // raw `useQuery` rather than `useDataQuery`: that wrapper toasts every error, and a backend without API
  // diff support is an expected state shown inline, not an error to pop up. Other errors still toast.
  const { data, loading, error } = useQuery<{ getHost: { apiDiff: APIDiffResult | null } }>(API_DIFF_QUERY, {
    variables: { baseId: baseId || '', compareId: compareId || '', host: options?.host },
    skip,
  });
  const unsupported = !skip && isUnsupportedQueryError(error);

  const notifications = useContext(NotificationContext);
  useEffect(() => {
    if (error && !unsupported) notifications?.error(error.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, unsupported]);

  if (unsupported) return { result: UNSUPPORTED_API_DIFF, loading: false, unsupported: true };

  return {
    result: data ? (data.getHost?.apiDiff ?? null) : undefined,
    loading,
    error: error?.message,
  };
}
