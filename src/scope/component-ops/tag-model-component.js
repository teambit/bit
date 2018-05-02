// @flow
import path from 'path';
import R from 'ramda';
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
import { ComponentSpecsFailed } from '../../consumer/exceptions';
import { pathNormalizeToLinux } from '../../utils';
import { Source } from '../../consumer/component/sources';
import { DependencyNotFound } from '../exceptions';
import { BitId } from '../../bit-id';
import { flattenDependencyIds } from '../flatten-dependencies';

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
  // console.log('flattened', flattened);
  return R.flatten(flattened);
}

export default (async function tagModelComponent({
  consumerComponents,
  scope,
  message,
  exactVersion,
  releaseType,
  force,
  consumer,
  verbose = false
}: {
  consumerComponents: Component[],
  scope: Scope,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  consumer: Consumer,
  verbose?: boolean
}): Promise<{ taggedComponents: Component[], autoTaggedComponents: ComponentModel[] }> {
  // TODO: Change the return type
  loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);
  const consumerComponentsIdsMap = {};
  // Concat and unique all the dependencies from all the components so we will not import
  // the same dependency more then once, it's mainly for performance purpose
  consumerComponents.forEach((consumerComponent) => {
    const componentIdString = consumerComponent.id.toString();
    // Store it in a map so we can take it easily from the sorted array which contain only the id
    consumerComponentsIdsMap[componentIdString] = consumerComponent;
  });
  const componentsToTag = consumerComponents;
  const componentsToTagIds = componentsToTag.map(c => c.id);
  const componentsToTagIdsLatest = await scope.latestVersions(componentsToTagIds, false);
  const autoTagCandidates = await consumer.candidateComponentsForAutoTagging(componentsToTagIdsLatest);
  const autoTagComponents = await scope.bumpDependenciesVersions(autoTagCandidates, componentsToTagIdsLatest, false);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map(c => c.id()));
  const autoTagConsumerComponents = autoTagComponentsLoaded.components;
  const componentsToBuildAndTest = componentsToTag.concat(autoTagConsumerComponents);

  logger.debug('scope.putMany: sequentially build all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially build all components');
  await scope.buildMultiple(componentsToBuildAndTest, consumer, verbose);

  logger.debug('scope.putMany: sequentially test all components');
  let testsResults = [];
  try {
    testsResults = await scope.testMultiple({
      components: componentsToBuildAndTest,
      consumer,
      verbose,
      rejectOnFailure: !force
    });
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
  await Promise.all(
    componentsToTag.map(async (componentToTag) => {
      const modelComponent = await scope.sources.findOrAddComponent(componentToTag);
      const version = modelComponent.getVersionToAdd(releaseType, exactVersion);
      componentToTag.version = version;
    })
  );
  // go through all dependencies and update their versions
  componentsToTag.forEach((componentToTag) => {
    componentToTag.dependencies.get().forEach((dependency) => {
      if (!dependency.id.hasVersion()) {
        const foundDependency = componentsToTag.find(
          component => component.id.toStringWithoutVersion() === dependency.id.toString()
        );
        if (foundDependency) dependency.id.version = foundDependency.version;
      }
    });
  });
  // build the dependencies graph
  const { graphDeps, graphDevDeps } = buildComponentsGraph(componentsToTag);
  const dependenciesCache = {};
  const persistComponent = async (consumerComponent) => {
    const consumerComponentId = consumerComponent.id.toString();
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
    const dists = !consumerComponent.dists.isEmpty()
      ? consumerComponent.dists.get().map((dist) => {
        return {
          name: dist.basename,
          relativePath: addSharedDirAndDistEntry(dist.relative),
          file: Source.from(dist.contents),
          test: dist.test
        };
      })
      : null;

    const testResult = testsResults.find(result => result.component.id.toString() === consumerComponentId);
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
  await scope.objects.persist();

  return { taggedComponents, autoTaggedComponents };
});
