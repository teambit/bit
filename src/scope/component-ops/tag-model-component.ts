import mapSeries from 'p-map-series';
import R from 'ramda';
import { isNilOrEmpty, compact } from 'ramda-adjunct';
import { ReleaseType } from 'semver';
import { v4 } from 'uuid';
import * as globalConfig from '../../api/consumer/lib/global-config';
import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import loader from '../../cli/loader';
import { BuildStatus, CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY, COMPONENT_ORIGINS, Extensions } from '../../constants';
import { CURRENT_SCHEMA } from '../../consumer/component/component-schema';
import Component from '../../consumer/component/consumer-component';
import Consumer from '../../consumer/consumer';
import { ComponentSpecsFailed, NewerVersionFound } from '../../consumer/exceptions';
import ShowDoctorError from '../../error/show-doctor-error';
import ValidationError from '../../error/validation-error';
import logger from '../../logger/logger';
import { pathJoinLinux, sha1 } from '../../utils';
import { PathLinux } from '../../utils/path';
import { AutoTagResult, getAutoTagInfo } from './auto-tag';
import { FlattenedDependenciesGetter } from './get-flattened-dependencies';
import { getValidVersionOrReleaseType } from '../../utils/semver-helper';
import { LegacyOnTagResult } from '../scope';
import { Log } from '../models/version';
import { BasicTagParams } from '../../api/consumer/lib/tag';

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
  incrementBy?: number
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const isAutoTag = autoTagIds.hasWithoutVersion(componentToTag.id);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const nextVersion = componentToTag.componentMap?.nextVersion?.version;
      componentToTag.previouslyUsedVersion = componentToTag.version;
      if (nextVersion && persist) {
        const exactVersionOrReleaseType = getValidVersionOrReleaseType(nextVersion);
        componentToTag.version = modelComponent.getVersionToAdd(
          exactVersionOrReleaseType.releaseType,
          exactVersionOrReleaseType.exactVersion
        );
      } else {
        componentToTag.version = isAutoTag
          ? modelComponent.getVersionToAdd('patch', undefined, incrementBy) // auto-tag always bumped as patch
          : modelComponent.getVersionToAdd(releaseType, exactVersion, incrementBy);
      }
    })
  );
}

/**
 * make sure the originallySharedDir was added before saving the component. also, make sure it was
 * not added twice.
 * we need three objects for this:
 * 1) component.pendingVersion => version pending to be saved in the filesystem. we want to make sure it has the added sharedDir.
 * 2) component.componentFromModel => previous version of the component. it has the original sharedDir.
 * 3) component.componentMap => current paths in the filesystem, which don't have the sharedDir.
 *
 * The component may be changed from the componentFromModel. The files may be removed and added and
 * new files may added, so we can't compare the files of componentFromModel to component.
 *
 * What we can do is calculating the sharedDir from component.componentFromModel
 * then, make sure that calculatedSharedDir + pathFromComponentMap === component.pendingVersion
 *
 * Also, make sure that the wrapDir has been removed
 */
function validateDirManipulation(components: Component[]): void {
  const throwOnError = (expectedPath: PathLinux, actualPath: PathLinux) => {
    if (expectedPath !== actualPath) {
      throw new ValidationError(
        `failed validating the component paths with sharedDir, expected path ${expectedPath}, got ${actualPath}`
      );
    }
  };
  const validateComponent = (component: Component) => {
    if (!component.componentMap) throw new Error(`componentMap is missing from ${component.id.toString()}`);
    if (!component.componentFromModel) return;
    // component.componentFromModel.setOriginallySharedDir();
    const sharedDir = component.componentFromModel.originallySharedDir;
    const wrapDir = component.componentFromModel.wrapDir;
    const pathWithSharedDir = (pathStr: PathLinux): PathLinux => {
      // $FlowFixMe componentMap is set here
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (sharedDir && component.componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        return pathJoinLinux(sharedDir, pathStr);
      }
      return pathStr;
    };
    const pathWithoutWrapDir = (pathStr: PathLinux): PathLinux => {
      if (wrapDir) {
        return pathStr.replace(`${wrapDir}/`, '');
      }
      return pathStr;
    };
    const pathAfterDirManipulation = (pathStr: PathLinux): PathLinux => {
      const withoutWrapDir = pathWithoutWrapDir(pathStr);
      return pathWithSharedDir(withoutWrapDir);
    };
    const expectedMainFile = pathAfterDirManipulation(component.componentMap.mainFile);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    throwOnError(expectedMainFile, component.pendingVersion.mainFile);
    // $FlowFixMe componentMap is set here
    const componentMapFiles = component.componentMap.getAllFilesPaths();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentFiles = component.pendingVersion.files.map((file) => file.relativePath);
    componentMapFiles.forEach((file) => {
      const expectedFile = pathAfterDirManipulation(file);
      if (!componentFiles.includes(expectedFile)) {
        throw new ValidationError(
          `failed validating the component paths, expected a file ${expectedFile} to be in ${componentFiles.toString()} array`
        );
      }
    });
  };
  components.forEach((component) => validateComponent(component));
}

