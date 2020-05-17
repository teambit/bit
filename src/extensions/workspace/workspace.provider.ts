import { Harmony } from '@teambit/harmony';
import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { loadConsumerIfExist } from '../../consumer';
import { Isolator } from '../isolator';
import { Logger } from '../logger';
import ConsumerComponent from '../../consumer/component';
import { DependencyResolver } from '../dependency-resolver';
import { Variants } from '../variants';
import { WorkspaceExtConfig } from './types';

export type WorkspaceDeps = [Scope, ComponentFactory, Isolator, DependencyResolver, Variants, Logger];

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

  defaultOwner: string;
};

export default async function provideWorkspace(
  [scope, component, isolator, dependencyResolver, variants, logger]: WorkspaceDeps,
  config: WorkspaceExtConfig,
  _slots,
  harmony: Harmony
) {
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
      const workspace = new Workspace(
        config,
        consumer,
        scope,
        component,
        isolator,
        dependencyResolver,
        variants,
        logger.createLogPublisher('workspace'), // TODO: get the 'worksacpe' name in a better way
        undefined,
        harmony
      );
      ConsumerComponent.registerOnComponentConfigLoading('workspace', async (id, componentConfig) => {
        return workspace.loadComponentExtensions(id);
      });
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
