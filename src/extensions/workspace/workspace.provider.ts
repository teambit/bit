import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { ListCmd } from './list.cmd';
import { loadConsumerIfExist } from '../../consumer';
import { BitCli } from '../cli';

export type WorkspaceDeps = [Scope, ComponentFactory, BitCli];

export type WorkspaceConfig = {
  /**
   * default scope for the Workspace, defaults to none.
   */
  defaultScope: string;
};

export default async function provideWorkspace(config: WorkspaceConfig, [scope, component, cli]: WorkspaceDeps) {
  // This is wrapped since there are cases when there is no workspace, or something in the workspace is invalid
  // Those will be handled later
  try {
    const consumer = await loadConsumerIfExist();
    if (consumer) {
      const workspace = new Workspace(consumer, scope, component);
      cli.register(new ListCmd(workspace));
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
