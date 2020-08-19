import { Harmony, SlotRegistry } from '@teambit/harmony';
import type { ScopeMain } from '../scope';
import { Workspace } from './workspace';
import type { ComponentMain } from '../component';
import { loadConsumerIfExist, Consumer } from '../../consumer';
import { IsolatorMain } from '../isolator';
import ConsumerComponent from '../../consumer/component';
import { DependencyResolverMain } from '../dependency-resolver';
import type { VariantsMain } from '../variants';
import { WorkspaceExtConfig } from './types';
import { GraphqlMain } from '../graphql';
import getWorkspaceSchema from './workspace.graphql';
import InstallCmd from './install.cmd';
import { CLIMain } from '../cli';
import EjectConfCmd from './eject-conf.cmd';
import { UiMain } from '../ui';
import { WorkspaceUIRoot } from './workspace.ui-root';
import { BundlerMain } from '../bundler';
import { CapsuleListCmd } from './capsule-list.cmd';
import { CapsuleCreateCmd } from './capsule-create.cmd';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';
import { WatchCommand } from './watch/watch.cmd';
import { Watcher } from './watch/watcher';
import { EXT_NAME } from './constants';
import ManyComponentsWriter from '../../consumer/component-ops/many-components-writer';
import { LoggerMain } from '../logger';

export type WorkspaceDeps = [
  CLIMain,
  ScopeMain,
  ComponentMain,
  IsolatorMain,
  DependencyResolverMain,
  VariantsMain,
  LoggerMain,
  GraphqlMain,
  UiMain,
  BundlerMain
];

export type OnComponentLoadSlot = SlotRegistry<OnComponentLoad>;

export type OnComponentChangeSlot = SlotRegistry<OnComponentChange>;

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
  [cli, scope, component, isolator, dependencyResolver, variants, loggerExt, graphql, ui, bundler]: WorkspaceDeps,
  config: WorkspaceExtConfig,
  [onComponentLoadSlot, onComponentChangeSlot]: [OnComponentLoadSlot, OnComponentChangeSlot],
  harmony: Harmony
) {
  const consumer = await getConsumer();
  if (!consumer) return undefined;
  // TODO: get the 'worksacpe' name in a better way
  const logger = loggerExt.createLogger(EXT_NAME);
  const workspace = new Workspace(
    config,
    consumer,
    scope,
    component,
    isolator,
    dependencyResolver,
    variants,
    logger,
    undefined,
    harmony,
    onComponentLoadSlot,
    onComponentChangeSlot
  );

  ManyComponentsWriter.registerExternalInstaller({
    install: workspace.install.bind(workspace),
  });

  ConsumerComponent.registerOnComponentConfigLoading(EXT_NAME, async (id) => {
    const componentId = await workspace.resolveComponentId(id);
    // We call here directly workspace.scope.get instead of workspace.get because part of the workspace get is loading consumer component
    // which in turn run this event, which will make and infinite loop
    const componentFromScope = await workspace.scope.get(componentId);
    const extensions = await workspace.componentExtensions(componentId, componentFromScope);
    const defaultScope = await workspace.componentDefaultScope(componentId);
    await workspace.loadExtensions(extensions);
    return {
      defaultScope,
      extensions,
    };
  });

  const workspaceSchema = getWorkspaceSchema(workspace);
  ui.registerUiRoot(new WorkspaceUIRoot(workspace, bundler));
  graphql.register(workspaceSchema);
  cli.register(new InstallCmd(workspace, logger));
  cli.register(new EjectConfCmd(workspace));

  const capsuleListCmd = new CapsuleListCmd(isolator, workspace);
  const capsuleCreateCmd = new CapsuleCreateCmd(workspace);
  cli.register(capsuleListCmd);
  cli.register(capsuleCreateCmd);
  const watcher = new Watcher(workspace);
  cli.register(new WatchCommand(watcher));
  component.registerHost(workspace);

  return workspace;
}

/**
 * don't use loadConsumer() here, which throws ConsumerNotFound because some commands don't require
 * the consumer to be available. such as, `bit init` or `bit list --remote`.
 * most of the commands do need the consumer. the legacy commands that need the consumer throw an
 * error when is missing. in the new/Harmony commands, such as `bis compile`, the workspace object
 * is passed to the provider, so before using it, make sure it exists.
 * keep in mind that you can't verify it in the provider itself, because the provider is running
 * always for all commands before anything else is happening.
 *
 * the reason for the try/catch when loading the consumer is because some bit files (e.g. bit.json)
 * can be corrupted and in this case we do want to throw an error explaining this. the only command
 * allow in such a case is `bit init --reset`, which fixes the corrupted files. sadly, at this
 * stage we don't have the commands objects, so we can't check the command/flags from there. we
 * need to check the `process.argv.` directly instead, which is not 100% accurate.
 */
async function getConsumer(): Promise<Consumer | undefined> {
  try {
    return await loadConsumerIfExist();
  } catch (err) {
    if (process.argv.includes('init') && !process.argv.includes('-r')) {
      return undefined;
    }
    throw err;
  }
}
