import R from 'ramda';
import { v4 } from 'uuid';
import { ReleaseType } from 'semver';
import * as RA from 'ramda-adjunct';
import pMapSeries from 'p-map-series';
import { Scope } from '..';
import Consumer from '../../consumer/consumer';
import { BEFORE_PERSISTING_PUT_ON_SCOPE, BEFORE_IMPORT_PUT_ON_SCOPE } from '../../cli/loader/loader-messages';
import Component from '../../consumer/component/consumer-component';
import loader from '../../cli/loader';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import { ComponentSpecsFailed, NewerVersionFound } from '../../consumer/exceptions';
import { pathJoinLinux } from '../../utils';
import { BitIds, BitId } from '../../bit-id';
import ValidationError from '../../error/validation-error';
import { COMPONENT_ORIGINS, Extensions } from '../../constants';
import { PathLinux } from '../../utils/path';
import { bumpDependenciesVersions, getAutoTagPending } from './auto-tag';
import { AutoTagResult } from './auto-tag';
import { buildComponentsGraph } from '../graph/components-graph';
import ShowDoctorError from '../../error/show-doctor-error';
import { getAllFlattenedDependencies } from './get-flattened-dependencies';
import { sha1 } from '../../utils';
import GeneralError from '../../error/general-error';
import { CURRENT_SCHEMA } from '../../consumer/component/component-schema';

