// @flow
import path from 'path';
import R from 'ramda';
import semver from 'semver';
import { BitId } from '../../../../bit-id';
import type Component from '../../../component/consumer-component';
import logger from '../../../../logger/logger';
import type Consumer from '../../../../consumer/consumer';
import type { PathLinux } from '../../../../utils/path';
import getNodeModulesPathOfComponent from '../../../../utils/bit/component-node-modules-path';
import Dependencies from '../dependencies';
import componentIdToPackageName from '../../../../utils/bit/component-id-to-package-name';

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
export default function updateDependenciesVersions(consumer: Consumer, component: Component) {
  updateDependencies(component.dependencies);
  updateDependencies(component.devDependencies);
  updateDependencies(component.compilerDependencies);
  updateDependencies(component.testerDependencies);

  function updateDependencies(dependencies: Dependencies) {
    dependencies.get().forEach((dependency) => {
      const id = dependency.id;
      // $FlowFixMe component.componentFromModel is set
      const idFromModel = getIdFromModelDeps(component.componentFromModel, id);
      const idFromPackageJson = getIdFromPackageJson(id);
      const idFromBitMap = getIdFromBitMap(id);
      const idFromComponentConfig = getIdFromComponentConfig(id);
      const idFromDependentPackageJson = getIdFromDependentPackageJson(id);

      // get from packageJson when it was changed from the model or when there is no model.
      const getFromPackageJsonIfChanged = () => {
        if (!idFromPackageJson) return null;
        if (!idFromModel) return idFromPackageJson;
        if (!idFromPackageJson.isEqual(idFromModel)) return idFromPackageJson;
        return null;
      };
      const getFromComponentConfig = () => idFromComponentConfig || null;
      const getFromBitMap = () => idFromBitMap || null;
      const getFromModel = () => idFromModel || null;
      const getFromPackageJson = () => idFromPackageJson || null;
      const getFromDependentPackageJson = () => idFromDependentPackageJson || null;
      const strategies: Function[] = [
        getFromComponentConfig,
        getFromDependentPackageJson,
        getFromPackageJsonIfChanged,
        getFromBitMap,
        getFromModel,
        getFromPackageJson
      ];

      for (const strategy of strategies) {
        const strategyId = strategy();
        if (strategyId) {
          dependency.id = dependency.id.changeVersion(strategyId.version);
          logger.debug(`found dependency version ${dependency.id.toString()} in strategy ${strategy.name}`);
          return;
        }
      }
    });
  }
  function getIdFromModelDeps(componentFromModel?: Component, componentId: BitId): ?BitId {
    if (!componentFromModel) return null;
    const dependency = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
    if (!dependency) return null;
    return dependency;
  }

  /**
   * the logic of finding the dependency version in the package.json is mostly done in the driver
   * resolveNodePackage method.
   * it first searches in the dependent package.json and propagate up to the consumer root, if not
   * found it goes to the dependency package.json.
   */
  function getIdFromPackageJson(componentId: BitId): ?BitId {
    if (!componentId.scope) return null;
    // $FlowFixMe component.componentMap is set
    const rootDir: ?PathLinux = component.componentMap.rootDir;
    const consumerPath = consumer.getPath();
    const basePath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
    const packagePath = getNodeModulesPathOfComponent(component.bindingPrefix, componentId);
    const packageName = packagePath.replace(`node_modules${path.sep}`, '');
    const modulePath = consumer.driver.driver.resolveModulePath(packageName, basePath, consumerPath);
    if (!modulePath) return null; // e.g. it's author and wasn't exported yet, so there's no node_modules of that component
    const packageObject = consumer.driver.driver.resolveNodePackage(basePath, modulePath);
    if (!packageObject || R.isEmpty(packageObject)) return null;
    const packageId = Object.keys(packageObject)[0];
    const version = packageObject[packageId];
    if (!semver.valid(version) && !semver.validRange(version)) return null; // it's probably a relative path to the component
    const validVersion = version.replace(/[^0-9.]/g, ''); // allow only numbers and dots to get an exact version
    return componentId.changeVersion(validVersion);
  }

  function getIdFromDependentPackageJson(componentId: BitId): ?BitId {
    // for author, there is not package.json of a component
    if (!component.packageJsonFile || !component.packageJsonFile.packageJsonObject.dependencies) {
      return null;
    }
    const dependencyIdAsPackage = componentIdToPackageName(componentId, component.bindingPrefix);
    // $FlowFixMe
    const version = component.packageJsonFile.packageJsonObject.dependencies[dependencyIdAsPackage];
    if (!semver.valid(version) && !semver.validRange(version)) return null; // it's probably a relative path to the component
    const validVersion = version.replace(/[^0-9.]/g, ''); // allow only numbers and dots to get an exact version
    return componentId.changeVersion(validVersion);
  }

  function getIdFromBitMap(componentId: BitId): ?BitId {
    return consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true });
  }

  function getIdFromComponentConfig(componentId: BitId): ?BitId {
    const dependencies = component.overrides.getComponentDependenciesWithVersion();
    if (R.isEmpty(dependencies)) return null;
    const dependency = Object.keys(dependencies).find(
      idStr => componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!dependency) return null;
    return componentId.changeVersion(dependencies[dependency]);
  }
}
