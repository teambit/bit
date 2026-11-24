import type {
  ImpactLevel,
  APIDiffComputeStatus,
  SchemaUnavailableReason,
} from '@teambit/semantics.entities.semantic-schema-diff';

export type { ImpactLevel, APIDiffComputeStatus, SchemaUnavailableReason };

/**
 * UI-facing shapes of the API diff GraphQL payload. These mirror the server entity
 * (`@teambit/semantics.entities.semantic-schema-diff`) but only carry the fields the
 * query selects (see `use-api-diff`). All compare UIs must import these from here — do not redeclare.
 */
export type APIDiffDetail = {
  changeKind: string;
  description: string;
  impact: ImpactLevel;
  from?: string;
  to?: string;
  /** owning member's signature — shown as context next to member-level (e.g. doc-only) changes. */
  signature?: string;
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

/**
 * the status of a result in the UI. `UNSUPPORTED` is UI-only: the backend's GraphQL schema has no API
 * diff support (an older Bit), so there is no result to show. See `UNSUPPORTED_API_DIFF`.
 */
export type APIDiffResultStatus = APIDiffComputeStatus | 'UNSUPPORTED';

export type APIDiffResult = {
  status: APIDiffResultStatus;
  base: SchemaSideAvailability;
  compare: SchemaSideAvailability;
  hasChanges: boolean;
  impact: ImpactLevel;
  internalImpact: ImpactLevel;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  /** exports the extractor couldn't analyze — surfaced distinctly, never as a change. */
  unresolvedExports?: string[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};

/**
 * The result the UI uses when the backend cannot compute API diffs at all (its GraphQL schema lacks
 * the query or its fields). It has no changes, so every consumer that reads `hasChanges` or the change
 * lists treats it as "nothing to show", and `ComponentApiDiffSection` renders a neutral notice for it.
 */
export const UNSUPPORTED_API_DIFF: APIDiffResult = Object.freeze({
  status: 'UNSUPPORTED',
  base: { available: false },
  compare: { available: false },
  hasChanges: false,
  impact: 'PATCH',
  internalImpact: 'PATCH',
  publicChanges: [],
  internalChanges: [],
  unresolvedExports: [],
  added: 0,
  removed: 0,
  modified: 0,
  breaking: 0,
  nonBreaking: 0,
  patch: 0,
}) as APIDiffResult;

export function isApiDiffUnsupported(result?: APIDiffResult | null): boolean {
  return result?.status === 'UNSUPPORTED';
}
