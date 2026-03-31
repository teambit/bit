export type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';
export type { ImpactLevel, ImpactRule } from './impact-rule';
export type { AssessedChange } from './impact-assessor';

export enum APIDiffStatus {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

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
  hasChanges: boolean;
  impact: ImpactLevel;
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
