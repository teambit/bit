import mapSeries from 'p-map-series';
import { isEmpty } from 'lodash';
import { ReleaseType } from 'semver';
import { v4 } from 'uuid';
import { BitError } from '@teambit/bit-error';
import { Scope } from '@teambit/legacy/dist/scope';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BuildStatus, Extensions } from '@teambit/legacy/dist/constants';
import { CURRENT_SCHEMA } from '@teambit/legacy/dist/consumer/component/component-schema';
import { linkToNodeModulesByComponents } from '@teambit/workspace.modules.node-modules-linker';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { NewerVersionFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Component } from '@teambit/component';
import { deleteComponentsFiles } from '@teambit/remove';
import logger from '@teambit/legacy/dist/logger/logger';
import { getValidVersionOrReleaseType } from '@teambit/pkg.modules.semver-helper';
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { AutoTagResult, getAutoTagInfo } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { BuilderMain, OnTagOpts } from '@teambit/builder';
import { Log } from '@teambit/legacy/dist/scope/models/version';
import {
  MessagePerComponent,
  MessagePerComponentFetcher,
} from '@teambit/legacy/dist/scope/component-ops/message-per-component';
import { Lane, ModelComponent } from '@teambit/legacy/dist/scope/models';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ScopeMain, StagedConfig } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { SnappingMain, TagDataPerComp } from './snapping.main.runtime';

export type onTagIdTransformer = (id: ComponentID) => ComponentID | null;

export type BasicTagSnapParams = {
  message: string;
  skipTests?: boolean;
  skipTasks?: string;
  build?: boolean;
  ignoreBuildErrors?: boolean;
  rebuildDepsGraph?: boolean;
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

function updateDependenciesVersions(
  allComponentsToTag: ConsumerComponent[],
  dependencyResolver: DependencyResolverMain
) {
  // filter out removed components.
  // if a component has a deleted-component as a dependency, it was probably running "bit install <dep>" with a version
  // from main. we want to keep it as the user requested. Otherwise, this changes the dependency version to the newly
  // snapped one unintentionally.
  const componentsToTag = allComponentsToTag.filter((c) => !c.isRemoved());
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
    // @ts-ignore
    oneComponentToTag = dependencyResolver.updateDepsOnLegacyTag(oneComponentToTag, getNewDependencyVersion.bind(this));
  });
}

function setHashes(componentsToTag: ConsumerComponent[]): void {
  componentsToTag.forEach((componentToTag) => {
    componentToTag.setNewVersion(sha1(v4()));
  });
}

async function setFutureVersions(
  componentsToTag: ConsumerComponent[],
  scope: Scope,
  releaseType: ReleaseType | undefined,
  exactVersion: string | null | undefined,
  persist: boolean,
  autoTagIds: ComponentIdList,
  ids: ComponentIdList,
  incrementBy?: number,
  preReleaseId?: string,
  soft?: boolean,
  tagDataPerComp?: TagDataPerComp[]
): Promise<void> {
  const isPreReleaseLike = releaseType
    ? ['prerelease', 'premajor', 'preminor', 'prepatch'].includes(releaseType)
    : false;
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const isAutoTag = autoTagIds.hasWithoutVersion(componentToTag.id);
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
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
        const versionByEnteredId = getVersionByEnteredId(ids, componentToTag, modelComponent);
        return soft
          ? versionByEnteredId || exactVersion || (releaseType as string)
          : versionByEnteredId || modelComponent.getVersionToAdd(releaseType, exactVersion, incrementBy, preReleaseId);
      };
      const newVersion = getNewVersion();
      componentToTag.setNewVersion(newVersion);
    })
  );
}

