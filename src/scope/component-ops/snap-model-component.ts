import R from 'ramda';
import { v4 } from 'uuid';
import pMapSeries from 'p-map-series';
import { Scope } from '..';
import Consumer from '../../consumer/consumer';
import { BEFORE_PERSISTING_PUT_ON_SCOPE, BEFORE_IMPORT_PUT_ON_SCOPE } from '../../cli/loader/loader-messages';
import Component from '../../consumer/component/consumer-component';
import loader from '../../cli/loader';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import { ComponentSpecsFailed } from '../../consumer/exceptions';
import { pathJoinLinux } from '../../utils';
import { BitIds } from '../../bit-id';
import ValidationError from '../../error/validation-error';
import { COMPONENT_ORIGINS } from '../../constants';
import { PathLinux } from '../../utils/path';
import { Dependency } from '../../consumer/component/dependencies';
import { bumpDependenciesVersions, getAutoTagPending } from './auto-tag';
import { AutoTagResult } from './auto-tag';
import { buildComponentsGraph } from '../graph/components-graph';
import { sha1 } from '../../utils';
import { getAllFlattenedDependencies } from './get-flattened-dependencies';

function updateDependenciesVersions(componentsToTag: Component[]): void {
  const updateDependencyVersion = (dependency: Dependency) => {
    const foundDependency = componentsToTag.find(component => component.id.isEqualWithoutVersion(dependency.id));
    if (foundDependency) {
      dependency.id = dependency.id.changeVersion(foundDependency.version);
    }
  };
  componentsToTag.forEach(oneComponentToTag => {
    oneComponentToTag.getAllDependencies().forEach(dependency => updateDependencyVersion(dependency));
  });
}

function setHashes(componentsToTag: Component[]): void {
  componentsToTag.forEach(componentToTag => {
    componentToTag.version = sha1(v4());
  });
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
    const componentFiles = component.pendingVersion.files.map(file => file.relativePath);
    componentMapFiles.forEach(file => {
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

export default async function snapModelComponent({
  consumerComponents,
  scope,
  message,
  force,
  consumer,
  skipTests = false,
  verbose = false,
  skipAutoSnap
}: {
  consumerComponents: Component[];
  scope: Scope;
  message: string;
  force: boolean | null | undefined;
  consumer: Consumer;
  skipTests: boolean;
  verbose?: boolean;
  skipAutoSnap: boolean;
}): Promise<{ taggedComponents: Component[]; autoTaggedResults: AutoTagResult[] }> {
  loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);
  const consumerComponentsIdsMap = {};
  // Concat and unique all the dependencies from all the components so we will not import
  // the same dependency more then once, it's mainly for performance purpose
  consumerComponents.forEach(consumerComponent => {
    const componentIdString = consumerComponent.id.toString();
    // Store it in a map so we can take it easily from the sorted array which contain only the id
    consumerComponentsIdsMap[componentIdString] = consumerComponent;
  });
  const componentsToTag = R.values(consumerComponentsIdsMap); // consumerComponents unique
  const componentsToTagIds = componentsToTag.map(c => c.id);
  const componentsToTagIdsLatest = await scope.latestVersions(componentsToTagIds, false);
  const autoTagCandidates = skipAutoSnap
    ? new BitIds()
    : consumer.potentialComponentsForAutoTagging(componentsToTagIdsLatest);
  const autoTagComponents = skipAutoSnap
    ? []
    : await getAutoTagPending(scope, autoTagCandidates, componentsToTagIdsLatest);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map(c => c.toBitId()));
  const autoTagConsumerComponents = autoTagComponentsLoaded.components;
  const componentsToBuildAndTest = componentsToTag.concat(autoTagConsumerComponents);

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

  // go through all components and generate hashes for them
  setHashes(componentsToTag);
  // go through all dependencies and update their versions
  updateDependenciesVersions(componentsToTag);
  // build the dependencies graph
  const dependenciesCache = {};
  const notFoundDependencies = new BitIds();
  const allDependenciesGraphs = buildComponentsGraph(componentsToTag);
  const persistComponent = async (consumerComponent: Component) => {
    let testResult;
    if (!skipTests) {
      testResult = testsResults.find(result => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return consumerComponent.id.isEqualWithoutScopeAndVersion(result.componentId);
      });
    }
    const {
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies
    } = await getAllFlattenedDependencies(
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
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      message,
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
}
