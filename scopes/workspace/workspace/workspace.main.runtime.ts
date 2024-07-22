import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { CLIAspect, MainRuntime, CLIMain, CommandList, Command } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, Harmony, SlotRegistry } from '@teambit/harmony';
import { IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { UIAspect, UiMain } from '@teambit/ui';
import { VariantsAspect } from '@teambit/variants';
import { GlobalConfigAspect, GlobalConfigMain } from '@teambit/global-config';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import type { ComponentMain, Component } from '@teambit/component';
import type { VariantsMain } from '@teambit/variants';
import { Consumer, loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import type { ComponentConfigLoadOptions } from '@teambit/legacy/dist/consumer/config';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import LegacyComponentLoader, { ComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import { ComponentID } from '@teambit/component-id';
import { EXT_NAME } from './constants';
import { OnComponentAdd, OnComponentChange, OnComponentRemove, OnComponentLoad } from './on-component-events';
import { WorkspaceAspect } from './workspace.aspect';
import EjectConfCmd from './eject-conf.cmd';
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
import { UnuseCmd } from './unuse.cmd';
import { LocalOnlyCmd, LocalOnlyListCmd, LocalOnlySetCmd, LocalOnlyUnsetCmd } from './commands/local-only-cmd';

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
  EnvsMain,
  GlobalConfigMain
];

export type OnComponentLoadSlot = SlotRegistry<OnComponentLoad>;

export type OnComponentChangeSlot = SlotRegistry<OnComponentChange>;

export type OnComponentAddSlot = SlotRegistry<OnComponentAdd>;

export type OnComponentRemoveSlot = SlotRegistry<OnComponentRemove>;

export type OnBitmapChange = () => Promise<void>;
export type OnBitmapChangeSlot = SlotRegistry<OnBitmapChange>;

export type OnWorkspaceConfigChange = () => Promise<void>;
export type OnWorkspaceConfigChangeSlot = SlotRegistry<OnWorkspaceConfigChange>;

export type OnAspectsResolve = (aspectsComponents: Component[]) => Promise<void>;
export type OnAspectsResolveSlot = SlotRegistry<OnAspectsResolve>;

export type OnRootAspectAdded = (aspectsId: ComponentID, inWs: boolean) => Promise<void>;
export type OnRootAspectAddedSlot = SlotRegistry<OnRootAspectAdded>;

export class WorkspaceMain {
  static runtime = MainRuntime;
  static dependencies = [
    PubsubAspect,
    CLIAspect,
    ScopeAspect,
    ComponentAspect,
    IsolatorAspect,
    DependencyResolverAspect,
    VariantsAspect,
    LoggerAspect,
    GraphqlAspect,
    UIAspect,
    BundlerAspect,
    AspectLoaderAspect,
    EnvsAspect,
    GlobalConfigAspect,
  ];
  static slots = [
    Slot.withType<OnComponentLoad>(),
    Slot.withType<OnComponentChange>(),
    Slot.withType<OnComponentAdd>(),
    Slot.withType<OnComponentRemove>(),
    Slot.withType<OnAspectsResolve>(),
    Slot.withType<OnRootAspectAdded>(),
    Slot.withType<OnBitmapChange>(),
    Slot.withType<OnWorkspaceConfigChange>(),
  ];
  static async provider(
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
      globalConfig,
    ]: WorkspaceDeps,
    config: WorkspaceExtConfig,
    [
      onComponentLoadSlot,
      onComponentChangeSlot,
      onComponentAddSlot,
      onComponentRemoveSlot,
      onAspectsResolveSlot,
      onRootAspectAddedSlot,
      onBitmapChangeSlot,
      onWorkspaceConfigChangeSlot,
    ]: [
      OnComponentLoadSlot,
      OnComponentChangeSlot,
      OnComponentAddSlot,
      OnComponentRemoveSlot,
      OnAspectsResolveSlot,
      OnRootAspectAddedSlot,
      OnBitmapChangeSlot,
      OnWorkspaceConfigChangeSlot
    ],
    harmony: Harmony
  ) {
    const currentCmd = process.argv[2];
    if (currentCmd === 'init') {
      // avoid loading the consumer/workspace for "bit init". otherwise, "bit init --reset" can't fix corrupted .bitmap
      return undefined;
    }
    const bitConfig: any = harmony.config.get('teambit.harmony/bit');
    const consumer = await getConsumer(bitConfig.cwd);
    if (!consumer) {
      const capsuleCmd = getCapsulesCommands(isolator, scope, undefined);
      cli.register(capsuleCmd);
      return undefined;
    }
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
      globalConfig,
      onComponentAddSlot,
      onComponentRemoveSlot,
      onAspectsResolveSlot,
      onRootAspectAddedSlot,
      graphql,
      onBitmapChangeSlot,
      onWorkspaceConfigChangeSlot
    );

    const configMergeFile = workspace.getConflictMergeFile();
    await configMergeFile.loadIfNeeded();

    const getWorkspacePolicyFromPackageJson = () => {
      const packageJson = workspace.consumer.packageJson?.packageJsonObject || {};
      const policyFromPackageJson = dependencyResolver.getWorkspacePolicyFromPackageJson(packageJson);
      return policyFromPackageJson;
    };

    /**
     * @deprecated
     * see workspace.getWorkspaceJsonConflictFromMergeConfig
     */
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
      async (legacyComponent: ConsumerComponent, opts?: ComponentLoadOptions) => {
        if (opts?.originatedFromHarmony) return legacyComponent;
        const id = legacyComponent.id;
        const newComponent = await workspace.get(id, legacyComponent, true, true, opts);
        return newComponent.state._consumer;
      }
    );

    ConsumerComponent.registerOnComponentConfigLoading(EXT_NAME, async (id, loadOpts: ComponentConfigLoadOptions) => {
      const componentId = await workspace.resolveComponentId(id);
      // We call here directly workspace.scope.get instead of workspace.get because part of the workspace get is loading consumer component
      // which in turn run this event, which will make an infinite loop
      // This component from scope here are only used for merging the extensions with the workspace components
      const componentFromScope = await workspace.scope.get(componentId);
      const { extensions } = await workspace.componentExtensions(componentId, componentFromScope, undefined, loadOpts);
      const defaultScope = await workspace.componentDefaultScope(componentId);

      const extensionsWithLegacyIdsP = extensions.map(async (extension) => {
        const legacyEntry = extension.clone();
        if (legacyEntry.extensionId) {
          legacyEntry.newExtensionId = legacyEntry.extensionId;
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
    ui.registerPreStart(async () => {
      return workspace.setComponentPathsRegExps();
    });
    graphql.register(workspaceSchema);
    const capsuleCmd = getCapsulesCommands(isolator, scope, workspace);
    const commands: CommandList = [
      new EjectConfCmd(workspace),
      capsuleCmd,
      new UseCmd(workspace),
      new UnuseCmd(workspace),
    ];

    commands.push(new PatternCommand(workspace));
    const localOnlyCmd = new LocalOnlyCmd();
    localOnlyCmd.commands = [
      new LocalOnlySetCmd(workspace),
      new LocalOnlyUnsetCmd(workspace),
      new LocalOnlyListCmd(workspace),
    ];
    commands.push(localOnlyCmd);
    cli.register(...commands);
    component.registerHost(workspace);

    cli.registerOnStart(async (_hasWorkspace: boolean, currentCommand: string, commandObject?: Command) => {
      const hasSafeModeFlag = process.argv.includes('--safe-mode');
      if (hasSafeModeFlag || (commandObject && !commandObject.loadAspects)) {
        return;
      }
      if (currentCommand === 'install') {
        workspace.inInstallContext = true;
      }
      await workspace.importCurrentLaneIfMissing();
      logger.profile('workspace.registerOnStart');
      const loadAspectsOpts = {
        runSubscribers: false,
        skipDeps: !config.autoLoadAspectsDeps,
      };
      const aspects = await workspace.loadAspects(
        aspectLoader.getNotLoadedConfiguredExtensions(),
        undefined,
        'teambit.workspace/workspace (cli.registerOnStart)',
        loadAspectsOpts
      );
      // clear aspect cache.
      const componentIds = await workspace.resolveMultipleComponentIds(aspects);
      componentIds.forEach((id) => {
        workspace.clearComponentCache(id);
      });
      logger.profile('workspace.registerOnStart');
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
  static defineRuntime = 'browser';
}

function getCapsulesCommands(isolator: IsolatorMain, scope: ScopeMain, workspace?: Workspace) {
  const capsuleCmd = new CapsuleCmd(isolator, workspace, scope);
  capsuleCmd.commands = [
    new CapsuleListCmd(isolator, workspace, scope),
    new CapsuleCreateCmd(workspace, scope, isolator),
    new CapsuleDeleteCmd(isolator, scope, workspace),
  ];
  return capsuleCmd;
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

WorkspaceAspect.addRuntime(WorkspaceMain);

export default WorkspaceMain;
