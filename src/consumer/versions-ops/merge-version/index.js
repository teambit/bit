// @flow

export { default as threeWayMerge } from './three-way-merge';
export {
  mergeVersion,
  FileStatus,
  getMergeStrategyInteractive,
  getMergeStrategy,
  MergeOptions,
  filesStatusWithoutSharedDir
} from './merge-version';
export type { MergeStrategy, ApplyVersionResults, ApplyVersionResult, FailedComponents } from './merge-version';
