import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { BundlerMain } from '@teambit/bundler';
import { CLIMain } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { EnvsMain } from '@teambit/environments';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony, SlotRegistry } from '@teambit/harmony';
import { IsolatorMain } from '@teambit/isolator';
import { LoggerMain } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { UiMain } from '@teambit/ui';
import type { VariantsMain } from '@teambit/variants';
import { Consumer, loadConsumerIfExist } from 'bit-bin/dist/consumer';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import ManyComponentsWriter from 'bit-bin/dist/consumer/component-ops/many-components-writer';

import { CapsuleCreateCmd } from './capsule-create.cmd';
import { CapsuleListCmd } from './capsule-list.cmd';
import { EXT_NAME } from './constants';
import EjectConfCmd from './eject-conf.cmd';
import InstallCmd from './install.cmd';
import { OnComponentAdd } from './on-component-add';
import { OnComponentChange } from './on-component-change';
import { OnComponentLoad } from './on-component-load';
import { WorkspaceExtConfig } from './types';
import { WatchCommand } from './watch/watch.cmd';
import { Watcher } from './watch/watcher';
import { Workspace } from './workspace';
import getWorkspaceSchema from './workspace.graphql';
import { WorkspaceUIRoot } from './workspace.ui-root';

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
  BundlerMain,
  AspectLoaderMain,
  EnvsMain
];

export type OnComponentLoadSlot = SlotRegistry<OnComponentLoad>;

export type OnComponentChangeSlot = SlotRegistry<OnComponentChange>;

export type OnComponentAddSlot = SlotRegistry<OnComponentAdd>;

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
  [
    cli,
    scope,
    component,
    isolator,
    dependencyResolver,
    variants,
    loggerExt,
    graphql,
    ui,
    bundler,
    aspectLoader,
    envs,
  ]: WorkspaceDeps,
  config: WorkspaceExtConfig,
  [onComponentLoadSlot, onComponentChangeSlot, onComponentAddSlot]: [
    OnComponentLoadSlot,
    OnComponentChangeSlot,
    OnComponentAddSlot
  ],
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
    aspectLoader,
    logger,
    undefined,
    harmony,
    onComponentLoadSlot,
    onComponentChangeSlot,
    envs,
    onComponentAddSlot,
    graphql
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

  onComponentLoadSlot.register(workspace.getEnvSystemDescriptor.bind(workspace));

  const workspaceSchema = getWorkspaceSchema(workspace, graphql);
  ui.registerUiRoot(new WorkspaceUIRoot(workspace, bundler));
  graphql.register(workspaceSchema);
  cli.register(new InstallCmd(workspace, logger));
  cli.register(new EjectConfCmd(workspace));

  const capsuleListCmd = new CapsuleListCmd(isolator, workspace);
  const capsuleCreateCmd = new CapsuleCreateCmd(workspace);
  cli.register(capsuleListCmd);
  cli.register(capsuleCreateCmd);
  const watcher = new Watcher(workspace);
  if (workspace && !workspace.consumer.isLegacy) {
    cli.unregister('watch');
    cli.register(new WatchCommand(watcher));
  }
  component.registerHost(workspace);

  cli.registerOnStart(async () => {
    await workspace.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions());
  });

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
