import { cloneDeep } from 'lodash';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentMap, IComponent, ComponentAspect, ComponentMain, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import AspectAspect from '@teambit/aspect';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { IsolateComponentsOptions, IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { getHarmonyVersion } from '@teambit/legacy/dist/bootstrap';
import findDuplications from '@teambit/legacy/dist/utils/array/find-duplications';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { Artifact, ArtifactList, FsArtifact } from './artifact';
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
import { BuilderRoute } from './builder.route';

export type TaskSlot = SlotRegistry<BuildTask[]>;
export type OnTagResults = { builderDataMap: ComponentMap<RawBuilderData>; pipeResults: TaskResultsList[] };
export type OnTagOpts = {
  disableTagAndSnapPipelines?: boolean;
  throwOnError?: boolean; // on the CI it helps to save the results on failure so this is set to false
  forceDeploy?: boolean; // whether run the deploy-pipeline although the build-pipeline has failed
  skipBuildPipeline?: boolean; // helpful for tagging from scope where we want to use the build-artifacts of previous snap.
  combineBuildDataFromParent?: boolean; // helpful for tagging from scope where we want to save the build-data of parent snap.
  skipTests?: boolean;
  isSnap?: boolean;
};
export const FILE_PATH_PARAM_DELIM = '~';

/**
 * builder data format for the bit object store
 */
export type RawBuilderData = {
  pipeline: PipelineReport[];
  artifacts?: ArtifactObject[];
  aspectsData: AspectData[];
  bitVersion?: string;
};
/**
 * builder data mapped to an ArtifactList instance
 */
export type BuilderData = Omit<RawBuilderData, 'artifacts'> & {
  artifacts: ArtifactList<Artifact>;
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
    private componentAspect: ComponentMain,
    private buildTaskSlot: TaskSlot,
    private tagTaskSlot: TaskSlot,
    private snapTaskSlot: TaskSlot
  ) {}

  private async storeArtifacts(tasksResults: TaskResults[]) {
    const artifacts = tasksResults.flatMap((t) => (t.artifacts ? [t.artifacts] : []));
    const storeP = artifacts.map(async (artifactMap: ComponentMap<ArtifactList<FsArtifact>>) => {
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
  ): ComponentMap<RawBuilderData> {
    const buildPipelineResultList = new BuildPipelineResultList(buildPipelineResults, components);
    return ComponentMap.as<RawBuilderData>(components, (component) => {
      const aspectsData = buildPipelineResultList.getDataOfComponent(component.id);
      const pipelineReport = buildPipelineResultList.getPipelineReportOfComponent(component.id);
      const artifacts = buildPipelineResultList.getArtifactsDataOfComponent(component.id);
      return { pipeline: pipelineReport, artifacts, aspectsData, bitVersion: getHarmonyVersion(true) };
    });
  }

  async tagListener(
    components: Component[],
    options: OnTagOpts = {},
    isolateOptions: IsolateComponentsOptions = {}
  ): Promise<OnTagResults> {
    const pipeResults: TaskResultsList[] = [];
    const allTasksResults: TaskResults[] = [];
    const { throwOnError, forceDeploy, disableTagAndSnapPipelines, isSnap, skipBuildPipeline } = options;
    if (options.skipBuildPipeline) isolateOptions.populateArtifactsFromParent = true;
    const buildEnvsExecutionResults = await this.build(
      components,
      { emptyRootDir: true, ...isolateOptions },
      {
        skipTests: options.skipTests,
        // even when build is skipped (in case of tag-from-scope), the pre-build/post-build and teambit.harmony/aspect tasks are needed
        tasks: skipBuildPipeline ? [AspectAspect.id] : undefined,
      }
    );
    if (throwOnError && !forceDeploy) buildEnvsExecutionResults.throwErrorsIfExist();
    allTasksResults.push(...buildEnvsExecutionResults.tasksResults);
    pipeResults.push(buildEnvsExecutionResults);

    if (forceDeploy || (!disableTagAndSnapPipelines && !buildEnvsExecutionResults?.hasErrors())) {
      const deployEnvsExecutionResults = isSnap
        ? await this.runSnapTasks(components, isolateOptions, buildEnvsExecutionResults?.tasksResults)
        : await this.runTagTasks(components, isolateOptions, buildEnvsExecutionResults?.tasksResults);
      if (throwOnError && !forceDeploy) deployEnvsExecutionResults.throwErrorsIfExist();
      allTasksResults.push(...deployEnvsExecutionResults.tasksResults);
      pipeResults.push(deployEnvsExecutionResults);
    }
    await this.storeArtifacts(allTasksResults);
    const builderDataMap = this.pipelineResultsToBuilderData(components, allTasksResults);
    if (options.combineBuildDataFromParent) await this.combineBuildDataFromParent(builderDataMap);
    this.validateBuilderDataMap(builderDataMap);

    return { builderDataMap, pipeResults };
  }

  private validateBuilderDataMap(builderDataMap: ComponentMap<RawBuilderData>) {
    builderDataMap.forEach((buildData: RawBuilderData, component) => {
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

  private async combineBuildDataFromParent(builderDataMap: ComponentMap<RawBuilderData>) {
    const promises = builderDataMap.map(async (builderData, component) => {
      const idStr = component.id.toString();
      const parents = component.head?.parents;
      if (!parents || parents.length !== 1) {
        throw new Error(`expect parents of ${idStr} to be 1, got ${parents?.length || 'none'}`);
      }
      const parent = parents[0];
      const parentComp = await this.componentAspect.getHost().get(component.id.changeVersion(parent.toString()));
      if (!parentComp) throw new Error(`unable to load parent component of ${idStr}. hash: ${parent}`);
      const parentBuilderData = this.getBuilderData(parentComp);
      if (!parentBuilderData) throw new Error(`parent of ${idStr} was not built yet. unable to continue`);
      parentBuilderData.artifacts.forEach((artifact) => {
        const artifactObj = artifact.toObject();
        if (!builderData.artifacts) builderData.artifacts = [];
        if (
          builderData.artifacts.find((a) => a.task.id === artifactObj.task.id && a.task.name === artifactObj.task.name)
        ) {
          return;
        }
        builderData.artifacts.push(artifactObj);
      });
      parentBuilderData.aspectsData.forEach((aspectData) => {
        if (builderData.aspectsData.find((a) => a.aspectId === aspectData.aspectId)) return;
        builderData.aspectsData.push(aspectData);
      });
      parentBuilderData.pipeline.forEach((pipeline) => {
        if (builderData.pipeline.find((p) => p.taskId === pipeline.taskId && p.taskName === pipeline.taskName)) return;
        builderData.pipeline.push(pipeline);
      });
    });

    await Promise.all(promises.flattenValue());
  }

  // TODO: merge with getArtifactsVinylByExtensionAndName by getting aspect name and name as object with optional props
  async getArtifactsVinylByAspect(component: Component, aspectName: string): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsByAspect(component, aspectName);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope);
    return vinyls;
  }

  async getArtifactsVinylByAspectAndName(
    component: Component,
    aspectName: string,
    name: string
  ): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsByAspectAndName(component, aspectName, name);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope);
    return vinyls;
  }

  async getArtifactsVinylByAspectAndTaskName(
    component: Component,
    aspectName: string,
    name: string
  ): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsbyAspectAndTaskName(component, aspectName, name);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id._legacy, this.scope.legacyScope);
    return vinyls;
  }

  getArtifactsByName(component: Component, name: string): ArtifactList<Artifact> {
    const artifacts = this.getArtifacts(component).byAspectNameAndName(undefined, name);
    return artifacts;
  }

  getArtifactsByAspect(component: Component, aspectName: string): ArtifactList<Artifact> {
    const artifacts = this.getArtifacts(component).byAspectNameAndName(aspectName);
    return artifacts;
  }

  getArtifactsByAspectAndName(component: Component, aspectName: string, name: string): ArtifactList<Artifact> {
    const artifacts = this.getArtifacts(component).byAspectNameAndName(aspectName, name);
    return artifacts;
  }

  getArtifactsbyAspectAndTaskName(component: IComponent, aspectName: string, taskName: string): ArtifactList<Artifact> {
    const artifacts = this.getArtifacts(component).byAspectNameAndTaskName(aspectName, taskName);
    return artifacts;
  }

  getDataByAspect(component: IComponent, aspectName: string): Serializable | undefined {
    const aspectsData = this.getBuilderData(component)?.aspectsData;
    const data = aspectsData?.find((aspectData) => aspectData.aspectId === aspectName);
    return data?.data;
  }

  getArtifacts(component: IComponent): ArtifactList<Artifact> {
    const artifacts = this.getBuilderData(component)?.artifacts || ArtifactList.fromArray([]);
    return artifacts;
  }

  getBuilderData(component: IComponent): BuilderData | undefined {
    const data = component.get(BuilderAspect.id)?.data;
    if (!data) return undefined;
    const clonedData = cloneDeep(data) as BuilderData;
    let artifactFiles: ArtifactFiles;
    const artifacts = clonedData.artifacts?.map((artifact) => {
      if (!(artifact.files instanceof ArtifactFiles)) {
        artifactFiles = ArtifactFiles.fromObject(artifact.files);
      } else {
        artifactFiles = artifact.files;
      }
      if (artifact instanceof Artifact) {
        return artifact;
      }
      Object.assign(artifact, { files: artifactFiles });
      return Artifact.fromArtifactObject(artifact);
    });
    clonedData.artifacts = ArtifactList.fromArray(artifacts || []);
    return clonedData;
  }

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

  getDownloadUrlForArtifact(componentId: ComponentID, taskId: string, path?: string) {
    return `/api/${componentId}/~aspect/builder/${taskId}/${path ? `${FILE_PATH_PARAM_DELIM}${path}` : ''}`;
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
    ComponentAspect,
  ];

  static async provider(
    [cli, envs, workspace, scope, isolator, loggerExt, aspectLoader, graphql, generator, component]: [
      CLIMain,
      EnvsMain,
      Workspace,
      ScopeMain,
      IsolatorMain,
      LoggerMain,
      AspectLoaderMain,
      GraphqlMain,
      GeneratorMain,
      ComponentMain
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
      component,
      buildTaskSlot,
      tagTaskSlot,
      snapTaskSlot
    );
    component.registerRoute([new BuilderRoute(builder, scope, logger)]);
    graphql.register(builderSchema(builder, logger));
    generator.registerComponentTemplate([buildTaskTemplate]);
    const commands = [new BuilderCmd(builder, workspace, logger), new ArtifactsCmd(builder, scope)];
    cli.register(...commands);

    return builder;
  }
}

BuilderAspect.addRuntime(BuilderMain);
