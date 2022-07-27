import { WorkspaceAspect } from './workspace.aspect';
// eslint-disable-next-line import/prefer-default-export
export type { default as Workspace, ExtensionsOrigin } from './workspace';
// TODO: change to module path once track the utils folder
export type { ResolvedComponent } from '@teambit/harmony.modules.resolved-component';
export type { AlreadyExistsError as ComponentConfigFileAlreadyExistsError } from './component-config-file';
export type { WorkspaceMain } from './workspace.main.runtime';
export type { WatchOptions } from './watch/watcher';
export { CheckTypes } from './watch/check-types';
export * from './events';
export type { WorkspaceUI } from './workspace.ui.runtime';
export type { SerializableResults, OnComponentLoad, OnComponentEventResult } from './on-component-events';
export { ComponentStatus } from './workspace-component';
export { WorkspaceModelComponent } from './ui/workspace/workspace-model';
export { WorkspaceContext } from './ui/workspace/workspace-context';
export type { WorkspaceComponent } from './workspace-component';

export { WorkspaceAspect };
export default WorkspaceAspect;
