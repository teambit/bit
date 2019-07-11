// @flow
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import graphlib from 'graphlib';
import pMapSeries from 'p-map-series';
import type { Scope } from '..';
import type Consumer from '../../consumer/consumer';
import { BEFORE_PERSISTING_PUT_ON_SCOPE, BEFORE_IMPORT_PUT_ON_SCOPE } from '../../cli/loader/loader-messages';
import type Component from '../../consumer/component/consumer-component';
import loader from '../../cli/loader';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import { ComponentSpecsFailed, NewerVersionFound } from '../../consumer/exceptions';
import { pathJoinLinux } from '../../utils';
import { DependencyNotFound } from '../exceptions';
import { BitId, BitIds } from '../../bit-id';
import { flattenDependencyIds } from '../flatten-dependencies';
import ValidationError from '../../error/validation-error';
import { COMPONENT_ORIGINS } from '../../constants';
import type { PathLinux } from '../../utils/path';
import GeneralError from '../../error/general-error';
import { Dependency } from '../../consumer/component/dependencies';
import { bumpDependenciesVersions, getAutoTagPending } from './auto-tag';
import type { AutoTagResult } from './auto-tag';
import type { BitIdStr } from '../../bit-id/bit-id';
import ScopeComponentsImporter from './scope-components-importer';
import { buildComponentsGraph } from '../graph/components-graph';

async function getFlattenedDependencies(
  scope: Scope,
  component: Component,
  graph: Object,
  cache: Object,
  notFoundDependencies: BitIds,
  prodGraph?: Object
): Promise<BitIds> {
  const id = component.id.toString();
  const edges = getEdges(graph, id);
  if (!edges) return new BitIds();
  const dependencies = getEdgesWithProdGraph(prodGraph, edges);
  if (!dependencies.length) return new BitIds();
  const flattenDependency = async (dependency) => {
    if (cache[dependency]) return cache[dependency];
    // $FlowFixMe if graph doesn't have the node, prodGraph must have it
    const dependencyBitId: BitId = graph.node(dependency) || prodGraph.node(dependency);
    let versionDependencies;
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    if (notFoundDependencies.has(dependencyBitId)) return [dependencyBitId];
    try {
      versionDependencies = await scopeComponentsImporter.importDependencies(BitIds.fromArray([dependencyBitId]));
    } catch (err) {
      if (err instanceof DependencyNotFound) {
        notFoundDependencies.push(dependencyBitId);
        throwWhenDepNotIncluded(component.id, dependencyBitId);
        return [dependencyBitId];
      }
      throw err;
    }
    const flattenedDependencies = await flattenDependencyIds(versionDependencies, scope.objects);
    // Store the flatten dependencies in cache
    cache[dependency] = flattenedDependencies;
    return flattenedDependencies;
  };
  const flattened = await pMapSeries(dependencies, flattenDependency);
  const flattenedUnique = BitIds.uniqFromArray(R.flatten(flattened));
  // when a component has cycle dependencies, the flattenedDependencies contains the component itself. remove it.
  return flattenedUnique.removeIfExistWithoutVersion(component.id);
}

function throwWhenDepNotIncluded(componentId: BitId, dependencyId: BitId) {
  if (!dependencyId.hasScope() && !dependencyId.hasVersion()) {
    throw new GeneralError(`fatal: "${componentId.toString()}" has a dependency "${dependencyId.toString()}".
this dependency was not included in the tag command.`);
  }
}

function getEdges(graph: Object, id: BitIdStr): ?(BitIdStr[]) {
  if (!graph.hasNode(id)) return null;
  const edges = graphlib.alg.preorder(graph, id);
  return R.tail(edges); // the first item is the component itself
}

/**
 * for non-prod files, such as test files, we're interested also with its prod dependency.
 * for example, a test file foo.spec.js of component 'foo', requires bar.js from component
 * 'bar'. 'bar.js' requires 'baz.js' from component 'baz'.
 * when calculating the edges of foo.spec.js by devGraph only, we'll get bar.js but not
 * baz.js because the relationship between bar and baz are set on prodGraph only.
 * @see dev-dependencies.e2e, 'dev-dependency that requires prod-dependency' case.
 */
