export { computeAPIDiff } from './api-diff';
export { APIDiffStatus, SemanticImpact } from './api-diff-change';
export type { APIDiffResult, APIDiffChange, APIDiffDetail } from './api-diff-change';
export { computeDetailedDiff } from './schema-comparators';
export {
  buildExportMap,
  stripLocations,
  deepEqual,
  getSchemaTypeName,
  getDisplayName,
  getDisplayNameFromRaw,
  toComparableObject,
} from './utils';
