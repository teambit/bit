import { MergingAspect } from './merging.aspect';

export {
  mergeReport,
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
} from './merge-cmd';
export type { MergingMain, ComponentMergeStatus, ApplyVersionResults } from './merging.main.runtime';
export { ConfigMergeResult } from './config-merge-result';
export default MergingAspect;
export { MergingAspect };
