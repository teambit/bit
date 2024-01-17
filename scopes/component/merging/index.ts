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
