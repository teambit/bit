import { ConfigMergerAspect } from './config-merger.aspect';

export type {
  ConfigMergerMain,
  WorkspaceDepsUpdates,
  WorkspaceDepsConflicts,
  WorkspaceConfigUpdateResult,
} from './config-merger.main.runtime';
export type { ConfigMergeResult } from './config-merge-result';
export { ComponentConfigMerger } from './component-config-merger';
export default ConfigMergerAspect;
export { ConfigMergerAspect };
