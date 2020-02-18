import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { loadConsumerIfExist, loadConsumer } from '../../consumer';
import { Capsule } from '../capsule';
import { ConsumerNotFound } from '../../consumer/exceptions';

export type WorkspaceDeps = [Scope, ComponentFactory, Capsule];

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
  // don't use loadConsumer() here because the consumer might not be available.
  // also, this loadConsumerIfExist() is wrapped with try/catch in order not to break when the
  // consumer can't be loaded due to .bitmap or bit.json issues which are fixed on a later phase
  // open bit init --reset.
  // keep in mind that here is the first place where the consumer is loaded.
  try {
    const consumer = await loadConsumer();
    if (consumer) {
      const workspace = new Workspace(consumer, scope, component, capsule);
      return workspace;
    }
  } catch (err) {
    if (err instanceof ConsumerNotFound) throw err;
    return undefined; // can be from bit init --reset, return undefined and the init command will take care of that
  }
  return undefined;
}
