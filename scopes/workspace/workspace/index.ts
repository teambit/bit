import { WorkspaceAspect } from './workspace.aspect';
// eslint-disable-next-line import/prefer-default-export
export type { default as Workspace, ExtensionsOrigin } from './workspace';
// TODO: change to module path once track the utils folder
export type { ResolvedComponent } from '@teambit/harmony.modules.resolved-component';
export type { AlreadyExistsError as ComponentConfigFileAlreadyExistsError } from './component-config-file';
export type { WorkspaceMain } from './workspace.main.runtime';
export * from './events';
export type { WorkspaceUI } from './workspace.ui.runtime';
export type { SerializableResults, OnComponentLoad, OnComponentEventResult } from './on-component-events';
export { ComponentStatus } from './workspace-component';
export type { WorkspaceModelComponent } from './ui/workspace/workspace-model';
export { Workspace as WorkspaceModel } from './ui/workspace/workspace-model';
export { WorkspaceContext } from './ui/workspace/workspace-context';
export { OutsideWorkspaceError } from './exceptions/outside-workspace';
export type { WorkspaceComponent, ComponentLoadOptions as WorkspaceComponentLoadOptions } from './workspace-component';
export type { ComponentConfigFile } from './component-config-file';
export type { CompFiles, FilesStatus } from './workspace-component/comp-files';
export type { MergeOptions as BitmapMergeOptions } from './bit-map';
export type { WorkspaceExtConfig } from './types';
export { WorkspaceAspect };
export default WorkspaceAspect;
