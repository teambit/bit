export { computeAPIDiff } from './api-diff';
export { APIDiffStatus } from './api-diff-change';
export type { APIDiffResult, APIDiffChange } from './api-diff-change';
// Re-export canonical types from semantic-schema under the aliases used by consumers
export { SchemaChangeImpact as SemanticImpact } from '@teambit/semantics.entities.semantic-schema';
export type { SchemaChangeDetail as APIDiffDetail } from '@teambit/semantics.entities.semantic-schema';
export { computeDetailedDiff } from './schema-comparators';
export { buildExportMap, stripLocations, getSchemaTypeName, getDisplayName, toComparableObject } from './utils';
