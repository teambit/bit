import { flatten } from 'lodash';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain, EnvsExecutionResult } from '@teambit/environments';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { IsolateComponentsOptions } from '@teambit/isolator';
import { ArtifactFactory, ExtensionArtifact } from './artifact';
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import { BuilderService, BuildServiceResults } from './builder.service';
import { BuilderCmd } from './build.cmd';
import { BuildTask } from './build-task';
import { StorageResolver } from './storage';
import { BuildPipeResults } from './build-pipe';
import { ArtifactStorageError } from './exceptions';

export type TaskSlot = SlotRegistry<BuildTask>;

export type StorageResolverSlot = SlotRegistry<StorageResolver>;

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
  tagTasks: BuildTask[] = [];
  constructor(
    private envs: EnvsMain,
    private workspace: Workspace,
    private service: BuilderService,
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
    private taskSlot: TaskSlot,
    private storageResolversSlot: StorageResolverSlot
  ) {}

  private async storeArtifacts(buildServiceResults: BuildPipeResults[]) {
    const artifacts = flatten(
      buildServiceResults.map((pipeResult) => {
        return pipeResult.results.map((val) => val.artifacts);
      })
    );

    return artifacts.map((artifactMap) =>
      artifactMap.toArray().forEach(([component, artifactList]) => {
        try {
          return artifactList.store(component);
        } catch (err) {
          throw new ArtifactStorageError(err, component);
        }
      })
    );
  }

  private getPipelineResults(execResults: EnvsExecutionResult<BuildServiceResults>): BuildPipeResults[] {
    const map = execResults.results.map((envRes) => envRes.data?.buildResults);
    return map.filter((val) => !!val) as BuildPipeResults[];
  }

  async tagListener(components: Component[]): Promise<EnvsExecutionResult<BuildServiceResults>> {
    this.tagTasks.forEach((task) => this.registerTask(task));
    // @todo: some processes needs dependencies/dependents of the given ids
    const envsExecutionResults = await this.build(components, { emptyExisting: true });
    envsExecutionResults.throwErrorsIfExist();
    const buildServiceResults = this.getPipelineResults(envsExecutionResults);
    this.storeArtifacts(buildServiceResults);

    const data = components.map((component) => {
      return component.state.aspects.map((entry) => {
        entry.data = data;
        return entry;
      });
    });
    // TODO: make sure to replace this value returned to the legacy with a more simple and standard one.
    return data;
  }

  /**
   * register a new storage resolver.
   */
  registerStorageResolver(storageResolver: StorageResolver) {
    this.storageResolversSlot.register(storageResolver);
    return this;
  }

  /**
   * get storage resolver by name. otherwise, returns default.
   */
  getStorageResolver(name: string): StorageResolver | undefined {
    return this.storageResolversSlot.values().find((storageResolver) => storageResolver.name === name);
  }

  /**
   * build given components for release.
   * for each one of the envs it runs a series of tasks.
   * in case of an error in a task, it stops the execution of that env and continue to the next
   * env. at the end, the results contain the data and errors per env.
   */
  async build(
    components: Component[],
    isolateOptions?: IsolateComponentsOptions
  ): Promise<EnvsExecutionResult<BuildServiceResults>> {
    const idsStr = components.map((c) => c.id.toString());
    await this.workspace.createNetwork(idsStr, isolateOptions);
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.run(this.service);

    return buildResult;
  }

  /**
   * register a build task to apply on all component build pipelines.
   * build happens on `bit build` and as part of `bit tag --persist`.
   */
  registerTask(task: BuildTask) {
    this.taskSlot.register(task);
    return this;
  }

  /**
   * build task that doesn't get executed on `bit build`, only on `bit tag --persist'
   */
  registerTaskOnTagOnly(task: BuildTask) {
    this.tagTasks.push(task);
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

  static slots = [Slot.withType<BuildTask>(), Slot.withType<StorageResolver>()];

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
    [taskSlot, storageResolversSlot]: [TaskSlot, StorageResolverSlot]
  ) {
    const artifactFactory = new ArtifactFactory(storageResolversSlot);
    const logger = loggerExt.createLogger(BuilderAspect.id);
    const builderService = new BuilderService(workspace, logger, taskSlot, artifactFactory);
    const builder = new BuilderMain(
      envs,
      workspace,
      builderService,
      scope,
      aspectLoader,
      taskSlot,
      storageResolversSlot
    );

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
