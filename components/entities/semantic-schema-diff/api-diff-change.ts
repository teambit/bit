import type { ImpactLevel } from './impact-rule';
import type { AssessedChange } from './impact-assessor';

export type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';
export type { ImpactLevel, ImpactRule } from './impact-rule';
export type { AssessedChange } from './impact-assessor';

export enum APIDiffStatus {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

/**
 * why a schema could not be obtained for one side of the diff.
 * NOT_BUILT — the version was built before API extraction existed (no schema.json artifact).
 * NO_EXTRACTOR — the component's env does not provide a schema extractor.
 * DISABLED — schema extraction is disabled by config.
 * FAILED — extraction or artifact retrieval threw.
 */
export type SchemaUnavailableReason = 'NOT_BUILT' | 'NO_EXTRACTOR' | 'DISABLED' | 'FAILED';

export type SchemaAvailability = {
  available: boolean;
  reason?: SchemaUnavailableReason;
};

/**
 * whether the diff was actually computed, or skipped because schema data is
 * missing for one or both sides. when not COMPUTED, change lists are empty —
 * a missing schema must never be diffed as if it were an empty API.
 */
export type APIDiffComputeStatus = 'COMPUTED' | 'BASE_UNAVAILABLE' | 'COMPARE_UNAVAILABLE' | 'UNAVAILABLE';

export type APIDiffChange = {
  status: APIDiffStatus;
  visibility: 'public' | 'internal';
  exportName: string;
  schemaType: string;
  schemaTypeRaw: string;
  impact: ImpactLevel;
  baseSignature?: string;
  compareSignature?: string;
  baseNode?: Record<string, any>;
  compareNode?: Record<string, any>;
  changes?: AssessedChange[];
};

export type APIDiffResult = {
  status: APIDiffComputeStatus;
  base: SchemaAvailability;
  compare: SchemaAvailability;
  hasChanges: boolean;
  /** consumer-facing impact — derived from public changes only */
  impact: ImpactLevel;
  /** severity of internal (non-exported) changes — never affects `impact` */
  internalImpact: ImpactLevel;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  changes: APIDiffChange[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};
