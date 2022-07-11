import { flatten } from 'lodash';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ScopeAspect, ScopeMain, OnTagResults } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { IsolateComponentsOptions, IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { OnTagOpts } from '@teambit/legacy/dist/scope/scope';
import findDuplications from '@teambit/legacy/dist/utils/array/find-duplications';
import { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { ArtifactList } from './artifact';
import { ArtifactFactory } from './artifact/artifact-factory'; // it gets undefined when importing it from './artifact'
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import { BuilderService, BuilderServiceOptions } from './builder.service';
import { BuilderCmd } from './build.cmd';
import { BuildTask, BuildTaskHelper } from './build-task';
import { TaskResults } from './build-pipe';
import { TaskResultsList } from './task-results-list';
import { ArtifactStorageError } from './exceptions';
import { BuildPipelineResultList, AspectData, PipelineReport } from './build-pipeline-result-list';
import { Serializable } from './types';
import { ArtifactsCmd } from './artifact/artifacts.cmd';
import { buildTaskTemplate } from './templates/build-task';

export type TaskSlot = SlotRegistry<BuildTask[]>;

export type BuilderData = {
  pipeline: PipelineReport[];
  artifacts: ArtifactObject[] | undefined;
  aspectsData: AspectData[];
};

export class BuilderMain {
  constructor(
    private envs: EnvsMain,
    private workspace: Workspace,
    private buildService: BuilderService,
    private tagService: BuilderService,
    private snapService: BuilderService,
    private scope: ScopeMain,
    private isolator: IsolatorMain,
    private aspectLoader: AspectLoaderMain,
    private buildTaskSlot: TaskSlot,
    private tagTaskSlot: TaskSlot,
    private snapTaskSlot: TaskSlot
  ) {}

  private async storeArtifacts(tasksResults: TaskResults[]) {
    const artifacts = tasksResults.flatMap((t) => (t.artifacts ? [t.artifacts] : []));
    const storeP = artifacts.map(async (artifactMap: ComponentMap<ArtifactList>) => {
      return Promise.all(
        artifactMap.toArray().map(async ([component, artifactList]) => {
          try {
            return await artifactList.store(component);
          } catch (err: any) {
            throw new ArtifactStorageError(err, component);
          }
        })
      );
    });
    await Promise.all(storeP);
  }

  private pipelineResultsToBuilderData(
    components: Component[],
    buildPipelineResults: TaskResults[]
  ): ComponentMap<BuilderData> {
    const buildPipelineResultList = new BuildPipelineResultList(buildPipelineResults, components);
    return ComponentMap.as<BuilderData>(components, (component) => {
      const aspectsData = buildPipelineResultList.getDataOfComponent(component.id);
      const pipelineReport = buildPipelineResultList.getPipelineReportOfComponent(component.id);
      const artifactsData = buildPipelineResultList.getArtifactsDataOfComponent(component.id);
      return { pipeline: pipelineReport, artifacts: artifactsData, aspectsData };
    });
  }

  async tagListener(
    components: Component[],
    options: OnTagOpts = {},
    isolateOptions: IsolateComponentsOptions = {}
  ): Promise<OnTagResults> {
    const pipeResults: TaskResultsList[] = [];
    const { throwOnError, forceDeploy, disableTagAndSnapPipelines, isSnap } = options;
    const envsExecutionResults = await this.build(
      components,
      { emptyRootDir: true, ...isolateOptions },
      { skipTests: options.skipTests }
    );
    if (throwOnError && !forceDeploy) envsExecutionResults.throwErrorsIfExist();
    const allTasksResults = [...envsExecutionResults.tasksResults];
    pipeResults.push(envsExecutionResults);
    if (forceDeploy || (!disableTagAndSnapPipelines && !envsExecutionResults.hasErrors())) {
      const deployEnvsExecutionResults = isSnap
        ? await this.runSnapTasks(components, isolateOptions, envsExecutionResults.tasksResults)
        : await this.runTagTasks(components, isolateOptions, envsExecutionResults.tasksResults);
      if (throwOnError && !forceDeploy) deployEnvsExecutionResults.throwErrorsIfExist();
      allTasksResults.push(...deployEnvsExecutionResults.tasksResults);
      pipeResults.push(deployEnvsExecutionResults);
    }
    await this.storeArtifacts(allTasksResults);
    const builderDataMap = this.pipelineResultsToBuilderData(components, allTasksResults);
    this.validateBuilderDataMap(builderDataMap);
    return { builderDataMap, pipeResults };
  }

  private validateBuilderDataMap(builderDataMap: ComponentMap<BuilderData>) {
    builderDataMap.forEach((buildData: BuilderData, component) => {
      const taskSerializedIds = buildData.pipeline.map((t) =>
        BuildTaskHelper.serializeId({ aspectId: t.taskId, name: t.taskName })
      );
      const duplications = findDuplications(taskSerializedIds);
      if (duplications.length) {
        throw new Error(
          `build-task-results validation has failed. the following task(s) of "${component.id.toString()}" are duplicated: ${duplications.join(
            ', '
          )}`
        );
      }
    });
  }

  // TODO: merge with getArtifactsVinylByExtensionAndName by getting aspect name and name as object with optional props
  async getArtifactsVinylByExtension(component: Component, aspectName: string): Promise<ArtifactVinyl[]> {
    const artifactsObjects = this.getArtifactsByExtension(component, aspectName);
    const vinyls = await Promise.all(
      (artifactsObjects || []).map((artifactObject) =>
        artifactObject.files.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope)
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
        artifactObject.files.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope)
      )
    );
    return flatten(vinyls);
  }

  async getArtifactsVinylByExtensionAndTaskName(
    component: Component,
    aspectName: string,
    taskName: string
  ): Promise<ArtifactVinyl[]> {
    const artifactsObjects = this.getArtifactsByExtensionAndTaskName(component, aspectName, taskName);
    const vinyls = await Promise.all(
      (artifactsObjects || []).map((artifactObject) =>
        artifactObject.files.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope)
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

  getArtifactsByExtensionAndTaskName(
    component: Component,
    aspectName: string,
    taskName: string
  ): ArtifactObject[] | undefined {
    const artifacts = this.getArtifacts(component);
    return artifacts?.filter((artifact) => artifact.task.id === aspectName && artifact.task.name === taskName);
  }

  getDataByAspect(component: Component, aspectName: string): Serializable | undefined {
    const aspectsData = this.getBuilderData(component)?.aspectsData;
    const data = aspectsData?.find((aspectData) => aspectData.aspectId === aspectName);
    return data?.data;
  }

  getArtifacts(component: Component): ArtifactObject[] | undefined {
    return this.getBuilderData(component)?.artifacts;
  }

  getBuilderData(component: Component): BuilderData | undefined {
    const data = component.state.aspects.get(BuilderAspect.id)?.data as BuilderData | undefined;
    if (!data) return undefined;
    data.artifacts?.forEach((artifact) => {
      if (!(artifact.files instanceof ArtifactFiles)) {
        artifact.files = ArtifactFiles.fromObject(artifact.files);
      }
    });
    return data;
  }

  /**
   * build given components for release.
   * for each one of the envs it runs a series of tasks.
   * in case of an error in a task, it stops the execution of that env and continue to the next
   * env. at the end, the results contain the data and errors per env.
   */
  async build(
    components: Component[],
    isolateOptions?: IsolateComponentsOptions,
    builderOptions?: BuilderServiceOptions
  ): Promise<TaskResultsList> {
    const ids = components.map((c) => c.id);
    const network = await this.isolator.isolateComponents(ids, isolateOptions, this.scope.legacyScope);
    const envs = await this.envs.createEnvironment(network.graphCapsules.getAllComponents());
    const builderServiceOptions = {
      seedersOnly: isolateOptions?.seedersOnly,
      originalSeeders: ids,
      ...(builderOptions || {}),
    };
    const buildResult = await envs.runOnce(this.buildService, builderServiceOptions);
    return buildResult;
  }

  async runTagTasks(
    components: Component[],
    isolateOptions?: IsolateComponentsOptions,
    previousTasksResults?: TaskResults[]
  ): Promise<TaskResultsList> {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.runOnce(this.tagService, {
      seedersOnly: isolateOptions?.seedersOnly,
      previousTasksResults,
    });

    return buildResult;
  }

  async runSnapTasks(
    components: Component[],
    isolateOptions?: IsolateComponentsOptions,
    previousTasksResults?: TaskResults[]
  ): Promise<TaskResultsList> {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.runOnce(this.snapService, {
      seedersOnly: isolateOptions?.seedersOnly,
      previousTasksResults,
    });

    return buildResult;
  }

  listTasks(component: Component) {
    const compEnv = this.envs.getEnv(component);
    const buildTasks = this.buildService.getCurrentPipeTasks(compEnv);
    const tagTasks = this.tagService.getCurrentPipeTasks(compEnv);
    const snapTasks = this.snapService.getCurrentPipeTasks(compEnv);
    return { id: component.id, envId: compEnv.id, buildTasks, tagTasks, snapTasks };
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
   * @deprecated use registerTagTasks or registerSnapTasks
   */
  registerDeployTasks(tasks: BuildTask[]) {
    this.tagTaskSlot.register(tasks);
    return this;
  }

  /**
   * tag tasks that don't get executed on `bit build`, only on `bit tag'.
   * this pipeline is running once the build-pipeline has completed.
   */
  registerTagTasks(tasks: BuildTask[]) {
    this.tagTaskSlot.register(tasks);
    return this;
  }

  /**
   * tag tasks that don't get executed on `bit build`, only on `bit snap'.
   * this pipeline is running once the build-pipeline has completed.
   */
  registerSnapTasks(tasks: BuildTask[]) {
    this.snapTaskSlot.register(tasks);
    return this;
  }

  static slots = [Slot.withType<BuildTask>(), Slot.withType<BuildTask>(), Slot.withType<BuildTask>()];

  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    EnvsAspect,
    WorkspaceAspect,
    ScopeAspect,
    IsolatorAspect,
    LoggerAspect,
    AspectLoaderAspect,
    GraphqlAspect,
    GeneratorAspect,
  ];

  static async provider(
    [cli, envs, workspace, scope, isolator, loggerExt, aspectLoader, graphql, generator]: [
      CLIMain,
      EnvsMain,
      Workspace,
      ScopeMain,
      IsolatorMain,
      LoggerMain,
      AspectLoaderMain,
      GraphqlMain,
      GeneratorMain
    ],
    config,
    [buildTaskSlot, tagTaskSlot, snapTaskSlot]: [TaskSlot, TaskSlot, TaskSlot]
  ) {
    const artifactFactory = new ArtifactFactory();
    const logger = loggerExt.createLogger(BuilderAspect.id);
    const buildService = new BuilderService(
      isolator,
      logger,
      buildTaskSlot,
      'getBuildPipe',
      'build',
      artifactFactory,
      scope
    );
    envs.registerService(buildService);
    const tagService = new BuilderService(isolator, logger, tagTaskSlot, 'getTagPipe', 'tag', artifactFactory, scope);
    const snapService = new BuilderService(
      isolator,
      logger,
      snapTaskSlot,
      'getSnapPipe',
      'snap',
      artifactFactory,
      scope
    );
    const builder = new BuilderMain(
      envs,
      workspace,
      buildService,
      tagService,
      snapService,
      scope,
      isolator,
      aspectLoader,
      buildTaskSlot,
      tagTaskSlot,
      snapTaskSlot
    );

    graphql.register(builderSchema(builder));
    generator.registerComponentTemplate([buildTaskTemplate]);
    const func = builder.tagListener.bind(builder);
    if (scope) scope.onTag(func);
    if (workspace) {
      const commands = [new BuilderCmd(builder, workspace, logger), new ArtifactsCmd(builder, scope)];
      cli.register(...commands);
    }
    return builder;
  }
}

BuilderAspect.addRuntime(BuilderMain);
