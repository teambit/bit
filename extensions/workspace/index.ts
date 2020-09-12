import { WorkspaceAspect } from './workspace.aspect';
// eslint-disable-next-line import/prefer-default-export
export type { default as Workspace } from './workspace';
// TODO: change to module path once track the utils folder
export type { ResolvedComponent } from '@teambit/utils.resolved-component';
export type { AlreadyExistsError as ComponentConfigFileAlreadyExistsError } from './component-config-file';
export type { WorkspaceMain } from './workspace.main.runtime';

export type { WorkspaceUI } from './workspace.ui.runtime';
export type { SerializableResults, OnComponentEventResult, ExtensionData } from './on-component-events';
export { ComponentStatus } from './workspace-component';
export { WorkspaceModelComponent } from './ui/workspace/workspace-model';
export type { WorkspaceComponent } from './workspace-component';
export { WorkspaceAspect };
export default WorkspaceAspect;
