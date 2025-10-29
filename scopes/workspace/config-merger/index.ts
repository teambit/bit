import { ConfigMergerAspect } from './config-merger.aspect';

export type { ConfigMergerMain } from './config-merger.main.runtime';
export type {
  WorkspaceDepsUpdates,
  WorkspaceDepsConflicts,
  WorkspaceConfigUpdateResult,
} from '@teambit/component.modules.merge-helper';
export type { ConfigMergeResult } from './config-merge-result';
export { ComponentConfigMerger, PolicyDependency } from './component-config-merger';
export default ConfigMergerAspect;
export { ConfigMergerAspect };
