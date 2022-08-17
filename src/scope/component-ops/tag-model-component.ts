import mapSeries from 'p-map-series';
import fetch from 'node-fetch';
import R from 'ramda';
import { isEmpty, compact } from 'lodash';
import { ReleaseType } from 'semver';
import { v4 } from 'uuid';
import * as globalConfig from '../../api/consumer/lib/global-config';
import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import loader from '../../cli/loader';
import { BuildStatus, CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY, CFG_USER_TOKEN_KEY, Extensions } from '../../constants';
import { CURRENT_SCHEMA } from '../../consumer/component/component-schema';
import Component from '../../consumer/component/consumer-component';
import Consumer from '../../consumer/consumer';
import { NewerVersionFound } from '../../consumer/exceptions';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { sha1 } from '../../utils';
import { AutoTagResult, getAutoTagInfo } from './auto-tag';
import { FlattenedDependenciesGetter } from './get-flattened-dependencies';
import { getValidVersionOrReleaseType } from '../../utils/semver-helper';
import { LegacyOnTagResult } from '../scope';
import { Log } from '../models/version';
import { BasicTagParams } from '../../api/consumer/lib/tag';
import { MessagePerComponent, MessagePerComponentFetcher } from './message-per-component';
import { ModelComponent } from '../models';

export type onTagIdTransformer = (id: BitId) => BitId | null;
type UpdateDependenciesOnTagFunc = (component: Component, idTransformer: onTagIdTransformer) => Component;

let updateDependenciesOnTag: UpdateDependenciesOnTagFunc;
export function registerUpdateDependenciesOnTag(func: UpdateDependenciesOnTagFunc) {
  updateDependenciesOnTag = func;
}

