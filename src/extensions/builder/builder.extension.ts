import { Slot, SlotRegistry } from '@teambit/harmony';
import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { BuilderCmd } from './run.cmd';
import { Component, ComponentID, ComponentExtension } from '../component';
import { BuilderService } from './builder.service';
import { BitId } from '../../bit-id';
import { ScopeExtension } from '../scope';
import { CLIExtension } from '../cli';
import { LoggerExtension } from '../logger';
import { ExtensionArtifact } from './artifact';
import { CoreExt, Core } from '../core';
import { GraphQLExtension } from '../graphql';
import { builderSchema } from './builder.graphql';
import { BuildTask } from './types';
import { TagCmd } from './tag.cmd';

export type TaskSlot = SlotRegistry<BuildTask>;

/**
 * extension config type.
 */
export type BuilderConfig = {
  /**
   * number of components to build in parallel.
   */
  parallel: 10;
};

export class BuilderExtension {
  static id = '@teambit/builder';

  constructor(
    /**
     * environments extension.
     */
    private envs: Environments,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * builder service.
     */
    private service: BuilderService,

    /**
     * scope extension
     */
    private scope: ScopeExtension,

    /**
     * core extension.
     */
    private core: Core,

    /**
     * slot for registering build tasks.
     */
    private taskSlot: TaskSlot
  ) {}

  async tagListener(ids: BitId[]) {
    // @todo: some processes needs dependencies/dependents of the given ids
    const componentIds = ids.map(ComponentID.fromLegacy);
    const components = await this.workspace.getMany(componentIds);
    return this.build(components);
  }

  /**
   * build given components for release.
   */
  async build(components: Component[]) {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.run(this.service);
    return buildResult;
  }

  /**
   * register a build task to apply on all component build pipelines.
   */
  registerTask(task: BuildTask) {
    this.taskSlot.register(task);
    return this;
  }

  /**
   * return a list of artifacts for the given hash and component id.
   */
  async getArtifacts(id: ComponentID, hash: string): Promise<ExtensionArtifact[]> {
    const component = await this.scope.getOrThrow(id);
    const state = await component.loadState(hash);
    const extensionArtifacts = state.config.extensions.map((extensionData) => {
      return new ExtensionArtifact(
        // @ts-ignore TODO: remove when @david fixes `extensionData.artifacts` to be abstract vinyl only.
        extensionData.artifacts,
        this.core.getDescriptor(extensionData.id.toString())
      );
    });

    return extensionArtifacts;
  }

  static slots = [Slot.withType<BuildTask>()];

  static dependencies = [
    CLIExtension,
    Environments,
    WorkspaceExt,
    ScopeExtension,
    LoggerExtension,
    CoreExt,
    GraphQLExtension,
    ComponentExtension,
  ];

  static async provider(
    [cli, envs, workspace, scope, loggerExt, core, graphql]: [
      CLIExtension,
      Environments,
      Workspace,
      ScopeExtension,
      LoggerExtension,
      Core,
      GraphQLExtension
    ],
    config,
    [taskSlot]: [TaskSlot]
  ) {
    const logger = loggerExt.createLogger(BuilderExtension.id);
    const builderService = new BuilderService(workspace, logger, taskSlot);
    const builder = new BuilderExtension(envs, workspace, builderService, scope, core, taskSlot);
    graphql.register(builderSchema(builder));
    const func = builder.tagListener.bind(builder);
    if (scope) scope.onTag(func);

    cli.register(new BuilderCmd(builder, workspace, logger));
    cli.register(new TagCmd(logger));
    return builder;
  }
}