function updateDependenciesVersions(componentsToTag: Component[]): void {
  const getNewDependencyVersion = (id: BitId): BitId | null => {
    const foundDependency = componentsToTag.find((component) => component.id.isEqualWithoutVersion(id));
    return foundDependency ? id.changeVersion(foundDependency.version) : null;
  };
  componentsToTag.forEach((oneComponentToTag) => {
    oneComponentToTag.getAllDependencies().forEach((dependency) => {
      const newDepId = getNewDependencyVersion(dependency.id);
      if (newDepId) dependency.id = newDepId;
    });
    // TODO: in case there are core extensions they should be excluded here
    oneComponentToTag.extensions.forEach((extension) => {
      if (extension.name === Extensions.dependencyResolver && extension.data && extension.data.dependencies) {
        extension.data.dependencies.forEach((dep) => {
          const newDepId = getNewDependencyVersion(dep.componentId);
          if (newDepId) dep.componentId = newDepId;
        });
      }
      // For core extensions there won't be an extensionId but name
      // We only want to add version to external extensions not core extensions
      if (!extension.extensionId) return;
      const newDepId = getNewDependencyVersion(extension.extensionId);
      if (newDepId) extension.extensionId = newDepId;
      else if (!extension.extensionId.hasScope() && !extension.extensionId.hasVersion()) {
        throw new GeneralError(`fatal: "${oneComponentToTag.id.toString()}" has an extension "${extension.extensionId.toString()}".
this extension was not included in the tag command.`);
      }
    });
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
  exactVersion: string | null | undefined
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const version = modelComponent.getVersionToAdd(releaseType, exactVersion);
      // @ts-ignore usedVersion is needed only for this, that's why it's not declared on the instance
      componentToTag.usedVersion = componentToTag.version;
      componentToTag.version = version;
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
  resolveUnmerged,
  isSnap = false,
}: {
  consumerComponents: Component[];
  scope: Scope;
  message: string;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  force: boolean | null | undefined;
  consumer: Consumer;
  ignoreNewestVersion?: boolean;
  skipTests: boolean;
  verbose?: boolean;
  skipAutoTag: boolean;
  resolveUnmerged?: boolean;
  isSnap?: boolean;
}): Promise<{ taggedComponents: Component[]; autoTaggedResults: AutoTagResult[] }> {
  loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);
  const consumerComponentsIdsMap = {};
  // Concat and unique all the dependencies from all the components so we will not import
  // the same dependency more then once, it's mainly for performance purpose
  consumerComponents.forEach((consumerComponent) => {
    const componentIdString = consumerComponent.id.toString();
    // Store it in a map so we can take it easily from the sorted array which contain only the id
    consumerComponentsIdsMap[componentIdString] = consumerComponent;
  });
  const componentsToTag: Component[] = R.values(consumerComponentsIdsMap); // consumerComponents unique
  const componentsToTagIds = componentsToTag.map((c) => c.id);
  const componentsToTagIdsLatest = await scope.latestVersions(componentsToTagIds, false);
  const autoTagCandidates = skipAutoTag
    ? new BitIds()
    : consumer.potentialComponentsForAutoTagging(componentsToTagIdsLatest);
  const autoTagComponents = skipAutoTag
    ? []
    : await getAutoTagPending(scope, autoTagCandidates, componentsToTagIdsLatest);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map((c) => c.toBitId()));
  const autoTagConsumerComponents = autoTagComponentsLoaded.components;
  const componentsToBuildAndTest = componentsToTag.concat(autoTagConsumerComponents);

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion && !isSnap) {
    const newestVersionsP = componentsToBuildAndTest.map(async (component) => {
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
    if (!RA.isNilOrEmpty(newestVersionsWithoutEmpty)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      throw new NewerVersionFound(newestVersionsWithoutEmpty);
    }
  }

  logger.debug('scope.putMany: sequentially build all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially build all components');

  const legacyComps: Component[] = [];
  const nonLegacyComps: Component[] = [];

  componentsToBuildAndTest.forEach((c) => {
    // @todo: change this condition to `c.isLegacy` once harmony-beta is merged.
    c.extensions && c.extensions.length && !consumer.isLegacy ? nonLegacyComps.push(c) : legacyComps.push(c);
  });
  if (legacyComps.length) {
    await scope.buildMultiple(componentsToBuildAndTest, consumer, false, verbose);
  }
  if (nonLegacyComps.length) {
    const ids = componentsToBuildAndTest.map((c) => c.id);
    const results: any[] = await Promise.all(scope.onTag.map((func) => func(ids)));
    results.map(updateComponentsByTagResult(componentsToBuildAndTest));
  }

  logger.debug('scope.putMany: sequentially test all components');
  let testsResults = [];
  if (!skipTests) {
    const testsResultsP = scope.testMultiple({
      components: componentsToBuildAndTest,
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

  logger.debug('scope.putMany: sequentially persist all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially persist all components');

  // go through all components and find the future versions for them
  isSnap ? setHashes(componentsToTag) : await setFutureVersions(componentsToTag, scope, releaseType, exactVersion);
  setCurrentSchema(componentsToTag, consumer);
  // go through all dependencies and update their versions
  updateDependenciesVersions(componentsToTag);
  // build the dependencies graph
  const allDependenciesGraphs = buildComponentsGraph(componentsToTag);

  const dependenciesCache = {};
  const notFoundDependencies = new BitIds();
  const lane = await consumer.getCurrentLaneObject();
  const persistComponent = async (consumerComponent: Component) => {
    let testResult;
    if (!skipTests) {
      testResult = testsResults.find((result) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return consumerComponent.id.isEqualWithoutScopeAndVersion(result.componentId);
      });
    }
    const { flattenedDependencies, flattenedDevDependencies } = await getAllFlattenedDependencies(
      scope,
      consumerComponent.id,
      allDependenciesGraphs,
      dependenciesCache,
      notFoundDependencies
    );

    await scope.sources.addSource({
      source: consumerComponent,
      consumer,
      flattenedDependencies,
      flattenedDevDependencies,
      message,
      lane,
      specsResults: testResult ? testResult.specs : undefined,
      resolveUnmerged,
    });
    return consumerComponent;
  };

  // Run the persistence one by one not in parallel!
  loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);
  const taggedComponents = await pMapSeries(componentsToTag, (consumerComponent) =>
    persistComponent(consumerComponent)
  );
  const autoTaggedResults = await bumpDependenciesVersions(scope, autoTagCandidates, taggedComponents, isSnap);
  validateDirManipulation(taggedComponents);
  await scope.objects.persist();
  return { taggedComponents, autoTaggedResults };
}

function setCurrentSchema(components: Component[], consumer: Consumer) {
  if (consumer.isLegacy) return;
  components.forEach((component) => {
    component.schema = CURRENT_SCHEMA;
  });
}

/**
 * This will take a result from the tag hook, and apply it on the components
 * (usually take the result extensions and set them on the components)
 *
 * @param {Component[]} components
 * @returns
 */
function updateComponentsByTagResult(components: Component[]) {
  return (envsResult: any[]) => {
    if (!envsResult || envsResult.length === 0) return;
    envsResult.map(updateComponentsByTagEnvResultsComponents(components));
  };
}

/**
 * This will take a specific env tag result and apply it on the components
 *
 * @param {Component[]} componentsToUpdate
 * @returns
 */
function updateComponentsByTagEnvResultsComponents(componentsToUpdate: Component[]) {
  return (envResult: any) => updateComponentsByTagResultsComponents(componentsToUpdate, envResult?.res?.components);
}

/**
 * This will take the components to update and the modified components by the env service and apply the changes on the component to update
 *
 * @param {Component[]} componentsToUpdate
 * @param {any[]} [envTagResultComponents]
 * @returns
 */
function updateComponentsByTagResultsComponents(componentsToUpdate: Component[], envTagResultComponents?: any[]) {
  if (
    !envTagResultComponents ||
    envTagResultComponents.length === 0 ||
    !envTagResultComponents[0] ||
    !envTagResultComponents[0].length
  )
    return;
  // Since all the services changes the same components we will only use the first service
  // This might create bugs in the future. so if you have a service which return something else, here is the place to fix it.
  envTagResultComponents[0].map(updateComponentsByTagResultsComponent(componentsToUpdate));
}

/**
 * This will take the components to update and apply specific modified component on the matching component to update
 *
 * @param {Component[]} componentsToUpdate
 * @returns
 */
function updateComponentsByTagResultsComponent(componentsToUpdate: Component[]) {
  return (tagResultComponent: any) => {
    const matchingComponent = componentsToUpdate.find((component) =>
      component.id.isEqual(tagResultComponent.id._legacy)
    );
    if (matchingComponent) {
      matchingComponent.extensions = tagResultComponent.config.extensions;
    }
  };
}
