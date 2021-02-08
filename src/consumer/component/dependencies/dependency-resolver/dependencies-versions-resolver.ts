import * as path from 'path';
import R from 'ramda';
import semver from 'semver';

import { BitId } from '../../../../bit-id';
import Consumer from '../../../../consumer/consumer';
import logger from '../../../../logger/logger';
import componentIdToPackageName from '../../../../utils/bit/component-id-to-package-name';
import getNodeModulesPathOfComponent from '../../../../utils/bit/component-node-modules-path';
import { resolvePackageData, resolvePackagePath } from '../../../../utils/packages';
import { PathLinux } from '../../../../utils/path';
import Component from '../../../component/consumer-component';
import { ExtensionDataEntry, ExtensionDataList } from '../../../config/extension-data';
import { throwForNonLegacy } from '../../component-schema';
import Dependencies from '../dependencies';
import Dependency from '../dependency';
import { DebugComponentsDependency } from './dependencies-resolver';

/**
 * The dependency version is determined by the following strategies by this order.
 * 1) if the component bit.json or package.json has "overrides" property, check whether the dependency version is overridden
 * 2) if workspace-config overrides this component, use it. (technically this is done via #1 because we merge the two before)
 * 3) if package.json is different than the model, use package.json. to find the package.json follow this steps:
 * 3 a) search in the component directory for package.json and look for dependencies or devDependencies with the name of the dependency
 * 3 b) if not found there, propagate until you reach the consumer root directory.
 * 3 c) if not found, go directly to the dependency directory and find the version in its package.json
 * 4) if bitmap has a version, use it.
 * 5) use the model if it has a version.
 * 6) use the package.json regardless the model.
 *
 * cases where dependency version may be different than the model:
 * 1) user added the component to `overrides` of the workspace config. (workspace bit.json or package.json)
 * 2) user changed package.json, either, manually or by npm-install —save.
 * 3) user updated a dependency with npm without —save.
 * 4) user imported the dependency with different version causing the bitmap to change.
 *
 * keep in mind that since v14.0.5 bit.json doesn't have the dependencies, so it's impossible
 * to change a dependency version from the component bit.json.
 */
