import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { ListCmd } from './list.cmd';
import { loadConsumerIfExist } from '../../consumer';
import { Capsule } from '../capsule';
import { BitCli } from '../cli';

export type WorkspaceDeps = [Scope, ComponentFactory, BitCli, Capsule];

export type WorkspaceConfig = {
  /**
   * default scope for the Workspace, defaults to none.
   */
  defaultScope: string;

  /**
   * default scope for components to be exported to. absolute require paths for components
   * will be generated accordingly.
   */
  components: string;
};

export default async function provideWorkspace(config: WorkspaceConfig, [scope, component, capsule]: WorkspaceDeps) {
  // This is wrapped since there are cases when there is no workspace, or something in the workspace is invalid
  // Those will be handled later
  try {
    const consumer = await loadConsumerIfExist();
    if (consumer) {
      const workspace = new Workspace(consumer, scope, component, capsule);
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
