import { flatten } from 'lodash';
import { ArtifactVinyl } from 'bit-bin/dist/consumer/component/sources/artifact';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { AspectList, Component, ComponentAspect, ComponentID, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { IsolateComponentsOptions } from '@teambit/isolator';
import { OnTagOpts } from 'bit-bin/dist/scope/scope';
import { ArtifactObject } from 'bit-bin/dist/consumer/component/sources/artifact-files';
import { ArtifactList } from './artifact';
import { ArtifactFactory } from './artifact/artifact-factory'; // it gets undefined when importing it from './artifact'
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import { BuilderService } from './builder.service';
import { BuilderCmd } from './build.cmd';
import { BuildTask } from './build-task';
import { StorageResolver } from './storage';
import { TaskResults } from './build-pipe';
import { TaskResultsList } from './task-results-list';
import { ArtifactStorageError } from './exceptions';
import { BuildPipelineResultList } from './build-pipeline-result-list';

export type TaskSlot = SlotRegistry<BuildTask[]>;

export type StorageResolverSlot = SlotRegistry<StorageResolver>;

export class BuilderMain {
  constructor(
    private envs: EnvsMain,
    private workspace: Workspace,
    private buildService: BuilderService,
    private deployService: BuilderService,
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
    private buildTaskSlot: TaskSlot,
    private deployTaskSlot: TaskSlot,
    private storageResolversSlot: StorageResolverSlot
  ) {}

  private async storeArtifacts(tasksResults: TaskResults[]) {
    const artifacts: ComponentMap<ArtifactList>[] = tasksResults.map(
      (taskResult) => taskResult.artifacts as ComponentMap<ArtifactList>
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
    buildPipelineResults: TaskResults[]
  ): ComponentMap<AspectList> {
    const buildPipelineResultList = new BuildPipelineResultList(buildPipelineResults, components);
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
      const artifactsData = buildPipelineResultList.getArtifactsDataOfComponent(component.id);
      buildAspectEntry.data = { pipeline: pipelineReport, artifacts: artifactsData };
      return aspectList;
    });
  }

  async tagListener(components: Component[], options: OnTagOpts = {}): Promise<ComponentMap<AspectList>> {
    const envsExecutionResults = await this.build(components, { emptyRootDir: true });
    envsExecutionResults.throwErrorsIfExist();
    const allTasksResults = [...envsExecutionResults.tasksResults];
    if (!options.disableDeployPipeline) {
      const deployEnvsExecutionResults = await this.deploy(components);
      deployEnvsExecutionResults.throwErrorsIfExist();
      allTasksResults.push(...deployEnvsExecutionResults.tasksResults);
    }
    await this.storeArtifacts(allTasksResults);
    const aspectList = this.pipelineResultsToAspectList(components, allTasksResults);
    return aspectList;
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

  // TODO: merge with getArtifactsVinylByExtensionAndName by getting aspect name and name as object with optional props
  async getArtifactsVinylByExtension(component: Component, aspectName: string): Promise<ArtifactVinyl[]> {
    const artifactsObjects = this.getArtifactsByExtension(component, aspectName);
    const vinyls = await Promise.all(
      (artifactsObjects || []).map((artifactObject) =>
        artifactObject.files.getVinylsAndImportIfMissing(component.id.scope as string, this.scope.legacyScope)
      )
    );
    return flatten(vinyls);
  }

  async getArtifactsVinylByExtensionAndName(
    component: Component,
    aspectName: string,
    name: string
  ): Promise<ArtifactVinyl[]> {
    const artifactsObjects = this.getArtifactsByExtensionAndName(component, aspectName, name);
    const vinyls = await Promise.all(
      (artifactsObjects || []).map((artifactObject) =>
        artifactObject.files.getVinylsAndImportIfMissing(component.id.scope as string, this.scope.legacyScope)
      )
    );
    return flatten(vinyls);
  }

  getArtifactsByName(component: Component, name: string): ArtifactObject[] | undefined {
    const artifacts = this.getArtifacts(component);
    return artifacts?.filter((artifact) => artifact.name === name);
  }

  getArtifactsByExtension(component: Component, aspectName: string): ArtifactObject[] | undefined {
    const artifacts = this.getArtifacts(component);
    return artifacts?.filter((artifact) => artifact.task.id === aspectName);
  }

  getArtifactsByExtensionAndName(component: Component, aspectName: string, name: string): ArtifactObject[] | undefined {
    const artifacts = this.getArtifacts(component);
    return artifacts?.filter((artifact) => artifact.task.id === aspectName && artifact.name === name);
  }

  private getArtifacts(component: Component): ArtifactObject[] | undefined {
    const dataEntry = component.state.aspects.get(BuilderAspect.id);
    return dataEntry?.data.artifacts;
  }

  /**
   * build given components for release.
   * for each one of the envs it runs a series of tasks.
   * in case of an error in a task, it stops the execution of that env and continue to the next
   * env. at the end, the results contain the data and errors per env.
   */
  async build(components: Component[], isolateOptions?: IsolateComponentsOptions): Promise<TaskResultsList> {
    const idsStr = components.map((c) => c.id.toString());
    const network = await this.workspace.createNetwork(idsStr, isolateOptions);
    const envs = await this.envs.createEnvironment(network.graphCapsules.getAllComponents());
    const buildResult = await envs.runOnce(this.buildService);
    return buildResult;
  }

  async deploy(components: Component[]): Promise<TaskResultsList> {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.runOnce(this.deployService);

    return buildResult;
  }

  /**
   * register a build task to apply on all component build pipelines.
   * build happens on `bit build` and as part of `bit tag --persist`.
   */
  registerBuildTasks(tasks: BuildTask[]) {
    this.buildTaskSlot.register(tasks);
    return this;
  }

  /**
   * deploy task that doesn't get executed on `bit build`, only on `bit tag --persist'.
   * the deploy-pipeline is running once the build-pipeline has completed.
   */
  registerDeployTasks(tasks: BuildTask[]) {
    this.deployTaskSlot.register(tasks);
    return this;
  }

  static slots = [Slot.withType<BuildTask>(), Slot.withType<StorageResolver>(), Slot.withType<BuildTask>()];

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
    [buildTaskSlot, storageResolversSlot, deployTaskSlot]: [TaskSlot, StorageResolverSlot, TaskSlot]
  ) {
    const artifactFactory = new ArtifactFactory(storageResolversSlot);
    const logger = loggerExt.createLogger(BuilderAspect.id);
    const buildService = new BuilderService(workspace, logger, buildTaskSlot, 'getBuildPipe', 'build', artifactFactory);
    envs.registerService(buildService);
    const deployService = new BuilderService(
      workspace,
      logger,
      deployTaskSlot,
      'getDeployPipe',
      'deploy',
      artifactFactory
    );
    const builder = new BuilderMain(
      envs,
      workspace,
      buildService,
      deployService,
      scope,
      aspectLoader,
      buildTaskSlot,
      deployTaskSlot,
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
