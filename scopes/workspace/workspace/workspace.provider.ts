import { PubsubMain } from '@teambit/pubsub';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { BundlerMain } from '@teambit/bundler';
import { CLIMain, CommandList } from '@teambit/cli';
import { ComponentMain } from '@teambit/component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { EnvsMain } from '@teambit/envs';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony, SlotRegistry } from '@teambit/harmony';
import { IsolatorMain } from '@teambit/isolator';
import { LoggerMain } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { UiMain } from '@teambit/ui';
import type { VariantsMain } from '@teambit/variants';
import { Consumer, loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { registerDefaultScopeGetter } from '@teambit/legacy/dist/api/consumer';
import { BitId } from '@teambit/legacy-bit-id';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import LegacyComponentLoader from '@teambit/legacy/dist/consumer/component/component-loader';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { CapsuleCreateCmd } from './capsule-create.cmd';
import { CapsuleListCmd } from './capsule-list.cmd';
import { EXT_NAME } from './constants';
import EjectConfCmd from './eject-conf.cmd';
import InstallCmd from './install.cmd';
import { OnComponentLoad, OnComponentAdd, OnComponentChange, OnComponentRemove } from './on-component-events';
import { WorkspaceExtConfig } from './types';
import { WatchCommand } from './watch/watch.cmd';
import { LinkCommand } from './link';
import { Watcher } from './watch/watcher';
import { Workspace, WorkspaceInstallOptions } from './workspace';
import getWorkspaceSchema from './workspace.graphql';
import { WorkspaceUIRoot } from './workspace.ui-root';

export type WorkspaceDeps = [
  PubsubMain,
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

export type OnComponentRemoveSlot = SlotRegistry<OnComponentRemove>;

export default async function provideWorkspace(
  [
    pubsub,
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
  [onComponentLoadSlot, onComponentChangeSlot, onComponentAddSlot, onComponentRemoveSlot]: [
    OnComponentLoadSlot,
    OnComponentChangeSlot,
    OnComponentAddSlot,
    OnComponentRemoveSlot
  ],
  harmony: Harmony
) {
  const bitConfig: any = harmony.config.get('teambit.harmony/bit');
  const consumer = await getConsumer(bitConfig.cwd);
  if (!consumer) return undefined;
  // TODO: get the 'workspace' name in a better way
  const logger = loggerExt.createLogger(EXT_NAME);
  const workspace = new Workspace(
    pubsub,
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
    onComponentRemoveSlot,
    graphql
  );

  const getWorkspacePolicyFromPackageJson = () => {
    const packageJson = workspace.consumer.packageJson?.packageJsonObject || {};
    const policyFromPackageJson = dependencyResolver.getWorkspacePolicyFromPackageJson(packageJson);
    return policyFromPackageJson;
  };

  dependencyResolver.registerRootPolicy(getWorkspacePolicyFromPackageJson());

  ManyComponentsWriter.registerExternalInstaller({
    install: async () => {
      // TODO: think how we should pass this options
      const installOpts: WorkspaceInstallOptions = {
        dedupe: true,
        updateExisting: false,
        import: false,
      };
      return workspace.install(undefined, installOpts);
    },
  });

  consumer.onCacheClear.push(() => workspace.clearCache());

  if (!workspace.isLegacy) {
    LegacyComponentLoader.registerOnComponentLoadSubscriber(async (legacyComponent: ConsumerComponent) => {
      const id = await workspace.resolveComponentId(legacyComponent.id);
      const newComponent = await workspace.get(id, false, legacyComponent);
      return newComponent.state._consumer;
    });
  }

  ConsumerComponent.registerOnComponentConfigLoading(EXT_NAME, async (id) => {
    const componentId = await workspace.resolveComponentId(id);
    // We call here directly workspace.scope.get instead of workspace.get because part of the workspace get is loading consumer component
    // which in turn run this event, which will make an infinite loop
    // This component from scope here are only used for merging the extensions with the workspace components
    const componentFromScope = await workspace.scope.get(componentId);
    const extensions = await workspace.componentExtensions(componentId, componentFromScope);
    const defaultScope = await workspace.componentDefaultScope(componentId);

    await workspace.loadExtensions(extensions);
    const extensionsWithLegacyIdsP = extensions.map(async (extension) => {
      const legacyEntry = extension.clone();
      if (legacyEntry.extensionId) {
        const compId = await workspace.resolveComponentId(legacyEntry.extensionId);
        legacyEntry.extensionId = compId._legacy;
        legacyEntry.newExtensionId = compId;
      }

      return legacyEntry;
    });
    const extensionsWithLegacyIds = await Promise.all(extensionsWithLegacyIdsP);

    return {
      defaultScope,
      extensions: ExtensionDataList.fromArray(extensionsWithLegacyIds),
    };
  });

  /**
   * Add default scope from harmony during export.
   */
  registerDefaultScopeGetter(async (id: BitId) => {
    const componentId = await workspace.resolveComponentId(id);
    const defaultScope = await workspace.componentDefaultScope(componentId);
    return defaultScope;
  });

  const workspaceSchema = getWorkspaceSchema(workspace, graphql);
  ui.registerUiRoot(new WorkspaceUIRoot(workspace, bundler));
  graphql.register(workspaceSchema);
  const capsuleListCmd = new CapsuleListCmd(isolator, workspace);
  const capsuleCreateCmd = new CapsuleCreateCmd(workspace, isolator);
  const commands: CommandList = [
    new InstallCmd(workspace, logger),
    new EjectConfCmd(workspace),
    capsuleListCmd,
    capsuleCreateCmd,
  ];
  const watcher = new Watcher(workspace, pubsub);
  if (workspace && !workspace.consumer.isLegacy) {
    cli.unregister('watch');
    commands.push(new WatchCommand(pubsub, logger, watcher));
    cli.unregister('link');
    commands.push(new LinkCommand(workspace, logger));
  }
  cli.register(...commands);
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
 */
async function getConsumer(path?: string): Promise<Consumer | undefined> {
  return loadConsumerIfExist(path);
}
