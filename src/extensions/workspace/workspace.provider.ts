import { Harmony, SlotRegistry } from '@teambit/harmony';
import { ScopeExtension } from '../scope';
import { Workspace } from './workspace';
import { ComponentExtension } from '../component';
import { loadConsumerIfExist, Consumer } from '../../consumer';
import { IsolatorExtension } from '../isolator';
import { LoggerExtension } from '../logger';
import ConsumerComponent from '../../consumer/component';
import { DependencyResolverExtension } from '../dependency-resolver';
import { Variants } from '../variants';
import { WorkspaceExtConfig } from './types';
import { GraphQLExtension } from '../graphql';
import getWorkspaceSchema from './workspace.graphql';
import InstallCmd from './install.cmd';
import { CLIExtension } from '../cli';
import EjectConfCmd from './eject-conf.cmd';
import { UIExtension } from '../ui';
import { WorkspaceUIRoot } from './workspace.ui-root';
import { BundlerExtension } from '../bundler';
import { CapsuleListCmd } from './capsule-list.cmd';
import { CapsuleCreateCmd } from './capsule-create.cmd';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange } from './on-component-change';
import { WatchCommand } from './watch/watch.cmd';
import { Watcher } from './watch/watcher';

export type WorkspaceDeps = [
  CLIExtension,
  ScopeExtension,
  ComponentExtension,
  IsolatorExtension,
  DependencyResolverExtension,
  Variants,
  LoggerExtension,
  GraphQLExtension,
  UIExtension,
  BundlerExtension
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
  [cli, scope, component, isolator, dependencyResolver, variants, logger, graphql, ui, bundler]: WorkspaceDeps,
  config: WorkspaceExtConfig,
  [onComponentLoadSlot, onComponentChangeSlot]: [OnComponentLoadSlot, OnComponentChangeSlot],
  harmony: Harmony
) {
  const consumer = await getConsumer();
  if (!consumer) return undefined;

  const workspace = new Workspace(
    config,
    consumer,
    scope,
    component,
    isolator,
    dependencyResolver,
    variants,
    logger.createLogger('workspace'), // TODO: get the 'worksacpe' name in a better way
    undefined,
    harmony,
    onComponentLoadSlot,
    onComponentChangeSlot
  );

  ConsumerComponent.registerOnComponentConfigLoading('workspace', async (id) => {
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
  cli.register(new InstallCmd(workspace));
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
