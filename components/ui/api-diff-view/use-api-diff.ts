import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import type { APIDiffResult } from './api-diff-model';

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
  /** undefined while loading, null when the server could not compute the diff at all */
  result: APIDiffResult | null | undefined;
  loading?: boolean;
  error?: string;
};

export function useApiDiff(baseId?: string, compareId?: string, options?: UseApiDiffOptions): UseApiDiffResult {
  const skip = options?.skip || !baseId || !compareId || baseId === compareId;
  const { data, loading, error } = useDataQuery<{ getHost: { apiDiff: APIDiffResult | null } }>(API_DIFF_QUERY, {
    variables: { baseId: baseId || '', compareId: compareId || '', host: options?.host },
    skip,
  });

  return {
    result: data ? (data.getHost?.apiDiff ?? null) : undefined,
    loading,
    error: error?.message,
  };
}
