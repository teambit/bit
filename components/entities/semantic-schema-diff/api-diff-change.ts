export enum APIDiffStatus {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

export enum SemanticImpact {
  /** Removing exports, removing required params, narrowing types — consumers will break */
  BREAKING = 'BREAKING',
  /** Adding optional params, adding exports, widening types — consumers won't break */
  NON_BREAKING = 'NON_BREAKING',
  /** Doc changes, internal refactors — no runtime impact */
  PATCH = 'PATCH',
}

export type APIDiffDetail = {
  /** What aspect of the API changed */
  aspect: string;
  /** Human-readable description of the change */
  description: string;
  /** Semantic impact of this particular sub-change */
  impact: SemanticImpact;
  /** Previous value (stringified) */
  from?: string;
  /** New value (stringified) */
  to?: string;
};

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
  impact: SemanticImpact;
  /** The full signature in the base version (undefined if ADDED) */
  baseSignature?: string;
  /** The full signature in the compare version (undefined if REMOVED) */
  compareSignature?: string;
  /** The serialized base schema node (undefined if ADDED) */
  baseNode?: Record<string, any>;
  /** The serialized compare schema node (undefined if REMOVED) */
  compareNode?: Record<string, any>;
  /** For MODIFIED: list of specific sub-changes */
  changes?: APIDiffDetail[];
};

export type APIDiffResult = {
  /** Whether there are any API changes */
  hasChanges: boolean;
  /** Worst-case semantic impact across all changes */
  impact: SemanticImpact;
  /** All changes grouped */
  publicChanges: APIDiffChange[];
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
