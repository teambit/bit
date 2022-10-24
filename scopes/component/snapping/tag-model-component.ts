import mapSeries from 'p-map-series';
import fetch from 'node-fetch';
import R from 'ramda';
import { isEmpty } from 'lodash';
import { ReleaseType } from 'semver';
import { v4 } from 'uuid';
import * as globalConfig from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { Scope } from '@teambit/legacy/dist/scope';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import {
  BuildStatus,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  CFG_USER_TOKEN_KEY,
  BASE_CLOUD_DOMAIN,
  Extensions,
} from '@teambit/legacy/dist/constants';
import { CURRENT_SCHEMA } from '@teambit/legacy/dist/consumer/component/component-schema';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { NewerVersionFound } from '@teambit/legacy/dist/consumer/exceptions';
import ShowDoctorError from '@teambit/legacy/dist/error/show-doctor-error';
import logger from '@teambit/legacy/dist/logger/logger';
import { OnTagOpts } from '@teambit/builder/builder.main.runtime';
import { sha1 } from '@teambit/legacy/dist/utils';
import { AutoTagResult, getAutoTagInfo } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { getValidVersionOrReleaseType } from '@teambit/legacy/dist/utils/semver-helper';
import { BuilderMain } from '@teambit/builder';
import { Log } from '@teambit/legacy/dist/scope/models/version';
import {
  MessagePerComponent,
  MessagePerComponentFetcher,
} from '@teambit/legacy/dist/scope/component-ops/message-per-component';
import { ModelComponent } from '@teambit/legacy/dist/scope/models';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { SnappingMain, TagDataPerComp } from './snapping.main.runtime';

export type onTagIdTransformer = (id: BitId) => BitId | null;

export type BasicTagParams = {
  message: string;
  ignoreNewestVersion?: boolean;
  skipTests?: boolean;
  skipAutoTag?: boolean;
  build?: boolean;
  soft?: boolean;
  persist: boolean;
  disableTagAndSnapPipelines?: boolean;
  forceDeploy?: boolean;
  preReleaseId?: string;
  editor?: string;
  unmodified?: boolean;
};

function updateDependenciesVersions(componentsToTag: Component[], dependencyResolver: DependencyResolverMain): void {
  const getNewDependencyVersion = (id: BitId): BitId | null => {
    const foundDependency = componentsToTag.find((component) => component.id.isEqualWithoutVersion(id));
    return foundDependency ? id.changeVersion(foundDependency.version) : null;
  };
  const changeExtensionsVersion = (component: Component): void => {
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

function setHashes(componentsToTag: Component[]): void {
  componentsToTag.forEach((componentToTag) => {
    componentToTag.version = sha1(v4());
  });
}

async function setFutureVersions(
  componentsToTag: Component[],
  scope: Scope,
  releaseType: ReleaseType | undefined,
  exactVersion: string | null | undefined,
  persist: boolean,
  autoTagIds: BitIds,
  ids: BitIds,
  incrementBy?: number,
  preRelease?: string,
  soft?: boolean,
  tagDataPerComp?: TagDataPerComp[]
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const isAutoTag = autoTagIds.hasWithoutVersion(componentToTag.id);
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const nextVersion = componentToTag.componentMap?.nextVersion?.version;
      componentToTag.previouslyUsedVersion = componentToTag.version;
      if (tagDataPerComp) {
        const tagData = tagDataPerComp.find((t) => t.componentId._legacy.isEqualWithoutVersion(componentToTag.id));
        if (!tagData) throw new Error(`tag-data is missing for ${componentToTag.id.toStringWithoutVersion()}`);
        const exactVersionOrReleaseType = getValidVersionOrReleaseType(tagData.versionToTag);
        componentToTag.version = modelComponent.getVersionToAdd(
          exactVersionOrReleaseType.releaseType,
          exactVersionOrReleaseType.exactVersion,
          undefined,
          tagData.prereleaseId
        );
      } else if (nextVersion && persist) {
        const exactVersionOrReleaseType = getValidVersionOrReleaseType(nextVersion);
        componentToTag.version = modelComponent.getVersionToAdd(
          exactVersionOrReleaseType.releaseType,
          exactVersionOrReleaseType.exactVersion,
          undefined,
          componentToTag.componentMap?.nextVersion?.preRelease
        );
      } else if (isAutoTag) {
        // auto-tag always bumped as patch
        componentToTag.version = soft
          ? 'patch'
          : modelComponent.getVersionToAdd('patch', undefined, incrementBy, preRelease);
      } else {
        const versionByEnteredId = getVersionByEnteredId(ids, componentToTag, modelComponent);
        componentToTag.version = soft
          ? versionByEnteredId || exactVersion || releaseType
          : versionByEnteredId || modelComponent.getVersionToAdd(releaseType, exactVersion, incrementBy, preRelease);
      }
    })
  );
}

