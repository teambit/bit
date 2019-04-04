// @flow
import path from 'path';
import R from 'ramda';
import semver from 'semver';
import ComponentMap from '../../../bit-map/component-map';
import { BitId } from '../../../../bit-id';
import type Component from '../../../component/consumer-component';
import logger from '../../../../logger/logger';
import type Consumer from '../../../../consumer/consumer';
import type { PathLinux } from '../../../../utils/path';
import getNodeModulesPathOfComponent from '../../../../utils/bit/component-node-modules-path';
import Dependencies from '../dependencies';
import { MANUALLY_ADD_DEPENDENCY, MANUALLY_REMOVE_DEPENDENCY } from '../../../../constants';

const isValidVersion = ver => ver !== MANUALLY_ADD_DEPENDENCY && ver !== MANUALLY_REMOVE_DEPENDENCY;

/**
 * The dependency version is determined by the following strategies by this order.
 * 1) if the component bit.json or package.json has "overrides" property, check whether the dependency version is overridden
 * 2) if package.json is different than the model, use package.json. to find the package.json follow this steps:
 * 2 a) search in the component directory for package.json and look for dependencies or devDependencies with the name of the dependency
 * 2 b) if not found there, propagate until you reach the consumer root directory.
 * 2 c) if not found, go directly to the dependency directory and find the version in its package.json
 * 3) if consumer-bit-config overrides this component, find whether it overrides the dependency version and use it.
 * 4) if bitmap has a version, use it.
 * 5) use the model if it has a version.
 * 6) use the package.json regardless the model.
 *
 * cases where dependency version may be different than the model:
 * 1) user added the component to `overrides` of the consumer bit-config. (workspace bit.json or package.json)
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
      const idFromConsumerBitConfig = getIdFromConsumerBitConfig(id);
      const idFromComponentBitConfig = getIdFromComponentBitConfig(id);

      // get from packageJson when it was changed from the model or when there is no model.
      const getFromPackageJsonIfChanged = () => {
        if (!idFromPackageJson) return null;
        if (!idFromModel) return idFromPackageJson;
        if (!idFromPackageJson.isEqual(idFromModel)) return idFromPackageJson;
        return null;
      };
      const getFromConsumerBitConfig = () => idFromConsumerBitConfig || null;
      const getFromComponentBitConfig = () => idFromComponentBitConfig || null;
      const getFromBitMap = () => idFromBitMap || null;
      const getFromModel = () => idFromModel || null;
      const getFromPackageJson = () => idFromPackageJson || null;
      const strategies: Function[] = [
        getFromComponentBitConfig,
        getFromPackageJsonIfChanged,
        getFromConsumerBitConfig,
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
    if (!componentId.scope) return null; // $FlowFixMe component.componentMap is set
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
    if (!semver.valid(version)) return null; // it's probably a relative path to the component
    const validVersion = version.replace(/[^0-9.]/g, ''); // allow only numbers and dots to get an exact version
    return componentId.changeVersion(validVersion);
  }

  function getIdFromBitMap(componentId: BitId): ?BitId {
    // $FlowFixMe component.componentMap is set
    const componentMap: ComponentMap = component.componentMap;
    if (componentMap.dependencies && !R.isEmpty(componentMap.dependencies)) {
      const dependencyId = componentMap.dependencies.find(
        dependency => BitId.getStringWithoutVersion(dependency) === componentId.toStringWithoutVersion()
      );
      if (dependencyId) {
        const version = BitId.getVersionOnlyFromString(dependencyId);
        return componentId.changeVersion(version);
      }
    }
    return consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true });
  }

  function getIdFromConsumerBitConfig(componentId: BitId): ?BitId {
    const allDependenciesOverrides = component.overrides.getAllDependenciesOverridesFromConsumer();
    const dependencies = R.filter(isValidVersion, allDependenciesOverrides);
    if (R.isEmpty(dependencies)) return null;
    const dependency = Object.keys(dependencies).find(
      idStr => componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!dependency) return null;
    return componentId.changeVersion(dependencies[dependency]);
  }

  function getIdFromComponentBitConfig(componentId: BitId): ?BitId {
    const allDependenciesOverrides = component.overrides.getAllDependenciesOverrides();
    const dependencies = R.filter(isValidVersion, allDependenciesOverrides);
    if (R.isEmpty(dependencies)) return null;
    const dependency = Object.keys(dependencies).find(
      idStr => componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!dependency) return null;
    return componentId.changeVersion(dependencies[dependency]);
  }
}
