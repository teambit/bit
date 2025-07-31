import { cloneDeep } from 'lodash';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ArtifactVinyl, ArtifactObject } from '@teambit/component.sources';
import { ArtifactFiles } from '@teambit/component.sources';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Component, IComponent, ComponentMain } from '@teambit/component';
import { ComponentMap, ComponentAspect, ComponentID } from '@teambit/component';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import { IsolatorAspect } from '@teambit/isolator';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { findDuplications } from '@teambit/toolbox.array.duplications-finder';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import type { UiMain } from '@teambit/ui';
import { UIAspect, BundleUiTask } from '@teambit/ui';
import type { IssuesMain } from '@teambit/issues';
import { IssuesAspect } from '@teambit/issues';
import { BitError } from '@teambit/bit-error';
import type { FsArtifact } from './artifact';
import { Artifact, ArtifactList } from './artifact';
import { ArtifactFactory } from './artifact/artifact-factory'; // it gets undefined when importing it from './artifact'
import { BuilderAspect } from './builder.aspect';
import { builderSchema } from './builder.graphql';
import type { BuilderServiceOptions } from './builder.service';
import { BuilderService } from './builder.service';
import { BuilderCmd } from './build.cmd';
import type { BuildTask } from './build-task';
import { BuildTaskHelper } from './build-task';
import type { TaskResults } from './build-pipe';
import type { TaskResultsList } from './task-results-list';
import { ArtifactStorageError } from './exceptions';
import type { AspectData, PipelineReport } from './build-pipeline-result-list';
import { BuildPipelineResultList } from './build-pipeline-result-list';
import type { TaskMetadata } from './types';
import { ArtifactsCmd } from './artifact/artifacts.cmd';
import { buildTaskTemplate } from './templates/build-task';
import { BuilderRoute } from './builder.route';
import { ComponentsHaveIssues } from './exceptions/components-have-issues';
import type { ConfigStoreMain } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';
import { Extensions } from '@teambit/legacy.constants';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';

export type TaskSlot = SlotRegistry<BuildTask[]>;
export type OnTagResults = { builderDataMap: ComponentMap<RawBuilderData>; pipeResults: TaskResultsList[] };
export type OnTagOpts = {
  disableTagAndSnapPipelines?: boolean;
  throwOnError?: boolean; // on the CI it helps to save the results on failure so this is set to false
  forceDeploy?: boolean; // whether run the deploy-pipeline although the build-pipeline has failed
  populateArtifactsFrom?: ComponentID[]; // helpful for tagging from scope where we want to use the build-artifacts of previous snap.
  isSnap?: boolean;
  loose?: boolean; // whether to ignore test/lint errors and allow tagging to succeed
};
export const FILE_PATH_PARAM_DELIM = '~';

