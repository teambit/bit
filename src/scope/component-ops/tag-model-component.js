// @flow
import path from 'path';
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import graphlib, { Graph } from 'graphlib';
import pMapSeries from 'p-map-series';
import { Scope } from '..';
import { Consumer } from '../../consumer';
import { BEFORE_PERSISTING_PUT_ON_SCOPE, BEFORE_IMPORT_PUT_ON_SCOPE } from '../../cli/loader/loader-messages';
import Component from '../../consumer/component';
import ComponentModel from '../models/component';
import loader from '../../cli/loader';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import { ComponentSpecsFailed, NewerVersionFound } from '../../consumer/exceptions';
import { pathNormalizeToLinux, pathJoinLinux } from '../../utils';
import Source from '../models/source';
import { DependencyNotFound } from '../exceptions';
import { BitId } from '../../bit-id';
import { flattenDependencyIds } from '../flatten-dependencies';
import ValidationError from '../../error/validation-error';
import { COMPONENT_ORIGINS } from '../../constants';
import type { PathLinux } from '../../utils/path';
import GeneralError from '../../error/general-error';

function buildComponentsGraph(components: Component[]) {
  const graphDeps = new Graph();
  const graphDevDeps = new Graph();
  components.forEach((component) => {
    const id = component.id.toString();
    component.dependencies.get().forEach((dependency) => {
      graphDeps.setEdge(id, dependency.id.toString());
    });
    component.devDependencies.get().forEach((dependency) => {
      graphDevDeps.setEdge(id, dependency.id.toString());
    });
  });
  return { graphDeps, graphDevDeps };
}

async function getFlattenedDependencies(
  scope: Scope,
  component: Component,
  graph: Object,
  cache: Object
): Promise<BitId[]> {
  const id = component.id.toString();
  if (!graph.hasNode(id)) return [];
  const edges = graphlib.alg.preorder(graph, id);
  const dependencies = R.tail(edges); // the first item is the component itself
  if (!dependencies.length) return [];
  const flattenedP = dependencies.map(async (dependency) => {
    if (cache[dependency]) return cache[dependency];
    const dependencyBitId = BitId.parse(dependency);
    let versionDependencies;
    try {
      versionDependencies = await scope.importDependencies([dependencyBitId]);
    } catch (err) {
      if (err instanceof DependencyNotFound) {
        return [dependencyBitId];
      }
      throw err;
    }
    const flattenedDependencies = await flattenDependencyIds(versionDependencies, scope.objects);
    // Store the flatten dependencies in cache
    cache[dependency] = flattenedDependencies;
    return flattenedDependencies;
  });
  const flattened = await Promise.all(flattenedP);
  return R.uniq(R.flatten(flattened));
}

function updateDependenciesVersions(componentsToTag: Component[]): void {
  const updateDependencyVersion = (dependency) => {
    const foundDependency = componentsToTag.find(
      component => component.id.toStringWithoutVersion() === dependency.id.toStringWithoutVersion()
    );
    if (foundDependency) dependency.id.version = foundDependency.version;
  };
  componentsToTag.forEach((componentToTag) => {
    componentToTag.dependencies.get().forEach(dependency => updateDependencyVersion(dependency));
    componentToTag.devDependencies.get().forEach(dependency => updateDependencyVersion(dependency));
  });
}

async function setFutureVersions(
  componentsToTag: Component[],
  scope: Scope,
  releaseType: string,
  exactVersion: ?string
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const version = modelComponent.getVersionToAdd(releaseType, exactVersion);
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
 */
function validateOriginallySharedDir(components: Component[]): void {
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
    component.componentFromModel.setOriginallySharedDir();
    const sharedDir = component.componentFromModel.originallySharedDir;
    const pathWithSharedDir = (pathStr: PathLinux) => {
      if (sharedDir && component.componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        return pathJoinLinux(sharedDir, pathStr);
      }
      return pathStr;
    };
    const expectedMainFile = pathWithSharedDir(component.componentMap.mainFile);
    throwOnError(expectedMainFile, component.pendingVersion.mainFile);
    const componentMapFiles = component.componentMap.getAllFilesPaths();
    const componentFiles = component.pendingVersion.files.map(file => file.relativePath);
    componentMapFiles.forEach((file) => {
      const expectedFile = pathWithSharedDir(file);
      if (!componentFiles.includes(expectedFile)) {
        throw new ValidationError(
          `failed validating the component paths, expected a file ${expectedFile} to be in ${componentFiles.toString()} array`
        );
      }
    });
  };
  components.forEach(component => validateComponent(component));
}

