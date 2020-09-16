import { flatten } from 'lodash';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { AspectList, Component, ComponentAspect, ComponentID, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain, EnvsExecutionResult } from '@teambit/environments';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { IsolateComponentsOptions } from '@teambit/isolator';
import { ArtifactList, ExtensionArtifact } from './artifact';
import { ArtifactFactory } from './artifact/artifact-factory'; // it gets undefined when importing it from './artifact'
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import { BuilderService, BuildServiceResults } from './builder.service';
import { BuilderCmd } from './build.cmd';
import { BuildTask } from './build-task';
import { StorageResolver } from './storage';
import { BuildPipeResults } from './build-pipe';
import { ArtifactStorageError } from './exceptions';
import { BuildPipelineResultList } from './build-pipeline-result-list';

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
    const artifacts: ComponentMap<ArtifactList>[] = flatten(
      buildServiceResults.map((pipeResult) => {
        return pipeResult.tasksResults.map((val) => val.artifacts);
      })
    );

    const storeP = artifacts.map(async (artifactMap: ComponentMap<ArtifactList>) => {
      return Promise.all(
        artifactMap.toArray().map(async ([component, artifactList]) => {
          try {
            return await artifactList.store(component);
          } catch (err) {
            throw new ArtifactStorageError(err, component);
          }
        })
      );
    });
    await Promise.all(storeP);
  }

  private pipelineResultsToAspectList(
    components: Component[],
    buildPipelineResults: BuildPipeResults[]
  ): ComponentMap<AspectList> {
    const buildPipelineResultList = new BuildPipelineResultList(buildPipelineResults);
    return ComponentMap.as<AspectList>(components, (component) => {
      const taskResultsOfComponent = buildPipelineResultList.getMetadataFromTaskResults(component.id);
      const aspectList = component.state.aspects.map((aspectEntry) => {
        const dataFromBuildPipeline = taskResultsOfComponent[aspectEntry.id.toString()];
        const newAspectEntry = dataFromBuildPipeline ? aspectEntry.transform(dataFromBuildPipeline) : aspectEntry;
        return newAspectEntry;
      });
      Object.keys(taskResultsOfComponent).forEach((taskId) => {
        const taskComponentId = ComponentID.fromString(taskId);
        if (!component.state.aspects.find(taskComponentId)) {
          const dataFromBuildPipeline = taskResultsOfComponent[taskId];
          aspectList.addEntry(taskComponentId, dataFromBuildPipeline);
        }
      });
      const buildId = BuilderAspect.id;
      const buildAspectEntry = aspectList.get(buildId) || aspectList.addEntry(ComponentID.fromString(buildId));
      const pipelineReport = buildPipelineResultList.getPipelineReportOfComponent(component.id);
      buildAspectEntry.data = { pipeline: pipelineReport };
      return aspectList;
    });
  }

  /**
   * transform the complex EnvsExecutionResult<BuildServiceResults> type to a simpler array of
   * BuildPipeResults. as a reminder, the build pipeline is running per env, hence the array. each
   * item of BuildPipeResults has the results of multiple tasks.
   */
  private getPipelineResults(execResults: EnvsExecutionResult<BuildServiceResults>): BuildPipeResults[] {
    const map = execResults.results.map((envRes) => envRes.data?.buildResults);
    return map.filter((val) => val) as BuildPipeResults[];
  }

  async tagListener(components: Component[]): Promise<ComponentMap<AspectList>> {
    this.tagTasks.forEach((task) => this.registerTask(task));
    // @todo: some processes needs dependencies/dependents of the given ids
    const envsExecutionResults = await this.build(components, { emptyExisting: true });
    envsExecutionResults.throwErrorsIfExist();
    const buildPipelineResults = this.getPipelineResults(envsExecutionResults);
    await this.storeArtifacts(buildPipelineResults);
    return this.pipelineResultsToAspectList(components, buildPipelineResults);
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
