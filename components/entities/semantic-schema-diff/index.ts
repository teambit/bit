export { computeAPIDiff } from './api-diff';
export { APIDiffStatus } from './api-diff-change';
export type { APIDiffResult, APIDiffChange } from './api-diff-change';
export type { ImpactLevel, ImpactRule } from './impact-rule';
export { ImpactAssessor, worstImpact } from './impact-assessor';
export type { AssessedChange } from './impact-assessor';
export { DEFAULT_IMPACT_RULES } from './default-impact-rules';
export type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';
export { computeDetailedDiff } from './schema-comparators';
export {
  buildExportMap,
  buildInternalMap,
  stripLocations,
  getSchemaTypeName,
  getDisplayName,
  toComparableObject,
} from './utils';
