import { Harmony } from '@teambit/harmony';
import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { loadConsumerIfExist } from '../../consumer';
import { Isolator } from '../isolator';

export type WorkspaceDeps = [Scope, ComponentFactory, Isolator];

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

export default async function provideWorkspace([scope, component, network]: WorkspaceDeps, harmony: Harmony) {
  // don't use loadConsumer() here because the consumer might not be available.
  // also, this loadConsumerIfExist() is wrapped with try/catch in order not to break when the
  // consumer can't be loaded due to .bitmap or bit.json issues which are fixed on a later phase
  // open bit init --reset.
  // keep in mind that here is the first place where the consumer is loaded.
  // an unresolved issue here is when running tasks, such as "bit run build" outside of a consumer.
  // we'll have to fix this asap.
  try {
    const consumer = await loadConsumerIfExist();
    if (consumer) {
      const workspace = new Workspace(consumer, scope, component, network, undefined, harmony);
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
