import { PubsubMain } from '@teambit/pubsub';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { BundlerMain } from '@teambit/bundler';
import { CLIMain, CommandList } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain, VariantPolicy } from '@teambit/dependency-resolver';
import type { ComponentMain, Component, ComponentID } from '@teambit/component';
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
import LegacyComponentLoader from '@teambit/legacy/dist/consumer/component/component-loader';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { BitId } from '@teambit/legacy-bit-id';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { DependencyResolver as LegacyDependencyResolver } from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver';
import { EXT_NAME } from './constants';
import EjectConfCmd from './eject-conf.cmd';
import { OnComponentLoad, OnComponentAdd, OnComponentChange, OnComponentRemove } from './on-component-events';
import { WorkspaceExtConfig } from './types';
import { Workspace } from './workspace';
import getWorkspaceSchema from './workspace.graphql';
import { WorkspaceUIRoot } from './workspace.ui-root';
import { CapsuleCmd, CapsuleCreateCmd, CapsuleDeleteCmd, CapsuleListCmd } from './capsule.cmd';
import { EnvsSetCmd } from './envs-subcommands/envs-set.cmd';
import { EnvsUnsetCmd } from './envs-subcommands/envs-unset.cmd';
import { PatternCommand } from './pattern.cmd';
import { EnvsReplaceCmd } from './envs-subcommands/envs-replace.cmd';
import { ScopeSetCmd } from './scope-subcommands/scope-set.cmd';
import { UseCmd } from './use.cmd';
import { EnvsUpdateCmd } from './envs-subcommands/envs-update.cmd';

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

export type OnAspectsResolve = (aspectsComponents: Component[]) => Promise<void>;
export type OnAspectsResolveSlot = SlotRegistry<OnAspectsResolve>;