function getVersionByEnteredId(
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

export async function tagModelComponent({
  workspace,
  scope,
  snapping,
  builder,
  consumerComponents,
  ids,
  tagDataPerComp,
  populateArtifactsFrom,
  populateArtifactsIgnorePkgJson,
  message,
  editor,
  exactVersion,
  releaseType,
  preReleaseId,
  ignoreNewestVersion = false,
  skipTests = false,
  skipTasks,
  skipAutoTag,
  soft,
  build,
  persist,
  isSnap = false,
  disableTagAndSnapPipelines,
  ignoreBuildErrors,
  rebuildDepsGraph,
  incrementBy,
  packageManagerConfigRootDir,
  dependencyResolver,
  copyLogFromPreviousSnap = false,
  exitOnFirstFailedTask = false,
  updateDependentsOnLane = false, // on lane, adds it into updateDependents prop
}: {
  workspace?: Workspace;
  scope: ScopeMain;
  snapping: SnappingMain;
  builder: BuilderMain;
  consumerComponents: ConsumerComponent[];
  ids: ComponentIdList;
  tagDataPerComp?: TagDataPerComp[];
  populateArtifactsFrom?: ComponentID[];
  populateArtifactsIgnorePkgJson?: boolean;
  copyLogFromPreviousSnap?: boolean;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  isSnap?: boolean;
  packageManagerConfigRootDir?: string;
  dependencyResolver: DependencyResolverMain;
  exitOnFirstFailedTask?: boolean;
  updateDependentsOnLane?: boolean;
} & BasicTagParams): Promise<{
  taggedComponents: ConsumerComponent[];
  autoTaggedResults: AutoTagResult[];
  publishedPackages: string[];
  stagedConfig?: StagedConfig;
  removedComponents?: ComponentIdList;
}> {
  const consumer = workspace?.consumer;
  const legacyScope = scope.legacyScope;
  const consumerComponentsIdsMap = {};
  // Concat and unique all the dependencies from all the components so we will not import
  // the same dependency more then once, it's mainly for performance purpose
  consumerComponents.forEach((consumerComponent) => {
    const componentIdString = consumerComponent.id.toString();
    // Store it in a map so we can take it easily from the sorted array which contain only the id
    consumerComponentsIdsMap[componentIdString] = consumerComponent;
  });
  const componentsToTag: ConsumerComponent[] = Object.values(consumerComponentsIdsMap); // consumerComponents unique
  const idsToTag = ComponentIdList.fromArray(componentsToTag.map((c) => c.id));
  // ids without versions are new. it's impossible that tagged (and not-modified) components has
  // them as dependencies.
  const idsToTriggerAutoTag = idsToTag.filter((id) => id.hasVersion());
  const autoTagDataWithLocalOnly =
    skipAutoTag || !consumer ? [] : await getAutoTagInfo(consumer, ComponentIdList.fromArray(idsToTriggerAutoTag));
  const localOnly = workspace?.listLocalOnly();
  const autoTagData = localOnly
    ? autoTagDataWithLocalOnly.filter((autoTagItem) => !localOnly.hasWithoutVersion(autoTagItem.component.id))
    : autoTagDataWithLocalOnly;
  const autoTagComponents = autoTagData.map((autoTagItem) => autoTagItem.component);
  const autoTagComponentsFiltered = autoTagComponents.filter((c) => !idsToTag.has(c.id));
  const autoTagIds = ComponentIdList.fromArray(autoTagComponentsFiltered.map((autoTag) => autoTag.id));
  const allComponentsToTag = [...componentsToTag, ...autoTagComponentsFiltered];

  const messagesFromEditorFetcher = new MessagePerComponentFetcher(idsToTag, autoTagIds);
  const getMessagePerId = async () => {
    if (editor) return messagesFromEditorFetcher.getMessagesFromEditor(legacyScope.tmp, editor);
    if (tagDataPerComp) return tagDataPerComp.map((t) => ({ id: t.componentId, msg: t.message || message }));
    return [];
  };
  const messagePerId = await getMessagePerId();

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion && !isSnap) {
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
            currentVersion: component.version,
            latestVersion: latest,
          };
        }
      }
      return null;
    });
    const newestVersions = await Promise.all(newestVersionsP);
    const newestVersionsWithoutEmpty = newestVersions.filter((newest) => newest);
    if (!isEmpty(newestVersionsWithoutEmpty)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      throw new NewerVersionFound(newestVersionsWithoutEmpty);
    }
  }

  logger.debugAndAddBreadCrumb('tag-model-components', 'sequentially persist all components');
  setCurrentSchema(allComponentsToTag);
  // go through all components and find the future versions for them
  isSnap
    ? setHashes(allComponentsToTag)
    : await setFutureVersions(
        allComponentsToTag,
        legacyScope,
        releaseType,
        exactVersion,
        persist,
        autoTagIds,
        ids,
        incrementBy,
        preReleaseId,
        soft,
        tagDataPerComp
      );
  // go through all dependencies and update their versions
  updateDependenciesVersions(allComponentsToTag, dependencyResolver);

  await addLogToComponents(componentsToTag, autoTagComponents, persist, message, messagePerId, copyLogFromPreviousSnap);
  // don't move it down. otherwise, it'll be empty and we don't know which components were during merge.
  // (it's being deleted in snapping.main.runtime - `_addCompToObjects` method)
  const unmergedComps = workspace ? await workspace.listComponentsDuringMerge() : [];
  const lane = await legacyScope.getCurrentLaneObject();
  let stagedConfig;
  if (soft) {
    if (!consumer) throw new Error(`unable to soft-tag without consumer`);
    consumer.updateNextVersionOnBitmap(allComponentsToTag, preReleaseId);
  } else {
    await snapping._addFlattenedDependenciesToComponents(allComponentsToTag, rebuildDepsGraph);
    await snapping.throwForDepsFromAnotherLane(allComponentsToTag);
    if (!build) emptyBuilderData(allComponentsToTag);
    addBuildStatus(allComponentsToTag, BuildStatus.Pending);
    await addComponentsToScope(
      snapping,
      allComponentsToTag,
      lane,
      Boolean(build),
      consumer,
      tagDataPerComp,
      updateDependentsOnLane
    );

    if (workspace) {
      const modelComponents = await Promise.all(
        allComponentsToTag.map((c) => {
          return c.modelComponent || legacyScope.getModelComponent(c.id);
        })
      );
      stagedConfig = await updateComponentsVersions(workspace, modelComponents);
    }
  }

  const publishedPackages: string[] = [];
  let harmonyComps: Component[] = [];
  if (build) {
    const onTagOpts: OnTagOpts = {
      disableTagAndSnapPipelines,
      throwOnError: true,
      forceDeploy: ignoreBuildErrors,
      isSnap,
      populateArtifactsFrom,
    };
    const skipTasksParsed = skipTasks ? skipTasks.split(',').map((t) => t.trim()) : undefined;
    const seedersOnly = !workspace; // if tag from scope, build only the given components
    const isolateOptions = { packageManagerConfigRootDir, seedersOnly, populateArtifactsIgnorePkgJson };
    const builderOptions = { exitOnFirstFailedTask, skipTests, skipTasks: skipTasksParsed };

    const componentsToBuild = allComponentsToTag.filter((c) => !c.isRemoved());
    if (componentsToBuild.length) {
      await scope.reloadAspectsWithNewVersion(componentsToBuild);
      harmonyComps = await (workspace || scope).getManyByLegacy(componentsToBuild);
      const { builderDataMap } = await builder.tagListener(harmonyComps, onTagOpts, isolateOptions, builderOptions);
      const buildResult = scope.builderDataMapToLegacyOnTagResults(builderDataMap);

      snapping._updateComponentsByTagResult(componentsToBuild, buildResult);
      publishedPackages.push(...snapping._getPublishedPackages(componentsToBuild));
      addBuildStatus(componentsToBuild, BuildStatus.Succeed);
      await mapSeries(componentsToBuild, (consumerComponent) => snapping._enrichComp(consumerComponent));
    }
  }

  let removedComponents: ComponentIdList | undefined;
  if (!soft) {
    removedComponents = await removeDeletedComponentsFromBitmap(allComponentsToTag, workspace);
    if (lane) {
      const msgStr = message ? ` (${message})` : '';
      const laneHistory = await legacyScope.lanes.updateLaneHistory(lane, `snap${msgStr}`);
      legacyScope.objects.add(laneHistory);
    }
    await legacyScope.objects.persist();
    await removeMergeConfigFromComponents(unmergedComps, allComponentsToTag, workspace);
    if (workspace) {
      await linkToNodeModulesByComponents(
        harmonyComps.length ? harmonyComps : await workspace.scope.getManyByLegacy(allComponentsToTag),
        workspace
      );
    }
  }

  // clear all objects. otherwise, ModelComponent has the wrong divergeData
  legacyScope.objects.clearObjectsFromCache();

  return {
    taggedComponents: componentsToTag,
    autoTaggedResults: autoTagData,
    publishedPackages,
    stagedConfig,
    removedComponents,
  };
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