function getVersionByEnteredId(
  enteredIds: BitIds,
  component: Component,
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
  skipBuildPipeline = false,
  message,
  editor,
  exactVersion,
  releaseType,
  preReleaseId,
  ignoreNewestVersion = false,
  skipTests = false,
  skipAutoTag,
  soft,
  build,
  persist,
  isSnap = false,
  disableTagAndSnapPipelines,
  forceDeploy,
  incrementBy,
  packageManagerConfigRootDir,
  dependencyResolver,
}: {
  workspace?: Workspace;
  scope: ScopeMain;
  snapping: SnappingMain;
  builder: BuilderMain;
  consumerComponents: Component[];
  ids: BitIds;
  tagDataPerComp?: TagDataPerComp[];
  skipBuildPipeline?: boolean;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  isSnap?: boolean;
  packageManagerConfigRootDir?: string;
  dependencyResolver: DependencyResolverMain;
} & BasicTagParams): Promise<{
  taggedComponents: Component[];
  autoTaggedResults: AutoTagResult[];
  publishedPackages: string[];
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
  const componentsToTag: Component[] = R.values(consumerComponentsIdsMap); // consumerComponents unique
  const idsToTag = BitIds.fromArray(componentsToTag.map((c) => c.id));
  // ids without versions are new. it's impossible that tagged (and not-modified) components has
  // them as dependencies.
  const idsToTriggerAutoTag = idsToTag.filter((id) => id.hasVersion());
  const autoTagData =
    skipAutoTag || !consumer ? [] : await getAutoTagInfo(consumer, BitIds.fromArray(idsToTriggerAutoTag));
  const autoTagComponents = autoTagData.map((autoTagItem) => autoTagItem.component);
  const autoTagComponentsFiltered = autoTagComponents.filter((c) => !idsToTag.has(c.id));
  const autoTagIds = BitIds.fromArray(autoTagComponentsFiltered.map((autoTag) => autoTag.id));
  const allComponentsToTag = [...componentsToTag, ...autoTagComponentsFiltered];

  const messagesFromEditorFetcher = new MessagePerComponentFetcher(idsToTag, autoTagIds);
  const getMessagePerId = async () => {
    if (editor) return messagesFromEditorFetcher.getMessagesFromEditor(legacyScope.tmp, editor);
    if (tagDataPerComp) return tagDataPerComp.map((t) => ({ id: t.componentId._legacy, msg: t.message || message }));
    return [];
  };
  const messagePerId = await getMessagePerId();

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion && !isSnap) {
    const newestVersionsP = allComponentsToTag.map(async (component) => {
      if (component.componentFromModel) {
        // otherwise it's a new component, so this check is irrelevant
        const modelComponent = await legacyScope.getModelComponentIfExist(component.id);
        if (!modelComponent) throw new ShowDoctorError(`component ${component.id} was not found in the model`);
        if (!modelComponent.listVersions().length) return null; // no versions yet, no issues.
        const latest = modelComponent.latest();
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
  setCurrentSchema(allComponentsToTag);
  // go through all dependencies and update their versions
  updateDependenciesVersions(allComponentsToTag, dependencyResolver);

  await addLogToComponents(componentsToTag, autoTagComponents, persist, message, messagePerId);

  if (soft) {
    if (!consumer) throw new Error(`unable to soft-tag without consumer`);
    consumer.updateNextVersionOnBitmap(allComponentsToTag, preReleaseId);
  } else {
    await snapping._addFlattenedDependenciesToComponents(legacyScope, allComponentsToTag);
    emptyBuilderData(allComponentsToTag);
    addBuildStatus(allComponentsToTag, BuildStatus.Pending);
    await addComponentsToScope(legacyScope, snapping, allComponentsToTag, Boolean(build), consumer);
    if (workspace) await updateComponentsVersions(workspace, allComponentsToTag);
  }

  const publishedPackages: string[] = [];
  if (build) {
    const onTagOpts: OnTagOpts = {
      disableTagAndSnapPipelines,
      throwOnError: true,
      forceDeploy,
      skipTests,
      isSnap,
      skipBuildPipeline,
    };
    const seedersOnly = !workspace; // if tag from scope, build only the given components
    const isolateOptions = { packageManagerConfigRootDir, seedersOnly };

    await scope.reloadAspectsWithNewVersion(allComponentsToTag);
    const harmonyComps = await (workspace || scope).getManyByLegacy(allComponentsToTag);
    const { builderDataMap } = await builder.tagListener(harmonyComps, onTagOpts, isolateOptions);
    const buildResult = scope.builderDataMapToLegacyOnTagResults(builderDataMap);

    snapping._updateComponentsByTagResult(allComponentsToTag, buildResult);
    publishedPackages.push(...snapping._getPublishedPackages(allComponentsToTag));
    addBuildStatus(allComponentsToTag, BuildStatus.Succeed);
    await mapSeries(allComponentsToTag, (consumerComponent) => snapping._enrichComp(consumerComponent));
  }

  if (!soft) {
    await removeDeletedComponentsFromBitmap(allComponentsToTag, workspace);
    await legacyScope.objects.persist();
  }

  return { taggedComponents: componentsToTag, autoTaggedResults: autoTagData, publishedPackages };
}

async function removeDeletedComponentsFromBitmap(comps: Component[], workspace?: Workspace) {
  if (!workspace) {
    return;
  }
  await Promise.all(
    comps.map(async (comp) => {
      if (comp.removed) {
        const compId = await workspace.resolveComponentId(comp.id);
        workspace.bitMap.removeComponent(compId);
      }
    })
  );
}

async function addComponentsToScope(
  scope: Scope,
  snapping: SnappingMain,
  components: Component[],
  shouldValidateVersion: boolean,
  consumer?: Consumer
) {
  const lane = await scope.getCurrentLaneObject();
  if (consumer) {
    await mapSeries(components, async (component) => {
      await snapping._addCompToObjects({
        source: component,
        consumer,
        lane,
        shouldValidateVersion,
      });
    });
  } else {
    await mapSeries(components, async (component) => {
      await snapping._addCompFromScopeToObjects(component, lane);
    });
  }
}

function emptyBuilderData(components: Component[]) {
  components.forEach((component) => {
    const existingBuilder = component.extensions.findCoreExtension(Extensions.builder);
    if (existingBuilder) existingBuilder.data = {};
  });
}

async function addLogToComponents(
  components: Component[],
  autoTagComps: Component[],
  persist: boolean,
  message: string,
  messagePerComponent: MessagePerComponent[]
) {
  const username = await globalConfig.get(CFG_USER_NAME_KEY);
  const bitCloudUsername = await getBitCloudUsername();
  const email = await globalConfig.get(CFG_USER_EMAIL_KEY);
  const getLog = (component: Component): Log => {
    const nextVersion = persist ? component.componentMap?.nextVersion : null;
    const msgFromEditor = messagePerComponent.find((item) => item.id.isEqualWithoutVersion(component.id))?.msg;
    return {
      username: nextVersion?.username || bitCloudUsername || username,
      email: nextVersion?.email || email,
      message: nextVersion?.message || msgFromEditor || message,
      date: Date.now().toString(),
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

async function getBitCloudUsername(): Promise<string | undefined> {
  const token = await globalConfig.get(CFG_USER_TOKEN_KEY);
  if (!token) return '';
  try {
    const res = await fetch(`https://api.${BASE_CLOUD_DOMAIN}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const object = await res.json();
    const user = object.payload;
    const username = user.username;
    return username;
  } catch (error) {
    return undefined;
  }
}

function setCurrentSchema(components: Component[]) {
  components.forEach((component) => {
    component.schema = CURRENT_SCHEMA;
  });
}

function addBuildStatus(components: Component[], buildStatus: BuildStatus) {
  components.forEach((component) => {
    component.buildStatus = buildStatus;
  });
}

export async function updateComponentsVersions(
  workspace: Workspace,
  components: Array<ModelComponent | Component>,
  isTag = true
): Promise<any> {
  const consumer = workspace.consumer;
  const currentLane = consumer.getCurrentLaneId();
  const stagedConfig = await workspace.scope.getStagedConfig();
  const isAvailableOnMain = async (component: ModelComponent | Component, id: BitId): Promise<boolean> => {
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

  const updateVersions = async (unknownComponent: ModelComponent | Component) => {
    const id: BitId =
      unknownComponent instanceof ModelComponent
        ? unknownComponent.toBitIdWithLatestVersionAllowNull()
        : unknownComponent.id;
    consumer.bitMap.updateComponentId(id);
    const availableOnMain = await isAvailableOnMain(unknownComponent, id);
    if (!availableOnMain) {
      consumer.bitMap.setComponentProp(id, 'onLanesOnly', true);
    }
    const componentMap = consumer.bitMap.getComponent(id);
    const compId = await workspace.resolveComponentId(id);
    // it can be either a tag/snap or reset.
    if (isTag) {
      const config = componentMap.config;
      stagedConfig.addComponentConfig(compId, config);
      consumer.bitMap.removeConfig(id);
    } else if (!componentMap.config) {
      componentMap.config = stagedConfig.getConfigPerId(compId);
    }
    componentMap.clearNextVersion();
  };
  // important! DO NOT use Promise.all here! otherwise, you're gonna enter into a whole world of pain.
  // imagine tagging comp1 with auto-tagged comp2, comp1 package.json is written while comp2 is
  // trying to get the dependencies of comp1 using its package.json.
  await mapSeries(components, updateVersions);
  await stagedConfig.write();
}
