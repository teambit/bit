import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import type {
  ImpactLevel,
  APIDiffComputeStatus,
  SchemaUnavailableReason,
} from '@teambit/semantics.entities.semantic-schema-diff';

export type { ImpactLevel, APIDiffComputeStatus, SchemaUnavailableReason };

/**
 * UI-facing shapes of the API diff GraphQL payload. These mirror the server entity
 * (`@teambit/semantics.entities.semantic-schema-diff`) but only carry the fields the
 * query below selects. All compare UIs must import these from here — do not redeclare.
 */
export type APIDiffDetail = {
  changeKind: string;
  description: string;
  impact: ImpactLevel;
  from?: string;
  to?: string;
};

export type APIDiffChange = {
  status: 'ADDED' | 'REMOVED' | 'MODIFIED';
  visibility: 'public' | 'internal';
  exportName: string;
  schemaType: string;
  schemaTypeRaw: string;
  impact: ImpactLevel;
  baseSignature?: string;
  compareSignature?: string;
  changes?: APIDiffDetail[];
};

export type SchemaSideAvailability = {
  available: boolean;
  reason?: SchemaUnavailableReason;
};

export type APIDiffResult = {
  status: APIDiffComputeStatus;
  base: SchemaSideAvailability;
  compare: SchemaSideAvailability;
  hasChanges: boolean;
  impact: ImpactLevel;
  internalImpact: ImpactLevel;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};

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
  }
`;

export const API_DIFF_QUERY = gql`
  query ApiDiff($baseId: String!, $compareId: String!, $host: String) {
    getHost(id: $host) {
      id
      apiDiff(baseId: $baseId, compareId: $compareId) {
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

/** semver-flavored display label for an impact level */
export function impactLabel(impact: ImpactLevel | string): string {
  switch (impact) {
    case 'BREAKING':
      return 'MAJOR';
    case 'NON_BREAKING':
      return 'MINOR';
    default:
      return 'PATCH';
  }
}

const REASON_TEXT: Record<SchemaUnavailableReason, string> = {
  NOT_BUILT: 'was built before API extraction — no API snapshot exists',
  NO_EXTRACTOR: "env doesn't provide a schema extractor",
  DISABLED: 'has schema extraction disabled',
  FAILED: 'API data could not be loaded',
};

/**
 * human-readable explanation of why the diff could not be computed.
 * returns undefined when the diff was computed.
 */
export function unavailableText(result: APIDiffResult, baseVersion?: string, compareVersion?: string): string | undefined {
  const ver = (v?: string) => (v ? ` ${v.slice(0, 7)}` : '');
  switch (result.status) {
    case 'BASE_UNAVAILABLE':
      return `base version${ver(baseVersion)} ${REASON_TEXT[result.base.reason || 'FAILED']}`;
    case 'COMPARE_UNAVAILABLE':
      return `compare version${ver(compareVersion)} ${REASON_TEXT[result.compare.reason || 'FAILED']}`;
    case 'UNAVAILABLE': {
      const baseReason = REASON_TEXT[result.base.reason || 'FAILED'];
      const compareReason = REASON_TEXT[result.compare.reason || 'FAILED'];
      if (baseReason === compareReason) return `neither version has API data (${baseReason})`;
      return `neither version has API data — base ${baseReason}; compare ${compareReason}`;
    }
    default:
      return undefined;
  }
}
