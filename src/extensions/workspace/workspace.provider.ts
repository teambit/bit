import { Harmony } from '@teambit/harmony';
import { Scope } from '../scope/';
import Workspace from './workspace';
import { ComponentFactory } from '../component';
import { loadConsumerIfExist } from '../../consumer';
import { Isolator } from '../isolator';
import { Reporter } from '../reporter';
import { WorkspaceConfig } from '../workspace-config';
import ConsumerComponent from '../../consumer/component';

export type WorkspaceDeps = [WorkspaceConfig, Scope, ComponentFactory, Isolator, Reporter];

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
  [workspaceConfig, scope, component, isolator, reporter]: WorkspaceDeps,
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
        consumer,
        workspaceConfig,
        scope,
        component,
        isolator,
        reporter.createLogger('workspace'), // TODO: get the 'worksacpe' name in a better way
        undefined,
        harmony
      );
      ConsumerComponent.registerOnComponentConfigLoading('workspace', async (id, componentConfig) => {
        const extensionsConfig = componentConfig.allExtensions().toExtensionConfigList();
        const res = await workspace.loadExtensionsByConfig(extensionsConfig);
        return res;
      });
      return workspace;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