async function addComponentsToScope(
  snapping: SnappingMain,
  components: ConsumerComponent[],
  lane: Lane | undefined,
  shouldValidateVersion: boolean,
  consumer?: Consumer,
  tagDataPerComp?: TagDataPerComp[],
  updateDependentsOnLane?: boolean
) {
  await mapSeries(components, async (component) => {
    const results = await snapping._addCompToObjects({
      source: component,
      lane,
      shouldValidateVersion,
      updateDependentsOnLane,
    });
    if (!consumer) {
      const tagData = tagDataPerComp?.find((t) => t.componentId.isEqualWithoutVersion(component.id));
      if (tagData?.isNew) results.version.removeAllParents();
    }
  });
}

/**
 * otherwise, tagging without build will have the old build data of the previous snap/tag.
 * in case we currently build, it's ok to leave the data as is, because it'll be overridden anyway.
 */
function emptyBuilderData(components: ConsumerComponent[]) {
  components.forEach((component) => {
    component.extensions = component.extensions.clone();
    const existingBuilder = component.extensions.findCoreExtension(Extensions.builder);
    if (existingBuilder) existingBuilder.data = {};
  });
}

async function addLogToComponents(
  components: ConsumerComponent[],
  autoTagComps: ConsumerComponent[],
  persist: boolean,
  message: string,
  messagePerComponent: MessagePerComponent[],
  copyLogFromPreviousSnap = false
) {
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

export type BitCloudUser = {
  username?: string;
  name?: string;
  displayName?: string;
  profileImage?: string;
};

function setCurrentSchema(components: ConsumerComponent[]) {
  components.forEach((component) => {
    component.schema = CURRENT_SCHEMA;
  });
}

function addBuildStatus(components: ConsumerComponent[], buildStatus: BuildStatus) {
  components.forEach((component) => {
    component.buildStatus = component.isRemoved() ? BuildStatus.Skipped : buildStatus;
  });
}

export async function updateComponentsVersions(
  workspace: Workspace,
  components: Array<ModelComponent>,
  isTag = true
): Promise<StagedConfig> {
  const consumer = workspace.consumer;
  const currentLane = consumer.getCurrentLaneId();
  const stagedConfig = await workspace.scope.getStagedConfig();
  const isAvailableOnMain = async (
    component: ModelComponent | ConsumerComponent,
    id: ComponentID
  ): Promise<boolean> => {
    if (currentLane.isDefault()) {
      return true;
    }
    if (!id.hasVersion()) {
      // component was unsnapped on the current lane and is back to a new component
      return true;
    }
    const modelComponent =
      component instanceof ModelComponent ? component : await consumer.scope.getModelComponent(component.id);
    return modelComponent.hasHead();
  };

  const updateVersions = async (modelComponent: ModelComponent) => {
    const id: ComponentID = modelComponent.toBitIdWithLatestVersionAllowNull();
    consumer.bitMap.updateComponentId(id, undefined, undefined, true);
    const availableOnMain = await isAvailableOnMain(modelComponent, id);
    if (!availableOnMain) {
      consumer.bitMap.setOnLanesOnly(id, true);
    }
    const componentMap = consumer.bitMap.getComponent(id);
    const compId = await workspace.resolveComponentId(id);
    // it can be either a tag/snap or reset.
    if (isTag) {
      const config = componentMap.config;
      stagedConfig.addComponentConfig(compId, config);
      consumer.bitMap.removeConfig(id);
      const hash = modelComponent.getRef(id.version as string);
      if (!hash) throw new Error(`updateComponentsVersions: unable to find a hash for ${id.toString()}`);
      workspace.scope.legacyScope.stagedSnaps.addSnap(hash?.toString());
    } else if (!componentMap.config) {
      componentMap.config = stagedConfig.getConfigPerId(compId);
    }
    componentMap.clearNextVersion();
  };
  // important! DO NOT use Promise.all here! otherwise, you're gonna enter into a whole world of pain.
  // imagine tagging comp1 with auto-tagged comp2, comp1 package.json is written while comp2 is
  // trying to get the dependencies of comp1 using its package.json.
  await mapSeries(components, updateVersions);
  await workspace.scope.legacyScope.stagedSnaps.write();

  return stagedConfig;
}