export default function updateDependenciesVersions(
  consumer: Consumer,
  component: Component,
  debugDependencies?: DebugComponentsDependency[]
) {
  updateDependencies(component.dependencies);
  updateDependencies(component.devDependencies);
  updateExtensions(component.extensions);

  function resolveVersion(id: BitId): string | undefined {
    // @ts-ignore component.componentFromModel is set
    const idFromModel = getIdFromModelDeps(component.componentFromModel, id);
    const idFromBitMap = getIdFromBitMap(id);
    const idFromComponentConfig = getIdFromComponentConfig(id);
    const getFromComponentConfig = () => idFromComponentConfig;
    const getFromBitMap = () => idFromBitMap || null;
    const getFromModel = () => idFromModel || null;
    const debugDep = debugDependencies?.find((dep) => dep.id.isEqualWithoutVersion(id));

    let strategies: Function[];
    if (consumer.isLegacy) {
      const idFromPackageJson = getIdFromPackageJson(id);
      const idFromDependentPackageJson = getIdFromDependentPackageJson(id);
      // get from packageJson when it was changed from the model or when there is no model.
      const getFromPackageJsonIfChanged = () => {
        if (!idFromPackageJson) return null;
        if (!idFromModel) return idFromPackageJson;
        if (!idFromPackageJson.isEqual(idFromModel)) return idFromPackageJson;
        return null;
      };
      const getFromPackageJson = () => idFromPackageJson || null;
      const getFromDependentPackageJson = () => idFromDependentPackageJson || null;

      strategies = [
        getFromComponentConfig,
        getFromDependentPackageJson,
        getFromPackageJsonIfChanged,
        getFromBitMap,
        getFromModel,
        getFromPackageJson,
      ];
    } else {
      // @todo: change this once vendors feature is in.
      const getCurrentVersion = () => (id.hasVersion() ? id : null);
      strategies = [getFromComponentConfig, getCurrentVersion, getFromBitMap, getFromModel];
    }

    for (const strategy of strategies) {
      const strategyId = strategy();
      if (strategyId) {
        logger.debug(
          `found dependency version ${strategyId.version} for ${id.toString()} in strategy ${strategy.name}`
        );
        if (debugDep) {
          debugDep.versionResolvedFrom =
            strategy.name === 'getCurrentVersion' ? debugDep.versionResolvedFrom : strategy.name.replace('getFrom', '');
          debugDep.version = strategyId.version;
        }

        return strategyId.version;
      }
    }
    return undefined;
  }

  function updateDependency(dependency: Dependency) {
    const resolvedVersion = resolveVersion(dependency.id);
    if (resolvedVersion) {
      dependency.id = dependency.id.changeVersion(resolvedVersion);
    }
  }
  function updateDependencies(dependencies: Dependencies) {
    dependencies.get().forEach(updateDependency);
  }

  function updateExtension(extension: ExtensionDataEntry) {
    if (extension.extensionId) {
      const resolvedVersion = resolveVersion(extension.extensionId);
      if (resolvedVersion) {
        extension.extensionId = extension.extensionId.changeVersion(resolvedVersion);
      }
    }
  }
  function updateExtensions(extensions: ExtensionDataList) {
    extensions.forEach(updateExtension);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  function getIdFromModelDeps(componentFromModel?: Component, componentId: BitId): BitId | null | undefined {
    if (!componentFromModel) return null;
    const dependency = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
    if (!dependency) return null;
    return dependency;
  }

  /**
   * the logic of finding the dependency version in the package.json is mostly done in
   * resolvePackageData function.
   * it first searches in the dependent package.json and propagate up to the consumer root, if not
   * found it goes to the dependency package.json.
   */
  function getIdFromPackageJson(componentId: BitId): BitId | null | undefined {
    throwForNonLegacy(component.isLegacy, getIdFromPackageJson.name);
    if (!componentId.scope) return null;
    // $FlowFixMe component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const rootDir: PathLinux | null | undefined = component.componentMap.rootDir;
    const consumerPath = consumer.getPath();
    const basePath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
    const packagePath = getNodeModulesPathOfComponent({
      ...component,
      id: componentId,
    });
    const packageName = packagePath.replace(`node_modules${path.sep}`, '');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const modulePath = resolvePackagePath(packageName, basePath, consumerPath);
    if (!modulePath) return null; // e.g. it's author and wasn't exported yet, so there's no node_modules of that component
    const packageObject = resolvePackageData(basePath, modulePath);
    if (!packageObject || R.isEmpty(packageObject)) return null;
    const version =
      getValidVersion(packageObject.concreteVersion) || getValidVersion(packageObject.versionUsedByDependent);
    if (!version) return null;
    return componentId.changeVersion(version);
  }

  function getValidVersion(version) {
    if (!version) return null;
    if (!semver.valid(version) && !semver.validRange(version)) return null; // it's probably a relative path to the component
    return version.replace(/[^0-9.]/g, '');
  }

  function getIdFromDependentPackageJson(componentId: BitId): BitId | null | undefined {
    throwForNonLegacy(component.isLegacy, getIdFromDependentPackageJson.name);
    // for author, there is not package.json of a component
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!component.packageJsonFile || !component.packageJsonFile.packageJsonObject.dependencies) {
      return null;
    }
    const dependencyIdAsPackage = componentIdToPackageName({
      ...component,
      id: componentId, // this componentId is actually the dependencyId
      isDependency: true,
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const version = component.packageJsonFile.packageJsonObject.dependencies[dependencyIdAsPackage];
    if (!semver.valid(version) && !semver.validRange(version)) return null; // it's probably a relative path to the component
    const validVersion = version.replace(/[^0-9.]/g, ''); // allow only numbers and dots to get an exact version
    return componentId.changeVersion(validVersion);
  }

  function getIdFromBitMap(componentId: BitId): BitId | null | undefined {
    return consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true });
  }

  function getIdFromComponentConfig(componentId: BitId): BitId | undefined {
    const dependencies = component.overrides.getComponentDependenciesWithVersion();
    if (R.isEmpty(dependencies)) return undefined;
    const dependency = Object.keys(dependencies).find(
      (idStr) =>
        componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!dependency) return undefined;
    return componentId.changeVersion(dependencies[dependency]);
  }
}
