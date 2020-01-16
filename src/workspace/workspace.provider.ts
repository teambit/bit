import { loadConsumer, Consumer } from '../consumer';
import { Scope } from '../scope/scope.api';
import Workspace from './workspace';

export type WorkspaceDeps = [Scope];

export default async function provideWorkspace(config: {}, [scope]: WorkspaceDeps) {
  const consumer = scope.consumer;
  if (consumer) {
    return new Workspace(consumer);
  }
  return undefined;
}
