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

export { applyModifiedVersion, applyModifiedVersionWithPlan } from './apply-version';
import { registerRustSnapshotFunctions, hasRustSnapshotFunctions } from '@teambit/objects';
// Load defining functions before their eligibility is queried through Babel's lazy index exports.
const checkoutDefiningApply = require('./apply-version');
const checkoutPublicApply = require('./index');
const checkoutApplyNames = ['applyModifiedVersion', 'applyModifiedVersionWithPlan'];
const checkoutApplyDescriptors = Object.getOwnPropertyDescriptors(checkoutPublicApply);
registerRustSnapshotFunctions('CheckoutDefiningApply', checkoutDefiningApply, checkoutApplyNames);

/** Public re-export accessors are checked without evaluating replaced getters. */
export function hasRustCheckoutApplyFunctions(): boolean {
  return (
    hasRustSnapshotFunctions(['CheckoutDefiningApply', 'CheckoutPublicApplyGuard']) &&
    checkoutApplyNames.every((name) => {
      const before = checkoutApplyDescriptors[name];
      const live = Object.getOwnPropertyDescriptor(checkoutPublicApply, name);
      return (
        before &&
        live &&
        before.get === live.get &&
        before.set === live.set &&
        before.value === live.value &&
        before.writable === live.writable &&
        before.enumerable === live.enumerable &&
        before.configurable === live.configurable
      );
    })
  );
}
registerRustSnapshotFunctions('CheckoutPublicApplyGuard', checkoutPublicApply, ['hasRustCheckoutApplyFunctions']);