export default async function tagModelComponent({
  consumerComponents,
  scope,
  message,
  exactVersion,
  releaseType,
  force,
  consumer,
  ignoreNewestVersion = false,
  skipTests = false,
  verbose = false,
  skipAutoTag,
  soft,
  build,
  persist,
  resolveUnmerged,
  isSnap = false,
  disableDeployPipeline,
  forceDeploy,
  incrementBy,
}: {
  consumerComponents: Component[];
  scope: Scope;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  consumer: Consumer;
  resolveUnmerged?: boolean;
  isSnap?: boolean;
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
    if (!isNilOrEmpty(newestVersionsWithoutEmpty)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      throw new NewerVersionFound(newestVersionsWithoutEmpty);
    }
  }

  let testsResults = [];
  if (consumer.isLegacy) {
    logger.debugAndAddBreadCrumb('tag-model-components', 'sequentially build all components');
    await scope.buildMultiple(allComponentsToTag, consumer, false, verbose);

    logger.debug('scope.putMany: sequentially test all components');

    if (!skipTests) {
      const testsResultsP = scope.testMultiple({
        components: allComponentsToTag,
        consumer,
        verbose,
        rejectOnFailure: !force,
      });
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        testsResults = await testsResultsP;
      } catch (err) {
        // if force is true, ignore the tests and continue
        if (!force) {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          if (!verbose) throw new ComponentSpecsFailed();
          throw err;
        }
      }
    }
  }

  logger.debugAndAddBreadCrumb('tag-model-components', 'sequentially persist all components');
  // go through all components and find the future versions for them
  isSnap
    ? setHashes(allComponentsToTag)
    : await setFutureVersions(allComponentsToTag, scope, releaseType, exactVersion, persist, autoTagIds, incrementBy);
  setCurrentSchema(allComponentsToTag, consumer);
  // go through all dependencies and update their versions
  updateDependenciesVersions(allComponentsToTag);

  await addLogToComponents(componentsToTag, autoTagComponents, persist, message);

  if (soft) {
    consumer.updateNextVersionOnBitmap(allComponentsToTag, exactVersion, releaseType);
  } else {
    if (!skipTests) addSpecsResultsToComponents(allComponentsToTag, testsResults);
    await addFlattenedDependenciesToComponents(consumer.scope, allComponentsToTag);
    emptyBuilderData(allComponentsToTag);
    addBuildStatus(consumer, allComponentsToTag, BuildStatus.Pending);
    await addComponentsToScope(consumer, allComponentsToTag, Boolean(resolveUnmerged));
    validateDirManipulation(allComponentsToTag);
    await consumer.updateComponentsVersions(allComponentsToTag);
  }

  const publishedPackages: string[] = [];
  if (!consumer.isLegacy && build) {
    const onTagOpts = { disableDeployPipeline, throwOnError: true, forceDeploy, skipTests };
    const results: Array<LegacyOnTagResult[]> = await mapSeries(scope.onTag, (func) =>
      func(allComponentsToTag, onTagOpts)
    );
    results.forEach((tagResult) => updateComponentsByTagResult(allComponentsToTag, tagResult));
    publishedPackages.push(...getPublishedPackages(allComponentsToTag));
    addBuildStatus(consumer, allComponentsToTag, BuildStatus.Succeed);
    await mapSeries(allComponentsToTag, (consumerComponent) => scope.sources.enrichSource(consumerComponent));
  }

  if (!soft) {
    await scope.objects.persist();
  }

  return { taggedComponents: componentsToTag, autoTaggedResults: autoTagData, publishedPackages };
}

async function addComponentsToScope(consumer: Consumer, components: Component[], resolveUnmerged: boolean) {
  const lane = await consumer.getCurrentLaneObject();
  await mapSeries(components, async (component) => {
    await consumer.scope.sources.addSource({
      source: component,
      consumer,
      lane,
      resolveUnmerged,
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

function addSpecsResultsToComponents(components: Component[], testsResults): void {
  components.forEach((component) => {
    const testResult = testsResults.find((result) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.id.isEqualWithoutScopeAndVersion(result.componentId);
    });
    component.specsResults = testResult ? testResult.specs : undefined;
  });
}

async function addLogToComponents(
  components: Component[],
  autoTagComps: Component[],
  persist: boolean,
  message: string
) {
  const username = await globalConfig.get(CFG_USER_NAME_KEY);
  const email = await globalConfig.get(CFG_USER_EMAIL_KEY);
  const getLog = (component: Component): Log => {
    const nextVersion = persist ? component.componentMap?.nextVersion : null;
    return {
      username: nextVersion?.username || username,
      email: nextVersion?.email || email,
      message: nextVersion?.message || message,
      date: Date.now().toString(),
    };
  };

  components.forEach((component) => {
    component.log = getLog(component);
  });
  autoTagComps.forEach((autoTagComp) => {
    autoTagComp.log = getLog(autoTagComp);
    autoTagComp.log.message = `${autoTagComp.log.message} (bump dependencies versions)`;
  });
}

function setCurrentSchema(components: Component[], consumer: Consumer) {
  if (consumer.isLegacy) return;
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

function addBuildStatus(consumer: Consumer, components: Component[], buildStatus: BuildStatus) {
  if (consumer.isLegacy) return;
  components.forEach((component) => {
    component.buildStatus = buildStatus;
  });
}
