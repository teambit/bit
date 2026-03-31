// Re-export the canonical types from semantic-schema
export { SchemaChangeImpact as SemanticImpact } from '@teambit/semantics.entities.semantic-schema';
export type { SchemaChangeDetail as APIDiffDetail } from '@teambit/semantics.entities.semantic-schema';

export enum APIDiffStatus {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

export type APIDiffChange = {
  /** The status of the change */
  status: APIDiffStatus;
  /** Whether this is a public (exported) or internal change */
  visibility: 'public' | 'internal';
  /** The export name (or alias) */
  exportName: string;
  /** Human-readable schema kind (e.g., 'Function', 'Class', 'Interface') */
  schemaType: string;
  /** Raw __schema value */
  schemaTypeRaw: string;
  /** Worst-case semantic impact of this change */
  impact: import('@teambit/semantics.entities.semantic-schema').SchemaChangeImpact;
  /** The full signature in the base version (undefined if ADDED) */
  baseSignature?: string;
  /** The full signature in the compare version (undefined if REMOVED) */
  compareSignature?: string;
  /** The serialized base schema node (undefined if ADDED) */
  baseNode?: Record<string, any>;
  /** The serialized compare schema node (undefined if REMOVED) */
  compareNode?: Record<string, any>;
  /** For MODIFIED: list of specific sub-changes */
  changes?: import('@teambit/semantics.entities.semantic-schema').SchemaChangeDetail[];
};

export type APIDiffResult = {
  /** Whether there are any API changes */
  hasChanges: boolean;
  /** Worst-case semantic impact across all changes */
  impact: import('@teambit/semantics.entities.semantic-schema').SchemaChangeImpact;
  /** Public API changes */
  publicChanges: APIDiffChange[];
  /** Internal (non-exported) changes */
  internalChanges: APIDiffChange[];
  /** Flat list of all changes (public + internal) */
  changes: APIDiffChange[];
  /** Summary counts */
  added: number;
  removed: number;
  modified: number;
  /** Counts by impact */
  breaking: number;
  nonBreaking: number;
  patch: number;
};
