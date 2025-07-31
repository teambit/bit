export { mergeFiles } from './merge-files';
export type { MergeFileParams, MergeFileResult } from './merge-files';
export { threeWayMerge, MergeResultsThreeWay } from './three-way-merge';
export {
  FileStatus,
  getMergeStrategyInteractive,
  getMergeStrategy,
  MergeOptions,
  MergeStrategy,
} from './merge-version';
export type {
  WorkspaceDepsUpdates,
  WorkspaceDepsConflicts,
  WorkspaceDepsUnchanged,
  WorkspaceConfigUpdateResult,
  MergeSnapResults,
  ApplyVersionResult,
  ApplyVersionResults,
  FailedComponents,
  FilesStatus,
} from './types';

export {
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
  getWorkspaceConfigUpdateOutput,
} from './merge-output';