function updateDependenciesVersions(componentsToTag: Component[]): void {
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
    if (updateDependenciesOnTag && typeof updateDependenciesOnTag === 'function') {
      // @ts-ignore
      oneComponentToTag = updateDependenciesOnTag(oneComponentToTag, getNewDependencyVersion.bind(this));
    }
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
  soft?: boolean
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const isAutoTag = autoTagIds.hasWithoutVersion(componentToTag.id);
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const nextVersion = componentToTag.componentMap?.nextVersion?.version;
      componentToTag.previouslyUsedVersion = componentToTag.version;
      if (nextVersion && persist) {
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

export default async function tagModelComponent({
  consumerComponents,
  ids,
  scope,
  message,
  editor,
  exactVersion,
  releaseType,
  preReleaseId,
  consumer,
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
}: {
  consumerComponents: Component[];
  ids: BitIds;
  scope: Scope;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  consumer: Consumer;
  isSnap?: boolean;
  packageManagerConfigRootDir?: string;
} & BasicTagParams): Promise<{
  taggedComponents: Component[];
  autoTaggedResults: AutoTagResult[];
  publishedPackages: string[];
}> {
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

  const autoTagData = skipAutoTag ? [] : await getAutoTagInfo(consumer, BitIds.fromArray(idsToTriggerAutoTag));
  const autoTagComponents = autoTagData.map((autoTagItem) => autoTagItem.component);
  const autoTagComponentsFiltered = autoTagComponents.filter((c) => !idsToTag.has(c.id));
  const autoTagIds = BitIds.fromArray(autoTagComponentsFiltered.map((autoTag) => autoTag.id));
  const allComponentsToTag = [...componentsToTag, ...autoTagComponentsFiltered];

  const messagesFromEditorFetcher = new MessagePerComponentFetcher(idsToTag, autoTagIds);
  const messagePerId = editor ? await messagesFromEditorFetcher.getMessagesFromEditor(scope.tmp, editor) : [];

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion && !isSnap) {
    const newestVersionsP = allComponentsToTag.map(async (component) => {
      if (component.componentFromModel) {
        // otherwise it's a new component, so this check is irrelevant
        const modelComponent = await scope.getModelComponentIfExist(component.id);
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
        scope,
        releaseType,
        exactVersion,
        persist,
        autoTagIds,
        ids,
        incrementBy,
        preReleaseId,
        soft
      );
  setCurrentSchema(allComponentsToTag);
  // go through all dependencies and update their versions
  updateDependenciesVersions(allComponentsToTag);

  await addLogToComponents(componentsToTag, autoTagComponents, persist, message, messagePerId);

  if (soft) {
    consumer.updateNextVersionOnBitmap(allComponentsToTag, preReleaseId);
  } else {
    await addFlattenedDependenciesToComponents(consumer.scope, allComponentsToTag);
    emptyBuilderData(allComponentsToTag);
    addBuildStatus(allComponentsToTag, BuildStatus.Pending);
    await addComponentsToScope(consumer, allComponentsToTag, build);
    await consumer.updateComponentsVersions(allComponentsToTag);
  }

  const publishedPackages: string[] = [];
  if (build) {
    const onTagOpts = { disableTagAndSnapPipelines, throwOnError: true, forceDeploy, skipTests, isSnap };
    const isolateOptions = { packageManagerConfigRootDir };
    const results: Array<LegacyOnTagResult[]> = await mapSeries(scope.onTag, (func) =>
      func(allComponentsToTag, onTagOpts, isolateOptions)
    );
    results.forEach((tagResult) => updateComponentsByTagResult(allComponentsToTag, tagResult));
    publishedPackages.push(...getPublishedPackages(allComponentsToTag));
    addBuildStatus(allComponentsToTag, BuildStatus.Succeed);
    await mapSeries(allComponentsToTag, (consumerComponent) => scope.sources.enrichSource(consumerComponent));
  }

  if (!soft) {
    await scope.objects.persist();
  }

  return { taggedComponents: componentsToTag, autoTaggedResults: autoTagData, publishedPackages };
}

async function addComponentsToScope(consumer: Consumer, components: Component[], shouldValidateVersion: boolean) {
  const lane = await consumer.getCurrentLaneObject();
  await mapSeries(components, async (component) => {
    await consumer.scope.sources.addSource({
      source: component,
      consumer,
      lane,
      shouldValidateVersion,
    });
  });
}

function emptyBuilderData(components: Component[]) {
  components.forEach((component) => {
    const existingBuilder = component.extensions.findCoreExtension(Extensions.builder);
    if (existingBuilder) existingBuilder.data = {};
  });
}

export async function addFlattenedDependenciesToComponents(scope: Scope, components: Component[]) {
  loader.start('importing missing dependencies...');
  const flattenedDependenciesGetter = new FlattenedDependenciesGetter(scope, components);
  await flattenedDependenciesGetter.populateFlattenedDependencies();
  loader.stop();
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
      username: nextVersion?.username || username,
      bitCloudUsername,
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

async function getBitCloudUsername(): Promise<string> {
  const token = await globalConfig.get(CFG_USER_TOKEN_KEY);
  if (!token) return '';
  const res = await fetch(`https://api.bit.cloud/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const object = await res.json();
  const user = object.payload;
  const username = user.username;

  return username;
}

function setCurrentSchema(components: Component[]) {
  components.forEach((component) => {
    component.schema = CURRENT_SCHEMA;
  });
}

/**
 * @todo: currently, there is only one function registered to the OnTag, which is the builder.
 * we set the extensions data and artifacts we got from the builder to the consumer-components.
 * however, if there is more than one function registered to the OnTag, the data will be overridden
 * by the last called function. when/if this happen, some kind of merge need to be done between the
 * results.
 */
export function updateComponentsByTagResult(components: Component[], tagResult: LegacyOnTagResult[]) {
  tagResult.forEach((result) => {
    const matchingComponent = components.find((c) => c.id.isEqual(result.id));
    if (matchingComponent) {
      const existingBuilder = matchingComponent.extensions.findCoreExtension(Extensions.builder);
      if (existingBuilder) existingBuilder.data = result.builderData.data;
      else matchingComponent.extensions.push(result.builderData);
    }
  });
}

export function getPublishedPackages(components: Component[]): string[] {
  const publishedPackages = components.map((comp) => {
    const builderExt = comp.extensions.findCoreExtension(Extensions.builder);
    const pkgData = builderExt?.data?.aspectsData?.find((a) => a.aspectId === Extensions.pkg);
    return pkgData?.data?.publishedPackage;
  });
  return compact(publishedPackages);
}

function addBuildStatus(components: Component[], buildStatus: BuildStatus) {
  components.forEach((component) => {
    component.buildStatus = buildStatus;
  });
}