export default (async function tagModelComponent({
  consumerComponents,
  scope,
  message,
  exactVersion,
  releaseType,
  force,
  consumer,
  ignoreNewestVersion = false,
  verbose = false
}: {
  consumerComponents: Component[],
  scope: Scope,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  consumer: Consumer,
  ignoreNewestVersion: boolean,
  verbose?: boolean
}): Promise<{ taggedComponents: Component[], autoTaggedComponents: ComponentModel[] }> {
  loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);
  const consumerComponentsIdsMap = {};
  // Concat and unique all the dependencies from all the components so we will not import
  // the same dependency more then once, it's mainly for performance purpose
  consumerComponents.forEach((consumerComponent) => {
    const componentIdString = consumerComponent.id.toString();
    // Store it in a map so we can take it easily from the sorted array which contain only the id
    consumerComponentsIdsMap[componentIdString] = consumerComponent;
  });
  const componentsToTag = R.values(consumerComponentsIdsMap); // consumerComponents unique
  const componentsToTagIds = componentsToTag.map(c => c.id);
  const componentsToTagIdsLatest = await scope.latestVersions(componentsToTagIds, false);
  const autoTagCandidates = await consumer.candidateComponentsForAutoTagging(componentsToTagIdsLatest);
  const autoTagComponents = await scope.bumpDependenciesVersions(autoTagCandidates, componentsToTagIdsLatest, false);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map(c => c.id()));
  const autoTagConsumerComponents = autoTagComponentsLoaded.components;
  const componentsToBuildAndTest = componentsToTag.concat(autoTagConsumerComponents);

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion) {
    const newestVersionsP = componentsToBuildAndTest.map(async (component) => {
      if (component.componentFromModel) {
        // otherwise it's a new component, so this check is irrelevant
        const modelComponent = await scope.getModelComponentIfExist(component.id);
        if (!modelComponent) throw new GeneralError(`component ${component.id} was not found in the model`);
        const latest = modelComponent.latest();
        if (latest !== component.version) {
          return {
            componentId: component.id.toStringWithoutVersion(),
            currentVersion: component.version,
            latestVersion: latest
          };
        }
      }
      return null;
    });
    const newestVersions = await Promise.all(newestVersionsP);
    const newestVersionsWithoutEmpty = newestVersions.filter(newest => newest);
    if (!RA.isNilOrEmpty(newestVersionsWithoutEmpty)) {
      throw new NewerVersionFound(newestVersionsWithoutEmpty);
    }
  }

  logger.debug('scope.putMany: sequentially build all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially build all components');
  await scope.buildMultiple(componentsToBuildAndTest, consumer, verbose);

  logger.debug('scope.putMany: sequentially test all components');
  let testsResults = [];
  const testsResultsP = scope.testMultiple({
    components: componentsToBuildAndTest,
    consumer,
    verbose,
    rejectOnFailure: !force
  });
  try {
    testsResults = await testsResultsP;
  } catch (err) {
    // if force is true, ignore the tests and continue
    if (!force) {
      if (!verbose) throw new ComponentSpecsFailed();
      throw err;
    }
  }
  logger.debug('scope.putMany: sequentially persist all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially persist all components');

  // go through all components and find the future versions for them
  await setFutureVersions(componentsToTag, scope, releaseType, exactVersion);
  // go through all dependencies and update their versions
  updateDependenciesVersions(componentsToTag);
  // build the dependencies graph
  const { graphDeps, graphDevDeps } = buildComponentsGraph(componentsToTag);

  const dependenciesCache = {};
  const persistComponent = async (consumerComponent: Component) => {
    const consumerComponentId = consumerComponent.id.toStringWithoutVersion();
    // when a component is written to the filesystem, the originallySharedDir may be stripped, if it was, the
    // originallySharedDir is written in bit.map, and then set in consumerComponent.originallySharedDir when loaded.
    // similarly, when the dists are written to the filesystem, the dist.entry may be stripped, if it was, the
    // consumerComponent.dists.distEntryShouldBeStripped is set to true.
    // because the model always has the paths of the original author, in case part of the path was stripped, add it
    // back before saving to the model. this way, when the author updates the components, the paths will be correct.
    const addSharedDirAndDistEntry = (pathStr) => {
      const withSharedDir = consumerComponent.originallySharedDir
        ? path.join(consumerComponent.originallySharedDir, pathStr)
        : pathStr;
      const withDistEntry = consumerComponent.dists.distEntryShouldBeStripped
        ? path.join(consumer.bitJson.distEntry, withSharedDir)
        : withSharedDir;
      return pathNormalizeToLinux(withDistEntry);
    };
    const dists =
      !consumerComponent.dists.isEmpty() && consumerComponent.compiler
        ? consumerComponent.dists.get().map((dist) => {
          return {
            name: dist.basename,
            relativePath: addSharedDirAndDistEntry(dist.relative),
            file: Source.from(dist.contents),
            test: dist.test
          };
        })
        : null;
    const testResult = testsResults.find((result) => {
      const idWithoutScopeAndVersion = BitId.parse(result.componentId).toStringWithoutScopeAndVersion();
      const consumerComponentIdWithoutScopeAndVersion = BitId.parse(
        consumerComponentId
      ).toStringWithoutScopeAndVersion();
      return idWithoutScopeAndVersion === consumerComponentIdWithoutScopeAndVersion;
    });
    const flattenedDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphDeps,
      dependenciesCache
    );
    const flattenedDevDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphDevDeps,
      dependenciesCache
    );
    await scope.sources.addSource({
      source: consumerComponent,
      flattenedDependencies,
      flattenedDevDependencies,
      message,
      exactVersion,
      releaseType,
      dists,
      specsResults: testResult ? testResult.specs : undefined
    });
    return consumerComponent;
  };

  // Run the persistence one by one not in parallel!
  loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);

  const taggedComponents = await pMapSeries(componentsToTag, consumerComponent => persistComponent(consumerComponent));
  const taggedIds = taggedComponents.map(c => c.id);
  const autoTaggedComponents = await scope.bumpDependenciesVersions(autoTagCandidates, taggedIds, true);
  validateOriginallySharedDir(taggedComponents);
  await scope.objects.persist();
  return { taggedComponents, autoTaggedComponents };
});
