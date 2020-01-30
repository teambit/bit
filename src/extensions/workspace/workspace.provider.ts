import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../../component';
import { ListCmd } from './list.cmd';
import { Paper } from '../../extensions/paper';
import { loadConsumerIfExist } from '../../consumer';

export type WorkspaceDeps = [Scope, ComponentFactory, Paper];

export type WorkspaceConfig = {
  /**
   * default scope for the Workspace, defaults to none.
   */
  defaultScope: string;
};

export default async function provideWorkspace(config: WorkspaceConfig, [scope, component, paper]: WorkspaceDeps) {
  const consumer = await loadConsumerIfExist();
  if (consumer) {
    const workspace = new Workspace(consumer, scope, component);
    paper.register(new ListCmd(workspace));
    return workspace;
  }

  return undefined;
}
