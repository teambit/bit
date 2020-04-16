import R from 'ramda';
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
import { BitIds } from '../../bit-id';
import ValidationError from '../../error/validation-error';
import { COMPONENT_ORIGINS } from '../../constants';
import { PathLinux } from '../../utils/path';
import { Dependency } from '../../consumer/component/dependencies';
import { bumpDependenciesVersions, getAutoTagPending } from './auto-tag';
import { AutoTagResult } from './auto-tag';
import { buildComponentsGraph } from '../graph/components-graph';
import ShowDoctorError from '../../error/show-doctor-error';
import { getAllFlattenedDependencies } from './get-flattened-dependencies';
import { ExtensionDataEntry } from '../../consumer/config/extension-data';
import GeneralError from '../../error/general-error';

function updateDependenciesVersions(componentsToTag: Component[]): void {
  const updateDependencyVersion = (dependency: Dependency | ExtensionDataEntry, idFieldName = 'id') => {
    const foundDependency = componentsToTag.find(component =>
      component.id.isEqualWithoutVersion(dependency[idFieldName])
    );
    if (foundDependency) {
      dependency[idFieldName] = dependency[idFieldName].changeVersion(foundDependency.version);
      return true;
    }
    return false;
  };
  componentsToTag.forEach(oneComponentToTag => {
    oneComponentToTag.getAllDependencies().forEach(dependency => updateDependencyVersion(dependency));
    // TODO: in case there are core extensions they should be excluded here
    oneComponentToTag.extensions.forEach(extension => {
      // For core extensions there won't be an extensionId but name
      // We only want to add version to external extensions not core extensions
      if (extension.extensionId) {
        const wasDependencyFound = updateDependencyVersion(extension, 'extensionId');
        if (!wasDependencyFound && !extension.extensionId.hasScope() && !extension.extensionId.hasVersion()) {
          throw new GeneralError(`fatal: "${oneComponentToTag.id.toString()}" has an extension "${extension.extensionId.toString()}".
this extension was not included in the tag command.`);
        }
      }
    });
  });
}

async function setFutureVersions(
  componentsToTag: Component[],
  scope: Scope,
  releaseType: ReleaseType,
  exactVersion: string | null | undefined
): Promise<void> {
  await Promise.all(
    componentsToTag.map(async componentToTag => {
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
  verbose = false,
  skipAutoTag
}: {
  consumerComponents: Component[];
  scope: Scope;
  message: string;
  exactVersion: string | null | undefined;
  releaseType: ReleaseType;
  force: boolean | null | undefined;
  consumer: Consumer;
  ignoreNewestVersion: boolean;
  skipTests: boolean;
  verbose?: boolean;
  skipAutoTag: boolean;
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
  const componentsToTag: Component[] = R.values(consumerComponentsIdsMap); // consumerComponents unique
  const componentsToTagIds = componentsToTag.map(c => c.id);
  const componentsToTagIdsLatest = await scope.latestVersions(componentsToTagIds, false);
  const autoTagCandidates = skipAutoTag
    ? new BitIds()
    : consumer.potentialComponentsForAutoTagging(componentsToTagIdsLatest);
  const autoTagComponents = skipAutoTag
    ? []
    : await getAutoTagPending(scope, autoTagCandidates, componentsToTagIdsLatest);
  // scope.toConsumerComponents(autoTaggedCandidates); won't work as it doesn't have the paths according to bitmap
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const autoTagComponentsLoaded = await consumer.loadComponents(autoTagComponents.map(c => c.toBitId()));
  const autoTagConsumerComponents = autoTagComponentsLoaded.components;
  const componentsToBuildAndTest = componentsToTag.concat(autoTagConsumerComponents);

  // check for each one of the components whether it is using an old version
  if (!ignoreNewestVersion) {
    const newestVersionsP = componentsToBuildAndTest.map(async component => {
      if (component.componentFromModel) {
        // otherwise it's a new component, so this check is irrelevant
        const modelComponent = await scope.getModelComponentIfExist(component.id);
        if (!modelComponent) throw new ShowDoctorError(`component ${component.id} was not found in the model`);
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  await setFutureVersions(componentsToTag, scope, releaseType, exactVersion);
  // go through all dependencies and update their versions
  updateDependenciesVersions(componentsToTag);
  // build the dependencies graph
  const allDependenciesGraphs = buildComponentsGraph(componentsToTag);

  const dependenciesCache = {};
  const notFoundDependencies = new BitIds();
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
});
