import mapSeries from 'p-map-series';
import { compact } from 'lodash';
import { ReleaseType } from 'semver';
import { v4 } from 'uuid';
import { BitError } from '@teambit/bit-error';
import { Scope } from '@teambit/legacy.scope';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BuildStatus, Extensions } from '@teambit/legacy.constants';
import { ConsumerComponent, CURRENT_SCHEMA } from '@teambit/legacy.consumer-component';
import { linkToNodeModulesByComponents } from '@teambit/workspace.modules.node-modules-linker';
import { Consumer, NewerVersionFound } from '@teambit/legacy.consumer';
import { Component } from '@teambit/component';
import { RemoveAspect, deleteComponentsFiles } from '@teambit/remove';
import { getValidVersionOrReleaseType } from '@teambit/pkg.modules.semver-helper';
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { BuilderMain, OnTagOpts } from '@teambit/builder';
import { ModelComponent, Log, DependenciesGraph, Lane } from '@teambit/objects';
import { MessagePerComponent, MessagePerComponentFetcher } from './message-per-component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ScopeMain, StagedConfig } from '@teambit/scope';
import { Workspace, AutoTagResult } from '@teambit/workspace';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { PackageIntegritiesByPublishedPackages, SnappingMain, TagDataPerComp } from './snapping.main.runtime';
import { LaneId } from '@teambit/lane-id';
import { DETACH_HEAD, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';

export type onTagIdTransformer = (id: ComponentID) => ComponentID | null;

export type BasicTagSnapParams = {
  message: string;
  skipTests?: boolean;
  skipTasks?: string;
  build?: boolean;
  ignoreBuildErrors?: boolean;
  rebuildDepsGraph?: boolean;
  detachHead?: boolean;
  overrideHead?: boolean;
};

export type BasicTagParams = BasicTagSnapParams & {
  ignoreNewestVersion?: boolean;
  skipAutoTag?: boolean;
  soft?: boolean;
  persist: boolean;
  disableTagAndSnapPipelines?: boolean;
  preReleaseId?: string;
  editor?: string;
  unmodified?: boolean;
};

export type VersionMakerParams = {
  tagDataPerComp?: TagDataPerComp[];
  populateArtifactsFrom?: ComponentID[];
  populateArtifactsIgnorePkgJson?: boolean;
  copyLogFromPreviousSnap?: boolean;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  isSnap?: boolean;
  packageManagerConfigRootDir?: string;
  exitOnFirstFailedTask?: boolean;
  updateDependentsOnLane?: boolean;
  setHeadAsParent?: boolean;
} & BasicTagParams;

/**
 * create a tag or a snap of the given components and save them in the local scope.
 */
export class VersionMaker {
  private workspace?: Workspace;
  private consumer?: Consumer;
  private legacyScope: Scope;
  private scope: ScopeMain;
  private builder: BuilderMain;
  private dependencyResolver: DependencyResolverMain;
  private allComponentsToTag: ConsumerComponent[] = [];
  private allWorkspaceComps?: Component[];
  constructor(
    private snapping: SnappingMain,
    private components: Component[],
    private consumerComponents: ConsumerComponent[],
    private ids: ComponentIdList,
    private params: VersionMakerParams
  ) {
    this.workspace = snapping.workspace;
    this.scope = snapping.scope;
    this.builder = snapping.builder;
    this.dependencyResolver = snapping.dependencyResolver;

    this.consumer = this.workspace?.consumer;
    this.legacyScope = this.scope.legacyScope;
  }

  async makeVersion(): Promise<{
    taggedComponents: ConsumerComponent[];
    autoTaggedResults: AutoTagResult[];
    publishedPackages: string[];
    stagedConfig?: StagedConfig;
    removedComponents?: ComponentIdList;
  }> {
    this.allWorkspaceComps = this.workspace ? await this.workspace.list() : undefined;
    const componentsToTag = this.getUniqCompsToTag();
    const idsToTag = ComponentIdList.fromArray(componentsToTag.map((c) => c.id));
    const autoTagData = await this.getAutoTagData(idsToTag);
    const autoTagComponents = autoTagData.map((autoTagItem) => autoTagItem.component);
    const autoTagComponentsFiltered = autoTagComponents.filter((c) => !idsToTag.has(c.id));
    const autoTagIds = ComponentIdList.fromArray(autoTagComponentsFiltered.map((autoTag) => autoTag.id));
    await this.triggerOnPreSnap(autoTagIds);
    this.allComponentsToTag = [...componentsToTag, ...autoTagComponentsFiltered];
    const messagePerId = await this.getMessagePerId(idsToTag, autoTagIds);
    await this.checkForNewerVersions();
    this.setCurrentSchema();
    // go through all components and find the future versions for them
    this.params.isSnap ? this.setHashes() : await this.setFutureVersions(autoTagIds);
    // go through all dependencies and update their versions
    this.updateDependenciesVersions();
    await this.addLogToComponents(componentsToTag, autoTagComponents, messagePerId);
    // don't move it down. otherwise, it'll be empty and we don't know which components were during merge.
    // (it's being deleted in snapping.main.runtime - `_addCompToObjects` method)
    const unmergedComps = (await this.workspace?.listComponentsDuringMerge()) || [];
    const lane = await this.legacyScope.getCurrentLaneObject();
    const stagedConfig = (await this.workspace?.scope.getStagedConfig()) || undefined;
    if (this.params.soft) {
      if (!this.consumer) throw new Error(`unable to soft-tag without consumer`);
      this.consumer.updateNextVersionOnBitmap(this.allComponentsToTag, this.params.preReleaseId);
      return {
        taggedComponents: componentsToTag,
        autoTaggedResults: autoTagData,
        publishedPackages: [],
        stagedConfig,
      };
    }

    const { rebuildDepsGraph, build, updateDependentsOnLane, setHeadAsParent, detachHead, overrideHead } = this.params;
    await this.snapping._addFlattenedDependenciesToComponents(this.allComponentsToTag, rebuildDepsGraph);
    await this._addDependenciesGraphToComponents(this.components);
    await this.snapping.throwForDepsFromAnotherLane(this.allComponentsToTag);
    if (!build) this.emptyBuilderData();
    this.addBuildStatus(this.allComponentsToTag, BuildStatus.Pending);

    const currentLane = this.consumer?.getCurrentLaneId();
    await mapSeries(this.allComponentsToTag, async (component) => {
      const results = await this.snapping._addCompToObjects({
        source: component,
        lane,
        shouldValidateVersion: Boolean(build),
        addVersionOpts: {
          addToUpdateDependentsInLane: updateDependentsOnLane,
          setHeadAsParent,
          detachHead,
          overrideHead: overrideHead,
        },
      });
      if (this.workspace) {
        const modelComponent = component.modelComponent || (await this.legacyScope.getModelComponent(component.id));
        await updateVersions(
          this.workspace,
          stagedConfig!,
          currentLane!,
          modelComponent,
          results.addedVersionStr,
          true
        );
      } else {
        const tagData = this.params.tagDataPerComp?.find((t) => t.componentId.isEqualWithoutVersion(component.id));
        if (tagData?.isNew) results.version.removeAllParents();
      }
    });

    if (this.workspace) {
      await this.workspace.scope.legacyScope.stagedSnaps.write();
    }

    const publishedPackages: string[] = [];
    const harmonyCompsToTag = await (this.workspace || this.scope).getManyByLegacy(this.allComponentsToTag);
    // this is not necessarily the same as the previous allComponentsToTag. although it should be, because
    // harmonyCompsToTag is created from allComponentsToTag. however, for aspects, the getMany returns them from cache
    // and therefore, their instance of ConsumerComponent can be different than the one in allComponentsToTag.
    this.allComponentsToTag = harmonyCompsToTag.map((c) => c.state._consumer);
    await this.build(harmonyCompsToTag, publishedPackages);

    const removedComponents = await removeDeletedComponentsFromBitmap(this.allComponentsToTag, this.workspace);
    await this.addLaneObject(lane);
    await this.legacyScope.objects.persist();
    await removeMergeConfigFromComponents(unmergedComps, this.allComponentsToTag, this.workspace);
    if (this.workspace) {
      await linkToNodeModulesByComponents(harmonyCompsToTag, this.workspace);
    }
    // clear all objects. otherwise, ModelComponent has the wrong divergeData
    this.legacyScope.objects.clearObjectsFromCache();

    return {
      taggedComponents: componentsToTag,
      autoTaggedResults: autoTagData,
      publishedPackages,
      stagedConfig,
      removedComponents,
    };
  }

  private async _addDependenciesGraphToComponents(components: Component[]): Promise<void> {
    if (!this.workspace) {
      return;
    }
    this.snapping.logger.setStatusLine('adding dependencies graph...');
    this.snapping.logger.profile('snap._addDependenciesGraphToComponents');
    if (!this.allWorkspaceComps) throw new Error('please make sure to populate this.allWorkspaceComps before');
    const comps: Component[] = [...components];
    for (const otherComp of this.allWorkspaceComps) {
      if (comps.every((c) => !c.id.isEqualWithoutVersion(otherComp.id))) {
        comps.push(otherComp);
      }
    }
    const componentIdByPkgName = this.dependencyResolver.createComponentIdByPkgNameMap(comps);
    const options = {
      rootDir: this.workspace.path,
      rootComponentsPath: this.workspace.rootComponentsPath,
      componentIdByPkgName,
    };
    await pMapPool(
      components,
      async (component) => {
        if (component.state._consumer.componentMap?.rootDir) {
          await this.dependencyResolver.addDependenciesGraph(
            component,
            component.state._consumer.componentMap.rootDir,
            options
          );
        }
      },
      { concurrency: 10 }
    );
    this.snapping.logger.clearStatusLine();
    this.snapping.logger.profile('snap._addDependenciesGraphToComponents');
  }

  private async triggerOnPreSnap(autoTagIds: ComponentIdList) {
    const allFunctions = this.snapping.onPreSnapSlot.values();
    await mapSeries(allFunctions, (func) => func(this.components, autoTagIds, this.params));
  }

  private async addLaneObject(lane?: Lane) {
    if (lane) {
      const { message } = this.params;
      const msgStr = message ? ` (${message})` : '';
      const laneHistory = await this.legacyScope.lanes.updateLaneHistory(lane, `snap${msgStr}`);
      this.legacyScope.objects.add(laneHistory);
    }
  }

  private async build(harmonyCompsToTag: Component[], publishedPackages: string[]) {
    if (!this.params.build) {
      return;
    }
    const {
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      isSnap,
      populateArtifactsFrom,
      skipTasks,
      packageManagerConfigRootDir,
      exitOnFirstFailedTask,
      populateArtifactsIgnorePkgJson,
      skipTests,
    } = this.params;
    const onTagOpts: OnTagOpts = {
      disableTagAndSnapPipelines,
      throwOnError: true,
      forceDeploy: ignoreBuildErrors,
      isSnap,
      populateArtifactsFrom,
    };
    const skipTasksParsed = skipTasks ? skipTasks.split(',').map((t) => t.trim()) : undefined;
    const seedersOnly = !this.workspace; // if tag from scope, build only the given components
    const isolateOptions = { packageManagerConfigRootDir, seedersOnly, populateArtifactsIgnorePkgJson };
    const builderOptions = { exitOnFirstFailedTask, skipTests, skipTasks: skipTasksParsed };

    const componentsToBuild = harmonyCompsToTag.filter((c) => !c.isDeleted());
    if (componentsToBuild.length) {
      const componentsToBuildLegacy: ConsumerComponent[] = componentsToBuild.map((c) => c.state._consumer);
      await this.scope.reloadAspectsWithNewVersion(componentsToBuildLegacy);
      const { builderDataMap } = await this.builder.tagListener(
        componentsToBuild,
        onTagOpts,
        isolateOptions,
        builderOptions
      );
      const buildResult = this.scope.builderDataMapToLegacyOnTagResults(builderDataMap);

      this.snapping._updateComponentsByTagResult(componentsToBuildLegacy, buildResult);
      const packageIntegritiesByPublishedPackages = this.snapping._getPublishedPackages(componentsToBuildLegacy);
      publishedPackages.push(...Array.from(packageIntegritiesByPublishedPackages.keys()));

      addIntegritiesToConsumerComponentsGraphs(packageIntegritiesByPublishedPackages, this.allComponentsToTag);
      this.addBuildStatus(componentsToBuildLegacy, BuildStatus.Succeed);
      await mapSeries(componentsToBuild, (comp) => this.snapping.enrichComp(comp));
      if (populateArtifactsFrom) await updateHiddenProp(this.scope, populateArtifactsFrom);
    }
  }

  private async checkForNewerVersions() {
    // check for each one of the components whether it is using an old version
    // TODO: once --detach-head is supported by the remote, deprecate --ignore-newest-version. and change this
    // throwForNewestVersion to suggest using --detach-head instead. also, it the error should not be limited
    // to tags and can be thrown for snaps as well.
    // once --ignore-newest-version is removed, no need for this condition. it's ok to not provide the override-head option.
    const { detachHead, ignoreNewestVersion, isSnap } = this.params;
    if (detachHead && !isFeatureEnabled(DETACH_HEAD)) {
      throw new Error('unable to detach head, the feature is not enabled');
    }
    if (ignoreNewestVersion && !detachHead) this.params.overrideHead = true;
    if (!ignoreNewestVersion && !isSnap) {
      await throwForNewestVersion(this.allComponentsToTag, this.legacyScope);
    }
  }

  private async getMessagePerId(idsToTag: ComponentIdList, autoTagIds: ComponentIdList) {
    const messagesFromEditorFetcher = new MessagePerComponentFetcher(idsToTag, autoTagIds);
    const { editor, message, tagDataPerComp } = this.params;
    if (editor) return messagesFromEditorFetcher.getMessagesFromEditor(this.legacyScope.tmp, editor);
    if (tagDataPerComp) return tagDataPerComp.map((t) => ({ id: t.componentId, msg: t.message || message }));
    return [];
  }

  private getUniqCompsToTag(): ConsumerComponent[] {
    const consumerComponentsIdsMap = {};
    // Concat and unique all the dependencies from all the components so we will not import
    // the same dependency more then once, it's mainly for performance purpose
    this.consumerComponents.forEach((consumerComponent) => {
      const componentIdString = consumerComponent.id.toString();
      // Store it in a map so we can take it easily from the sorted array which contain only the id
      consumerComponentsIdsMap[componentIdString] = consumerComponent;
    });
    return Object.values(consumerComponentsIdsMap); // consumerComponents unique
  }

  private async getAutoTagData(idsToTag: ComponentID[]) {
    // ids without versions are new. it's impossible that tagged (and not-modified) components has
    // them as dependencies.
    const idsToTriggerAutoTag = idsToTag.filter((id) => id.hasVersion());
    const autoTagDataWithLocalOnly =
      this.params.skipAutoTag || !this.workspace
        ? []
        : await this.workspace.getAutoTagInfo(ComponentIdList.fromArray(idsToTriggerAutoTag));
    const localOnly = this.workspace?.listLocalOnly();
    return localOnly
      ? autoTagDataWithLocalOnly.filter((autoTagItem) => !localOnly.hasWithoutVersion(autoTagItem.component.id))
      : autoTagDataWithLocalOnly;
  }

  private async setFutureVersions(autoTagIds: ComponentIdList): Promise<void> {
    const { releaseType, tagDataPerComp, incrementBy, persist, soft, exactVersion, preReleaseId } = this.params;
    const isPreReleaseLike = releaseType
      ? ['prerelease', 'premajor', 'preminor', 'prepatch'].includes(releaseType)
      : false;
    await Promise.all(
      this.allComponentsToTag.map(async (componentToTag) => {
        const isAutoTag = autoTagIds.hasWithoutVersion(componentToTag.id);
        const modelComponent = await this.legacyScope.sources.findOrAddComponent(componentToTag);
        const nextVersion = componentToTag.componentMap?.nextVersion?.version;
        const getNewVersion = (): string => {
          if (tagDataPerComp) {
            const tagData = tagDataPerComp.find((t) => t.componentId.isEqualWithoutVersion(componentToTag.id));
            if (!tagData) throw new Error(`tag-data is missing for ${componentToTag.id.toStringWithoutVersion()}`);
            if (!tagData.versionToTag)
              throw new Error(`tag-data.TagResults is missing for ${componentToTag.id.toStringWithoutVersion()}`);
            const exactVersionOrReleaseType = getValidVersionOrReleaseType(tagData.versionToTag);
            return modelComponent.getVersionToAdd(
              exactVersionOrReleaseType.releaseType,
              exactVersionOrReleaseType.exactVersion,
              incrementBy,
              tagData.prereleaseId
            );
          }
          if (nextVersion && persist) {
            const exactVersionOrReleaseType = getValidVersionOrReleaseType(nextVersion);
            return modelComponent.getVersionToAdd(
              exactVersionOrReleaseType.releaseType,
              exactVersionOrReleaseType.exactVersion,
              undefined,
              componentToTag.componentMap?.nextVersion?.preRelease
            );
          }
          if (isAutoTag) {
            // auto-tag always bumped as patch unless it's pre-release
            if (isPreReleaseLike) {
              return soft
                ? (releaseType as string)
                : modelComponent.getVersionToAdd(releaseType, exactVersion, incrementBy, preReleaseId);
            }
            return soft ? 'patch' : modelComponent.getVersionToAdd('patch', undefined, incrementBy, preReleaseId);
          }
          const versionByEnteredId = this.getVersionByEnteredId(this.ids, componentToTag, modelComponent);
          return soft
            ? versionByEnteredId || exactVersion || (releaseType as string)
            : versionByEnteredId ||
                modelComponent.getVersionToAdd(releaseType, exactVersion, incrementBy, preReleaseId);
        };
        const newVersion = getNewVersion();
        componentToTag.setNewVersion(newVersion);
      })
    );
  }

  private setCurrentSchema() {
    this.allComponentsToTag.forEach((component) => {
      component.schema = CURRENT_SCHEMA;
    });
  }

  private setHashes(): void {
    this.allComponentsToTag.forEach((componentToTag) => {
      componentToTag.setNewVersion(sha1(v4()));
    });
  }

  private getVersionByEnteredId(
    enteredIds: ComponentIdList,
    component: ConsumerComponent,
    modelComponent: ModelComponent
  ): string | undefined {
    const enteredId = enteredIds.searchWithoutVersion(component.id);
    if (enteredId && enteredId.hasVersion()) {
      const exactVersionOrReleaseType = getValidVersionOrReleaseType(enteredId.version as string);
      return modelComponent.getVersionToAdd(
        exactVersionOrReleaseType.releaseType,
        exactVersionOrReleaseType.exactVersion
      );
    }
    return undefined;
  }

  private addBuildStatus(components: ConsumerComponent[], buildStatus: BuildStatus) {
    components.forEach((component) => {
      component.buildStatus = component.isRemoved() ? BuildStatus.Skipped : buildStatus;
    });
  }

  /**
   * otherwise, tagging without build will have the old build data of the previous snap/tag.
   * in case we currently build, it's ok to leave the data as is, because it'll be overridden anyway.
   */
  private emptyBuilderData() {
    this.allComponentsToTag.forEach((component) => {
      component.extensions = component.extensions.clone();
      const existingBuilder = component.extensions.findCoreExtension(Extensions.builder);
      if (existingBuilder) existingBuilder.data = {};
    });
  }

  private updateDependenciesVersions() {
    // filter out removed components.
    // if a component has a deleted-component as a dependency, it was probably running "bit install <dep>" with a version
    // from main. we want to keep it as the user requested. Otherwise, this changes the dependency version to the newly
    // snapped one unintentionally.
    const componentsToTag = this.allComponentsToTag.filter((c) => !c.isRemoved());
    const getNewDependencyVersion = (id: ComponentID): ComponentID | null => {
      const foundDependency = componentsToTag.find((component) => component.id.isEqualWithoutVersion(id));
      return foundDependency ? id.changeVersion(foundDependency.version) : null;
    };
    const changeExtensionsVersion = (component: ConsumerComponent): void => {
      component.extensions.forEach((ext) => {
        if (ext.extensionId) {
          const newDepId = getNewDependencyVersion(ext.extensionId);
          if (newDepId) ext.extensionId = newDepId;
        }
      });
    };

    componentsToTag.forEach((oneComponentToTag) => {
      oneComponentToTag.getAllDependencies().forEach((dependency) => {
        const newDepId = getNewDependencyVersion(dependency.id);
        if (newDepId) dependency.id = newDepId;
      });
      changeExtensionsVersion(oneComponentToTag);
      oneComponentToTag = this.dependencyResolver.updateDepsOnLegacyTag(
        oneComponentToTag,
        getNewDependencyVersion.bind(this)
      );
    });
  }

  private async addLogToComponents(
    components: ConsumerComponent[],
    autoTagComps: ConsumerComponent[],
    messagePerComponent: MessagePerComponent[]
  ) {
    let { message } = this.params;
    const { persist, copyLogFromPreviousSnap } = this.params;
    // @ts-ignore this happens when running `bit tag -m ""`.
    if (message === true) {
      message = '';
    }
    const basicLog = await getBasicLog();
    const getLog = (component: ConsumerComponent): Log => {
      const nextVersion = persist ? component.componentMap?.nextVersion : null;
      const msgFromEditor = messagePerComponent.find((item) => item.id.isEqualWithoutVersion(component.id))?.msg;
      if (copyLogFromPreviousSnap) {
        const currentLog = component.log;
        if (!currentLog) {
          throw new Error(
            `addLogToComponents is set  copyLogFromPreviousSnap: true, but it is unable to find log in the previous snap`
          );
        }
        currentLog.message = msgFromEditor || message || currentLog.message;
        currentLog.date = basicLog.date;
        return currentLog;
      }

      return {
        username: nextVersion?.username || basicLog.username,
        email: nextVersion?.email || basicLog.email,
        message: nextVersion?.message || msgFromEditor || message,
        date: basicLog.date,
      };
    };

    components.forEach((component) => {
      component.log = getLog(component);
    });
    autoTagComps.forEach((autoTagComp) => {
      autoTagComp.log = getLog(autoTagComp);
      const defaultMsg = 'bump dependencies versions';
      if (message) {
        autoTagComp.log.message += ` (${defaultMsg})`;
      } else if (!autoTagComp.log.message) {
        autoTagComp.log.message = defaultMsg;
      }
    });
  }
}

async function throwForNewestVersion(allComponentsToTag: ConsumerComponent[], legacyScope: Scope) {
  const newestVersionsP = allComponentsToTag.map(async (component) => {
    if (component.componentFromModel) {
      // otherwise it's a new component, so this check is irrelevant
      const modelComponent = await legacyScope.getModelComponentIfExist(component.id);
      if (!modelComponent) throw new BitError(`component ${component.id} was not found in the model`);
      if (!modelComponent.listVersions().length) return null; // no versions yet, no issues.
      const latest = modelComponent.getHeadRegardlessOfLaneAsTagOrHash();
      if (latest !== component.version) {
        return {
          componentId: component.id.toStringWithoutVersion(),
          currentVersion: component.version!,
          latestVersion: latest,
        };
      }
    }
    return null;
  });
  const newestVersions = await Promise.all(newestVersionsP);
  const newestVersionsWithoutEmpty = compact(newestVersions);
  if (newestVersionsWithoutEmpty.length) {
    throw new NewerVersionFound(newestVersionsWithoutEmpty);
  }
}

function addIntegritiesToConsumerComponentsGraphs(
  packageIntegritiesByPublishedPackages: PackageIntegritiesByPublishedPackages,
  consumerComponents: ConsumerComponent[]
) {
  const _addIntegritiesToDependenciesGraph = addIntegritiesToDependenciesGraph.bind(
    null,
    packageIntegritiesByPublishedPackages
  );
  for (const consumerComponent of consumerComponents) {
    if (consumerComponent.dependenciesGraph) {
      consumerComponent.dependenciesGraph = _addIntegritiesToDependenciesGraph(consumerComponent.dependenciesGraph);
    }
  }
}

/**
 * Updates the dependencies graph by replacing all "pending" version numbers of component dependencies
 * with the actual version numbers of the recently published packages. It also attaches the integrity
 * checksums of these components to ensure data integrity for each resolved dependency.
 *
 * @param packageIntegritiesByPublishedPackages - A map of package names and versions to their integrity checksums.
 * @param dependenciesGraph - The current dependencies graph, containing nodes with potentially "pending" versions.
 * @returns A new DependenciesGraph with updated versions and integrity checksums for all previously pending dependencies.
 */
function addIntegritiesToDependenciesGraph(
  packageIntegritiesByPublishedPackages: PackageIntegritiesByPublishedPackages,
  dependenciesGraph: DependenciesGraph
): DependenciesGraph {
  const resolvedVersions: Array<{ name: string; version: string; previouslyUsedVersion?: string; }> = [];
  for (const [selector, { integrity, previouslyUsedVersion }] of packageIntegritiesByPublishedPackages.entries()) {
    if (integrity == null) continue;
    const index = selector.indexOf('@', 1);
    const name = selector.substring(0, index);
    const version = selector.substring(index + 1);
    const pendingPkg = dependenciesGraph.packages.get(`${name}@pending:`) ?? dependenciesGraph.packages.get(`${name}@${previouslyUsedVersion}`);
    if (pendingPkg) {
      pendingPkg.resolution = { integrity };
      resolvedVersions.push({ name, version, previouslyUsedVersion });
    }
  }
  return replacePendingVersions(dependenciesGraph, resolvedVersions) as DependenciesGraph;
}

async function removeDeletedComponentsFromBitmap(
  comps: ConsumerComponent[],
  workspace?: Workspace
): Promise<ComponentIdList | undefined> {
  if (!workspace) {
    return undefined;
  }
  const removedComps = comps.filter((comp) => comp.isRemoved());
  if (!removedComps.length) return undefined;
  const compBitIdsToRemove = ComponentIdList.fromArray(removedComps.map((c) => c.id));
  await deleteComponentsFiles(workspace.consumer, compBitIdsToRemove);
  await workspace.consumer.cleanFromBitMap(compBitIdsToRemove);

  return compBitIdsToRemove;
}

async function removeMergeConfigFromComponents(
  unmergedComps: ComponentID[],
  components: ConsumerComponent[],
  workspace?: Workspace
) {
  if (!workspace || !unmergedComps.length) {
    return;
  }
  const configMergeFile = workspace.getConflictMergeFile();

  unmergedComps.forEach((compId) => {
    const isNowSnapped = components.find((c) => c.id.isEqualWithoutVersion(compId));
    if (isNowSnapped) {
      configMergeFile.removeConflict(compId.toStringWithoutVersion());
    }
  });
  const currentlyUnmerged = workspace ? await workspace.listComponentsDuringMerge() : [];
  if (configMergeFile.hasConflict() && currentlyUnmerged.length) {
    // it's possible that "workspace" section is still there. but if all "unmerged" are now merged,
    // then, it's safe to delete the file.
    await configMergeFile.write();
  } else {
    await configMergeFile.delete();
  }
}

export type BitCloudUser = {
  username?: string;
  name?: string;
  displayName?: string;
  profileImage?: string;
};

function isAvailableOnMain(currentLane: LaneId, modelComponent: ModelComponent, id: ComponentID) {
  if (currentLane.isDefault()) {
    return true;
  }
  if (!id.hasVersion()) {
    // component was unsnapped on the current lane and is back to a new component
    return true;
  }
  return modelComponent.hasHead();
}

export async function updateVersions(
  workspace: Workspace,
  stagedConfig: StagedConfig,
  currentLane: LaneId,
  modelComponent: ModelComponent,
  versionToSetInBitmap?: string, // helpful for detached head
  isTag = true
) {
  const consumer = workspace.consumer;
  const idLatest: ComponentID = modelComponent.toBitIdWithLatestVersionAllowNull();
  const id = versionToSetInBitmap ? idLatest.changeVersion(versionToSetInBitmap) : idLatest;
  const isOnBitmap = consumer.bitMap.getComponentIfExist(id, { ignoreVersion: true });
  if (!isOnBitmap && !isTag) {
    // handle the case when a component was deleted, snapped/tagged and is now reset.
    const stagedData = stagedConfig.getPerId(id);
    if (stagedData?.config && stagedData.config[RemoveAspect.id]) {
      consumer.bitMap.addFromComponentJson(stagedData.id, stagedData.componentMapObject);
    }
  }
  consumer.bitMap.updateComponentId(id, undefined, undefined, true);
  const availableOnMain = isAvailableOnMain(currentLane, modelComponent, id);
  if (!availableOnMain) {
    consumer.bitMap.setOnLanesOnly(id, true);
  }
  const componentMap = consumer.bitMap.getComponent(id);
  const compId = await workspace.resolveComponentId(id);
  // it can be either a tag/snap or reset.
  if (isTag) {
    const compMapObj = componentMap.toPlainObject();
    const config = componentMap.config;
    stagedConfig.addComponentConfig(compId, config, compMapObj);
    consumer.bitMap.removeConfig(id);
    const hash = modelComponent.getRef(id.version as string);
    if (!hash) throw new Error(`updateComponentsVersions: unable to find a hash for ${id.toString()}`);
    workspace.scope.legacyScope.stagedSnaps.addSnap(hash?.toString());
  } else if (!componentMap.config) {
    componentMap.config = stagedConfig.getConfigPerId(compId);
  }
  componentMap.clearNextVersion();
}

function replacePendingVersions(
  graph: DependenciesGraph,
  resolvedVersions: Array<{ name: string; version: string; previouslyUsedVersion?: string; }>
): DependenciesGraph {
  let s = graph.serialize();
  for (const { name, version, previouslyUsedVersion } of resolvedVersions) {
    s = s.replaceAll(`${name}@pending:`, `${name}@${version}`);
    if (previouslyUsedVersion) {
      s = s.replaceAll(`${name}@${previouslyUsedVersion}:`, `${name}@${version}`);
    }
  }
  const updatedDependenciesGraph = DependenciesGraph.deserialize(s);
  // This should never happen as we know at this point that the schema version is supported
  if (updatedDependenciesGraph == null) {
    throw new BitError('Failed to deserialize dependencies graph in replacePendingVersions()');
  }
  return updatedDependenciesGraph;
}

/**
 * relevant for "_tag" (tag-from-scope) command.
 * the new tag uses the same files/config/build-artifacts as the previous snap.
 * we want to mark the previous snap as hidden. so then "bit log" and "bit blame" won't show it.
 */
async function updateHiddenProp(scope: ScopeMain, ids: ComponentID[]) {
  const log = await getBasicLog();
  log.message = 'marked as hidden';
  await pMapPool(
    ids,
    async (id) => {
      const versionObj = await scope.getBitObjectVersionById(id);
      if (!versionObj) return;
      versionObj.hidden = true;
      versionObj.addModifiedLog(log);
      scope.legacyScope.objects.add(versionObj);
    },
    { concurrency: 50 }
  );
}
