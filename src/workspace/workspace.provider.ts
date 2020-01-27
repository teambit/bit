import { Scope } from '../scope/scope.api';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { ListCmd } from './list.cmd';
import { Paper } from '../paper';

export type WorkspaceDeps = [Scope, ComponentFactory, Paper];

export type WorkspaceConfig = {
  /**
   * default scope for the Workspace, defaults to none.
   */
  defaultScope: string;
};

export default async function provideWorkspace(config: WorkspaceConfig, [scope, component, paper]: WorkspaceDeps) {
  const consumer = scope.consumer;
  if (consumer) {
    const workspace = new Workspace(consumer, scope, component);
    paper.register(new ListCmd(workspace));
    return workspace;
  }

  return undefined;
}