export type LegacyOnTagResult = {
  id: ComponentID;
  builderData: ExtensionDataEntry;
};

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
    private snapTaskSlot: TaskSlot,
    private logger: Logger,
    private issues: IssuesMain
  ) {}

  private async storeArtifacts(tasksResults: TaskResults[]) {
    const artifacts = tasksResults.flatMap((t) => (t.artifacts ? [t.artifacts] : []));
    await Promise.all(
      artifacts.map(async (artifactMap: ComponentMap<ArtifactList<FsArtifact>>) => {
        await Promise.all(
          artifactMap.toArray().map(async ([component, artifactList]) => {
            try {
              await artifactList.store(component);
            } catch (err: any) {
              throw new ArtifactStorageError(err, component.id.toString());
            }
          })
        );
      })
    );
  }

  pipelineResultsToBuilderData(
    components: Component[],
    buildPipelineResults: TaskResults[]
  ): ComponentMap<RawBuilderData> {
    const buildPipelineResultList = new BuildPipelineResultList(buildPipelineResults, components);
    return ComponentMap.as<RawBuilderData>(components, (component) => {
      const aspectsData = buildPipelineResultList.getDataOfComponent(component.id);
      const pipelineReport = buildPipelineResultList.getPipelineReportOfComponent(component.id);
      const artifacts = buildPipelineResultList.getArtifactsDataOfComponent(component.id);
      return { pipeline: pipelineReport, artifacts, aspectsData, bitVersion: getBitVersion() };
    });
  }

  async tagListener(
    components: Component[],
    options: OnTagOpts = {},
    isolateOptions: IsolateComponentsOptions = {},
    builderOptions: BuilderServiceOptions = {}
  ): Promise<OnTagResults> {
    const pipeResults: TaskResultsList[] = [];
    const allTasksResults: TaskResults[] = [];
    const { throwOnError, forceDeploy, disableTagAndSnapPipelines, isSnap, populateArtifactsFrom, loose } = options;
    if (populateArtifactsFrom) isolateOptions.populateArtifactsFrom = populateArtifactsFrom;
    const buildEnvsExecutionResults = await this.build(
      components,
      { emptyRootDir: true, ...isolateOptions },
      {
        ...builderOptions,
        // even when build is skipped (in case of tag-from-scope), the pre-build/post-build and teambit.harmony/aspect tasks are needed
        tasks: populateArtifactsFrom ? [Extensions.aspect] : undefined,
      },
      { ignoreIssues: '*' }
    );
    if (throwOnError && !forceDeploy) buildEnvsExecutionResults.throwErrorsIfExist(loose);
    allTasksResults.push(...buildEnvsExecutionResults.tasksResults);
    pipeResults.push(buildEnvsExecutionResults);

    if (forceDeploy || (!disableTagAndSnapPipelines && !buildEnvsExecutionResults?.hasErrors(loose))) {
      const builderOptionsForTagSnap: BuilderServiceOptions = {
        ...builderOptions,
        seedersOnly: isolateOptions.seedersOnly,
        previousTasksResults: buildEnvsExecutionResults?.tasksResults,
      };
      const deployEnvsExecutionResults = isSnap
        ? await this.runSnapTasks(components, builderOptionsForTagSnap)
        : await this.runTagTasks(components, builderOptionsForTagSnap);
      if (throwOnError && !forceDeploy) deployEnvsExecutionResults.throwErrorsIfExist(loose);
      allTasksResults.push(...deployEnvsExecutionResults.tasksResults);
      pipeResults.push(deployEnvsExecutionResults);
    }
    await this.storeArtifacts(allTasksResults);
    const builderDataMap = this.pipelineResultsToBuilderData(components, allTasksResults);
    if (populateArtifactsFrom) await this.combineBuildDataFrom(builderDataMap, populateArtifactsFrom);
    this.validateBuilderDataMap(builderDataMap);

    await this.sanitizePreviewData(components);

    return { builderDataMap, pipeResults };
  }

  builderDataMapToLegacyOnTagResults(builderDataComponentMap: ComponentMap<RawBuilderData>): LegacyOnTagResult[] {
    const builderDataToLegacyExtension = (component: Component, builderData: RawBuilderData) => {
      const existingBuilder = component.state.aspects.get(BuilderAspect.id)?.legacy;
      const builderExtension = existingBuilder || new ExtensionDataEntry(undefined, undefined, BuilderAspect.id);
      builderExtension.data = builderData;
      return builderExtension;
    };
    return builderDataComponentMap.toArray().map(([component, builderData]) => ({
      id: component.id,
      builderData: builderDataToLegacyExtension(component, builderData),
    }));
  }

  /**
   * remove the onlyOverview from the preview data of the component if
   * the env is in the workspace
   * the env is not tagged with the component
   * the last tagged env has onlyOverview undefined in preview data
   *
   * We don't want to do this but have no choice because,
   * when we load components in workspace,
   * we set the onlyOverview to true in the env's preview data
   * which sets the onlyOverview to true in the component's preview data
   * but if you don't tag the env with the component,
   * the onlyOverview will be true in the component's preview data, since its env is in the workspace
   * even though the env it is tagged with doesn't have onlyOverview in its preview data
   * which will result in inconsistent preview data when exported to the scope
   */
  async sanitizePreviewData(harmonyComps: Component[]) {
    const compsBeingTaggedLookup = new Set(harmonyComps.map((comp) => comp.id.toString()));

    const harmonyCompIdsWithEnvId = await Promise.all(
      harmonyComps.map(async (comp) => {
        const envId = await this.envs.getEnvId(comp);
        if (this.envs.isUsingCoreEnv(comp)) {
          return [comp.id.toString(), { envId, inWs: false, lastTaggedEnvHasOnlyOverview: false }] as [
            string,
            { envId: string; inWs: boolean; lastTaggedEnvHasOnlyOverview?: boolean; isEnvTaggedWithComp?: boolean },
          ];
        }

        // check if the env is tagged with the component
        if (envId && !compsBeingTaggedLookup.has(comp.id.toString())) {
          return [comp.id.toString(), { envId, isEnvTaggedWithComp: false }] as [
            string,
            { envId: string; inWs?: boolean; lastTaggedEnvHasOnlyOverview?: boolean; isEnvTaggedWithComp?: boolean },
          ];
        }

        const envCompId = (envId && ComponentID.fromString(envId)) || undefined;
        const inWs = this.workspace && envCompId ? await this.workspace.hasId(envCompId) : false;

        const lastTaggedEnvHasOnlyOverview: boolean | undefined =
          envCompId &&
          (await this.scope.get(envCompId, false))?.state.aspects.get('teambit.preview/preview')?.data?.onlyOverview;

        return [comp.id.toString(), { envId, inWs, lastTaggedEnvHasOnlyOverview, isEnvTaggedWithComp: true }] as [
          string,
          { envId: string; inWs: boolean; lastTaggedEnvHasOnlyOverview: boolean; isEnvTaggedWithComp?: boolean },
        ];
      })
    );

    const harmonyCompIdsWithEnvIdMap = new Map(harmonyCompIdsWithEnvId);

    const compsToDeleteOnlyOverviewPreviewData = harmonyComps.filter((comp) => {
      const envData:
        | { envId: string; inWs?: boolean; lastTaggedEnvHasOnlyOverview?: boolean; isEnvTaggedWithComp?: boolean }
        | undefined = harmonyCompIdsWithEnvIdMap.get(comp.id.toString());
      return envData?.inWs && !envData?.lastTaggedEnvHasOnlyOverview && envData?.isEnvTaggedWithComp;
    });

    for (const comp of compsToDeleteOnlyOverviewPreviewData) {
      const previewData = comp.state.aspects.get('teambit.preview/preview')?.data;
      // if the env is not tagged with the component remove it from the preview data of the component
      delete previewData?.onlyOverview;
    }
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

  private async combineBuildDataFrom(
    builderDataMap: ComponentMap<RawBuilderData>,
    populateArtifactsFrom: ComponentID[]
  ) {
    const promises = builderDataMap.map(async (builderData, component) => {
      const populateFrom = populateArtifactsFrom.find((id) => id.isEqual(component.id, { ignoreVersion: true }));
      const idStr = component.id.toString();
      if (!populateFrom) {
        throw new Error(`combineBuildDataFromParent: unable to find where to populate the artifacts from for ${idStr}`);
      }
      const populateFromComp = await this.componentAspect.getHost().get(populateFrom);
      if (!populateFromComp)
        throw new Error(
          `combineBuildDataFromParent, unable to load parent component of ${idStr}. hash: ${populateFrom.version}`
        );
      const populateFromBuilderData = this.getBuilderData(populateFromComp);
      if (!populateFromBuilderData) throw new Error(`parent of ${idStr} was not built yet. unable to continue`);
      populateFromBuilderData.artifacts.forEach((artifact) => {
        const artifactObj = artifact.toObject();
        if (!builderData.artifacts) builderData.artifacts = [];
        if (
          builderData.artifacts.find(
            (a) =>
              a.task.id === artifactObj.task.id && a.task.name === artifactObj.task.name && a.name === artifactObj.name
          )
        ) {
          return;
        }
        builderData.artifacts.push(artifactObj);
      });
      populateFromBuilderData.aspectsData.forEach((aspectData) => {
        if (builderData.aspectsData.find((a) => a.aspectId === aspectData.aspectId)) return;
        builderData.aspectsData.push(aspectData);
      });
      populateFromBuilderData.pipeline.forEach((pipeline) => {
        if (builderData.pipeline.find((p) => p.taskId === pipeline.taskId && p.taskName === pipeline.taskName)) return;
        builderData.pipeline.push(pipeline);
      });
    });

    await Promise.all(promises.flattenValue());
  }

  // TODO: merge with getArtifactsVinylByExtensionAndName by getting aspect name and name as object with optional props
  async getArtifactsVinylByAspect(component: Component, aspectName: string): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsByAspect(component, aspectName);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id, this.scope.legacyScope);
    return vinyls;
  }

  async getArtifactsVinylByAspectAndName(
    component: Component,
    aspectName: string,
    name: string
  ): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsByAspectAndName(component, aspectName, name);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id, this.scope.legacyScope);
    return vinyls;
  }

  async getArtifactsVinylByAspectAndTaskName(
    component: Component,
    aspectName: string,
    name: string
  ): Promise<ArtifactVinyl[]> {
    const artifacts = this.getArtifactsbyAspectAndTaskName(component, aspectName, name);
    const vinyls = await artifacts.getVinylsAndImportIfMissing(component.id, this.scope.legacyScope);
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

  /**
   * this is the aspect's data that was generated as "metadata" of the task component-result during the build process
   * and saved by the builder aspect in the "aspectsData" property.
   * (not to be confused with the data saved in the aspect itself, which is saved in the "data" property of the aspect).
   */
  getDataByAspect(component: IComponent, aspectName: string): TaskMetadata | undefined {
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
    builderOptions?: BuilderServiceOptions,
    extraOptions?: { includeTag?: boolean; includeSnap?: boolean; ignoreIssues?: string }
  ): Promise<TaskResultsList> {
    await this.throwForVariousIssues(components, extraOptions?.ignoreIssues);
    const ids = components.map((c) => c.id);
    const capsulesBaseDir = this.buildService.getComponentsCapsulesBaseDir();
    const baseIsolateOpts = {
      baseDir: capsulesBaseDir,
      useHash: !capsulesBaseDir,
    };
    const mergedIsolateOpts = {
      ...baseIsolateOpts,
      ...isolateOptions,
    };

    const network = await this.isolator.isolateComponents(ids, mergedIsolateOpts, this.scope.legacyScope);
    const envs = await this.envs.createEnvironment(network.graphCapsules.getAllComponents());
    const builderServiceOptions = {
      seedersOnly: isolateOptions?.seedersOnly,
      originalSeeders: ids,
      capsulesBaseDir,
      ...builderOptions,
    };
    this.logger.consoleTitle(`Total ${components.length} components to build`);
    const buildResult: TaskResultsList = await envs.runOnce(this.buildService, builderServiceOptions);

    if (extraOptions?.includeSnap || extraOptions?.includeTag) {
      const builderOptionsForTagSnap: BuilderServiceOptions = {
        ...builderServiceOptions,
        previousTasksResults: buildResult.tasksResults,
      };
      const deployEnvsExecutionResults = extraOptions?.includeSnap
        ? await this.runSnapTasks(components, builderOptionsForTagSnap)
        : await this.runTagTasks(components, builderOptionsForTagSnap);
      buildResult.tasksResults.push(...deployEnvsExecutionResults.tasksResults);
    }

    return buildResult;
  }

  async runTagTasks(components: Component[], builderOptions: BuilderServiceOptions): Promise<TaskResultsList> {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.runOnce(this.tagService, builderOptions);

    return buildResult;
  }

  async runSnapTasks(components: Component[], builderOptions: BuilderServiceOptions): Promise<TaskResultsList> {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.runOnce(this.snapService, builderOptions);

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

  private async throwForVariousIssues(components: Component[], ignoreIssues?: string) {
    const componentsToCheck = components.filter((c) => !c.isDeleted());
    await this.throwForComponentIssues(componentsToCheck, ignoreIssues);
  }

  async throwForComponentIssues(components: Component[], ignoreIssues?: string) {
    if (ignoreIssues === '*') {
      // ignore all issues
      return;
    }
    const issuesToIgnoreFromFlag = ignoreIssues?.split(',').map((issue) => issue.trim()) || [];
    const issuesToIgnoreFromConfig = this.issues.getIssuesToIgnoreGlobally();
    const issuesToIgnore = [...issuesToIgnoreFromFlag, ...issuesToIgnoreFromConfig];
    await this.issues.triggerAddComponentIssues(components, issuesToIgnore);
    this.issues.removeIgnoredIssuesFromComponents(components, issuesToIgnore);
    const legacyComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    const componentsWithBlockingIssues = legacyComponents.filter((component) => component.issues?.shouldBlockTagging());
    if (componentsWithBlockingIssues.length) {
      throw new ComponentsHaveIssues(componentsWithBlockingIssues);
    }

    const workspaceIssues = this.workspace.getWorkspaceIssues();
    if (workspaceIssues.length) {
      const issuesStr = workspaceIssues.map((issueErr) => issueErr.message).join('\n');
      throw new BitError(`the workspace has the following issues:\n${issuesStr}`);
    }
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
    UIAspect,
    ConfigStoreAspect,
    IssuesAspect,
  ];

  static async provider(
    [
      cli,
      envs,
      workspace,
      scope,
      isolator,
      loggerExt,
      aspectLoader,
      graphql,
      generator,
      component,
      ui,
      configStore,
      issues,
    ]: [
      CLIMain,
      EnvsMain,
      Workspace,
      ScopeMain,
      IsolatorMain,
      LoggerMain,
      AspectLoaderMain,
      GraphqlMain,
      GeneratorMain,
      ComponentMain,
      UiMain,
      ConfigStoreMain,
      IssuesMain,
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
      scope,
      configStore
    );
    envs.registerService(buildService);
    const tagService = new BuilderService(
      isolator,
      logger,
      tagTaskSlot,
      'getTagPipe',
      'tag',
      artifactFactory,
      scope,
      configStore
    );
    const snapService = new BuilderService(
      isolator,
      logger,
      snapTaskSlot,
      'getSnapPipe',
      'snap',
      artifactFactory,
      scope,
      configStore
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
      snapTaskSlot,
      logger,
      issues
    );
    builder.registerBuildTasks([new BundleUiTask(ui, logger)]);
    component.registerRoute([new BuilderRoute(builder, scope, logger)]);
    graphql.register(() => builderSchema(builder, logger));
    if (generator) generator.registerComponentTemplate([buildTaskTemplate]);
    const commands = [new BuilderCmd(builder, workspace, logger), new ArtifactsCmd(builder, component)];
    cli.register(...commands);

    return builder;
  }
}

BuilderAspect.addRuntime(BuilderMain);
