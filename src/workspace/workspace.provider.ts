import { Scope } from '../scope/scope.api';
import Workspace from './workspace';
import { ComponentFactory } from '../component';

export type WorkspaceDeps = [Scope, ComponentFactory];

export type WorkspaceConfig = {
  /**
   * default scope for the Workspace, defaults to none.
   */
  defaultScope: string;
};

export default async function provideWorkspace(config: WorkspaceConfig, [scope, component]: WorkspaceDeps) {
  const consumer = scope.consumer;
  if (consumer) {
    return new Workspace(consumer, scope, component);
  }
  return undefined;
}