export type OnRootAspectAdded = (aspectsId: ComponentID, inWs: boolean) => Promise<void>;
export type OnRootAspectAddedSlot = SlotRegistry<OnRootAspectAdded>;

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
  [
    onComponentLoadSlot,
    onComponentChangeSlot,
    onComponentAddSlot,
    onComponentRemoveSlot,
    onAspectsResolveSlot,
    onRootAspectAddedSlot,
  ]: [
    OnComponentLoadSlot,
    OnComponentChangeSlot,
    OnComponentAddSlot,
    OnComponentRemoveSlot,
    OnAspectsResolveSlot,
    OnRootAspectAddedSlot
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
    onAspectsResolveSlot,
    onRootAspectAddedSlot,
    graphql
  );

  const configMergeFile = workspace.getConflictMergeFile();
  await configMergeFile.loadIfNeeded();

  const getWorkspacePolicyFromPackageJson = () => {
    const packageJson = workspace.consumer.packageJson?.packageJsonObject || {};
    const policyFromPackageJson = dependencyResolver.getWorkspacePolicyFromPackageJson(packageJson);
    return policyFromPackageJson;
  };

  const getWorkspacePolicyFromMergeConfig = () => {
    const wsConfigMerge = workspace.getWorkspaceJsonConflictFromMergeConfig();
    const policy = wsConfigMerge.data?.[DependencyResolverAspect.id]?.policy || {};
    ['dependencies', 'peerDependencies'].forEach((depField) => {
      if (!policy[depField]) return;
      policy[depField] = policy[depField].reduce((acc, current) => {
        acc[current.name] = current.version;
        return acc;
      }, {});
    });
    const wsPolicy = dependencyResolver.getWorkspacePolicyFromConfigObject(policy);
    return wsPolicy;
  };

  const getRootPolicy = () => {
    const pkgJsonPolicy = getWorkspacePolicyFromPackageJson();
    const configMergePolicy = getWorkspacePolicyFromMergeConfig();
    return dependencyResolver.mergeWorkspacePolices([pkgJsonPolicy, configMergePolicy]);
  };

  dependencyResolver.registerRootPolicy(getRootPolicy());

  consumer.onCacheClear.push(() => workspace.clearCache());

  LegacyComponentLoader.registerOnComponentLoadSubscriber(
    async (legacyComponent: ConsumerComponent, opts?: { loadDocs?: boolean }) => {
      const id = await workspace.resolveComponentId(legacyComponent.id);
      const newComponent = await workspace.get(id, legacyComponent, true, true, opts);
      return newComponent.state._consumer;
    }
  );

  LegacyDependencyResolver.registerOnComponentAutoDetectOverridesGetter(
    async (configuredExtensions: ExtensionDataList, id: BitId, legacyFiles: SourceFile[]) => {
      let policy = await dependencyResolver.mergeVariantPolicies(configuredExtensions, id, legacyFiles);
      const depsDataOfMergeConfig = workspace.getDepsDataOfMergeConfig(id);
      if (depsDataOfMergeConfig) {
        const policiesFromMergeConfig = VariantPolicy.fromConfigObject(depsDataOfMergeConfig, 'auto');
        policy = VariantPolicy.mergePolices([policy, policiesFromMergeConfig]);
      }
      return policy.toLegacyAutoDetectOverrides();
    }
  );

  LegacyDependencyResolver.registerOnComponentAutoDetectConfigMergeGetter((id: BitId) => {
    const depsDataOfMergeConfig = workspace.getDepsDataOfMergeConfig(id);
    if (depsDataOfMergeConfig) {
      const policy = VariantPolicy.fromConfigObject(depsDataOfMergeConfig, 'auto');
      return policy.toLegacyAutoDetectOverrides();
    }
    return undefined;
  });

  ConsumerComponent.registerOnComponentConfigLoading(EXT_NAME, async (id) => {
    const componentId = await workspace.resolveComponentId(id);
    // We call here directly workspace.scope.get instead of workspace.get because part of the workspace get is loading consumer component
    // which in turn run this event, which will make an infinite loop
    // This component from scope here are only used for merging the extensions with the workspace components
    const componentFromScope = await workspace.scope.get(componentId);
    const { extensions } = await workspace.componentExtensions(componentId, componentFromScope);
    const defaultScope = await workspace.componentDefaultScope(componentId);

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

  const workspaceSchema = getWorkspaceSchema(workspace, graphql);
  ui.registerUiRoot(new WorkspaceUIRoot(workspace, bundler));
  graphql.register(workspaceSchema);
  const capsuleCmd = new CapsuleCmd();
  capsuleCmd.commands = [
    new CapsuleListCmd(isolator, workspace),
    new CapsuleCreateCmd(workspace, isolator),
    new CapsuleDeleteCmd(isolator, workspace),
  ];
  const commands: CommandList = [new EjectConfCmd(workspace), capsuleCmd, new UseCmd(workspace)];

  commands.push(new PatternCommand(workspace));
  cli.register(...commands);
  component.registerHost(workspace);

  cli.registerOnStart(async () => {
    await workspace.importCurrentLaneIfMissing();
    const aspects = await workspace.loadAspects(
      aspectLoader.getNotLoadedConfiguredExtensions(),
      undefined,
      'workspace.cli.registerOnStart'
    );
    // clear aspect cache.
    const componentIds = await workspace.resolveMultipleComponentIds(aspects);
    componentIds.forEach((id) => {
      workspace.clearComponentCache(id);
    });
  });

  // add sub-commands "set" and "unset" to envs command.
  const envsCommand = cli.getCommand('envs');
  envsCommand?.commands?.push(new EnvsSetCmd(workspace)); // bit envs set
  envsCommand?.commands?.push(new EnvsUnsetCmd(workspace)); // bit envs unset
  envsCommand?.commands?.push(new EnvsReplaceCmd(workspace)); // bit envs replace
  envsCommand?.commands?.push(new EnvsUpdateCmd(workspace)); // bit envs replace

  // add sub-command "set" to scope command.
  const scopeCommand = cli.getCommand('scope');
  scopeCommand?.commands?.push(new ScopeSetCmd(workspace));

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
