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

export type APIDiffResult = {
  status: APIDiffComputeStatus;
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