function getEdgesWithProdGraph(prodGraph: ?Object, dependencies: BitIdStr[]): BitIdStr[] {
  if (!prodGraph) return dependencies;
  // $FlowFixMe
  const prodDependencies = R.flatten(dependencies.map(dependency => getEdges(prodGraph, dependency))).filter(x => x);
  return R.uniq([...dependencies, ...prodDependencies]);
}

function updateDependenciesVersions(componentsToTag: Component[]): void {
  const updateDependencyVersion = (dependency: Dependency) => {
    const foundDependency = componentsToTag.find(component => component.id.isEqualWithoutVersion(dependency.id));
    if (foundDependency) dependency.id = dependency.id.changeVersion(foundDependency.version);
  };
  componentsToTag.forEach((oneComponentToTag) => {
    oneComponentToTag.getAllDependencies().forEach(dependency => updateDependencyVersion(dependency));
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
      // $FlowFixMe usedVersion is needed only for this, that's why it's not declared on the instance
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
    throwOnError(expectedMainFile, component.pendingVersion.mainFile);
    // $FlowFixMe componentMap is set here
    const componentMapFiles = component.componentMap.getAllFilesPaths();
    const componentFiles = component.pendingVersion.files.map(file => file.relativePath);
    componentMapFiles.forEach((file) => {
      const expectedFile = pathAfterDirManipulation(file);
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
  skipTests = false,
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
  skipTests: boolean,
  verbose?: boolean
}): Promise<{ taggedComponents: Component[], autoTaggedResults: AutoTagResult[] }> {
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
  const autoTagCandidates = consumer.potentialComponentsForAutoTagging(componentsToTagIdsLatest);
  // $FlowFixMe unclear error
  const autoTagComponents = await getAutoTagPending(scope, autoTagCandidates, componentsToTagIdsLatest);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map(c => c.toBitId()));
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
  await scope.buildMultiple(componentsToBuildAndTest, consumer, false, verbose);

  logger.debug('scope.putMany: sequentially test all components');
  let testsResults = [];
  if (!skipTests) {
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
  }

  logger.debug('scope.putMany: sequentially persist all components');
  Analytics.addBreadCrumb('scope.putMany', 'scope.putMany: sequentially persist all components');

  // go through all components and find the future versions for them
  await setFutureVersions(componentsToTag, scope, releaseType, exactVersion);
  // go through all dependencies and update their versions
  updateDependenciesVersions(componentsToTag);
  // build the dependencies graph
  const { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps } = buildComponentsGraph(componentsToTag);

  const dependenciesCache = {};
  const notFoundDependencies = new BitIds();
  const persistComponent = async (consumerComponent: Component) => {
    let testResult;
    if (!skipTests) {
      testResult = testsResults.find((result) => {
        return consumerComponent.id.isEqualWithoutScopeAndVersion(result.componentId);
      });
    }
    const flattenedDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphDeps,
      dependenciesCache,
      notFoundDependencies
    );
    const flattenedDevDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphDevDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    const flattenedCompilerDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphCompilerDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    const flattenedTesterDependencies = await getFlattenedDependencies(
      scope,
      consumerComponent,
      graphTesterDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    await scope.sources.addSource({
      source: consumerComponent,
      consumer,
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      message,
      exactVersion,
      releaseType,
      specsResults: testResult ? testResult.specs : undefined
    });
    return consumerComponent;
  };

  // Run the persistence one by one not in parallel!
  loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);

  const taggedComponents = await pMapSeries(componentsToTag, consumerComponent => persistComponent(consumerComponent));
  const autoTaggedResults = await bumpDependenciesVersions(scope, autoTagCandidates, taggedComponents);
  validateDirManipulation(taggedComponents);
  await scope.objects.persist();
  return { taggedComponents, autoTaggedResults };
});
