import { Slot, SlotRegistry } from '@teambit/harmony';
import { BuilderAspect } from './builder.aspect';
import { MainRuntime, CLIAspect } from '../cli/cli.aspect';
import { EnvsAspect, EnvsMain } from '../environments';
import { Workspace, WorkspaceAspect } from '../workspace';
import { BuilderCmd } from './run.cmd';
import { Component, ComponentID, ComponentAspect } from '../component';
import { BuilderService } from './builder.service';
import { BitId } from '../../bit-id';
import { CLIMain } from '../cli';
import { ExtensionArtifact } from './artifact';
import { Core, CoreAspect } from '../core';
import { GraphqlAspect, GraphqlMain } from '../graphql';
import { builderSchema } from './builder.graphql';
import { BuildTask } from './types';
import { TagCmd } from './tag.cmd';
import { ScopeMain, ScopeAspect } from '../scope';
import { LoggerAspect, LoggerMain } from '../logger';

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

export class BuilderMain {
  constructor(
    /**
     * environments extension.
     */
    private envs: EnvsMain,

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
    private scope: ScopeMain,

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

  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    EnvsAspect,
    WorkspaceAspect,
    ScopeAspect,
    LoggerAspect,
    CoreAspect,
    GraphqlAspect,
    ComponentAspect,
  ];

  static async provider(
    [cli, envs, workspace, scope, loggerExt, core, graphql]: [
      CLIMain,
      EnvsMain,
      Workspace,
      ScopeMain,
      LoggerMain,
      Core,
      GraphqlMain
    ],
    config,
    [taskSlot]: [TaskSlot]
  ) {
    const logger = loggerExt.createLogger(BuilderAspect.id);
    const builderService = new BuilderService(workspace, logger, taskSlot);
    const builder = new BuilderMain(envs, workspace, builderService, scope, core, taskSlot);
    graphql.register(builderSchema(builder));
    const func = builder.tagListener.bind(builder);
    if (scope) scope.onTag(func);
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('build');
      cli.register(new BuilderCmd(builder, workspace, logger));
    }
    cli.register(new TagCmd(logger));
    return builder;
  }
}

BuilderAspect.addRuntime(BuilderMain);
