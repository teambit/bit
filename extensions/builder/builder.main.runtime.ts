import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BitId } from 'bit-bin/dist/bit-id';

import { ExtensionArtifact } from './artifact';
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import { BuilderService } from './builder.service';
import { BuilderCmd } from './run.cmd';
import { BuildTask } from './types';

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
    private envs: EnvsMain,
    private workspace: Workspace,
    private service: BuilderService,
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
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
        this.aspectLoader.getDescriptor(extensionData.id.toString())
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
    AspectLoaderAspect,
    GraphqlAspect,
    ComponentAspect,
  ];

  static async provider(
    [cli, envs, workspace, scope, loggerExt, aspectLoader, graphql]: [
      CLIMain,
      EnvsMain,
      Workspace,
      ScopeMain,
      LoggerMain,
      AspectLoaderMain,
      GraphqlMain
    ],
    config,
    [taskSlot]: [TaskSlot]
  ) {
    const logger = loggerExt.createLogger(BuilderAspect.id);
    const builderService = new BuilderService(workspace, logger, taskSlot);
    const builder = new BuilderMain(envs, workspace, builderService, scope, aspectLoader, taskSlot);
    graphql.register(builderSchema(builder));
    const func = builder.tagListener.bind(builder);
    if (scope) scope.onTag(func);
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('build');
      cli.register(new BuilderCmd(builder, workspace, logger));
    }
    return builder;
  }
}

BuilderAspect.addRuntime(BuilderMain);
