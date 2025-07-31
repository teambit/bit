import { MergingAspect } from './merging.aspect';

export { mergeReport } from './merge-cmd';
export { compIsAlreadyMergedMsg } from './merge-status-provider';
export type { MergingMain, ComponentMergeStatus } from './merging.main.runtime';

// Re-export types and functions from merge-helper for backward compatibility
export type {
  ApplyVersionResult,
  ApplyVersionResults,
  FailedComponents,
  FilesStatus,
} from '@teambit/component.modules.merge-helper';
export {
  FileStatus,
  getMergeStrategyInteractive,
  getMergeStrategy,
  MergeOptions,
  MergeStrategy,
  threeWayMerge,
  MergeResultsThreeWay,
} from '@teambit/component.modules.merge-helper';

export default MergingAspect;
export { MergingAspect };
