import { MergingAspect } from './merging.aspect';

export {
  mergeReport,
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
  getWorkspaceConfigUpdateOutput,
} from './merge-cmd';
export { compIsAlreadyMergedMsg } from './merge-status-provider';
export {
  threeWayMerge,
  getMergeStrategyInteractive,
  MergeStrategy,
  FileStatus,
  MergeOptions,
  MergeResultsThreeWay,
} from './merge-version';
export { MergeFileResult, MergeFileParams, mergeFiles } from './merge-files';
export type {
  MergingMain,
  ComponentMergeStatus,
  ApplyVersionResults,
  ApplyVersionResult,
  FilesStatus,
  FailedComponents,
} from './merging.main.runtime';
export default MergingAspect;
export { MergingAspect };
