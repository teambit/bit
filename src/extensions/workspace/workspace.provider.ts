import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { loadConsumerIfExist } from '../../consumer';
import { Capsule } from '../capsule';
import { WorkspaceConfig } from '../workspace-config';

export type WorkspaceDeps = [WorkspaceConfig, Scope, ComponentFactory, Capsule];

export type WorkspaceCoreConfig = {
  /**
   * sets the default location of components.
   */
  componentsDefaultDirectory: string;

  /**
   * default scope for components to be exported to. absolute require paths for components
   * will be generated accordingly.
   */
  defaultScope: string;
};

export default async function provideWorkspace(
  config: WorkspaceCoreConfig,
  [workspaceConfig, scope, component, capsule]: WorkspaceDeps
) {
  // This is wrapped since there are cases when there is no workspace, or something in the workspace is invalid
  // Those will be handled later
  try {
    const consumer = await loadConsumerIfExist();
    if (consumer) {
      const workspace = new Workspace(consumer, workspaceConfig, scope, component, capsule);
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
