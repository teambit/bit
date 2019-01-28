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
import type ComponentBitJson from '../../../bit-json';
import Dependencies from '../dependencies';

function getIdFromModelDeps(componentFromModel?: Component, componentId: BitId): ?BitId {
  if (!componentFromModel) return null;
  const dependency = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
  if (!dependency) return null;
  return dependency;
}

function getIdFromBitJson(bitJson?: ComponentBitJson, componentId: BitId): ?BitId {
  const getVersion = (): ?string => {
    if (!bitJson) return null;
    const idWithoutVersion = componentId.toStringWithoutVersion();
    if (bitJson.dependencies[idWithoutVersion]) {
      return bitJson.dependencies[idWithoutVersion];
    }
    if (bitJson.devDependencies[idWithoutVersion]) {
      return bitJson.devDependencies[idWithoutVersion];
    }
    if (bitJson.compilerDependencies[idWithoutVersion]) {
      return bitJson.compilerDependencies[idWithoutVersion];
    }
    if (bitJson.testerDependencies[idWithoutVersion]) {
      return bitJson.testerDependencies[idWithoutVersion];
    }
    return null;
  };
  const version = getVersion();
  if (!version) return null;
  return componentId.changeVersion(version);
}

/**
 * the logic of finding the dependency version in the package.json is mostly done in the driver
 * resolveNodePackage method.
 * it first searches in the dependent package.json and propagate up to the consumer root, if not
 * found it goes to the dependency package.json.
 */
function getIdFromPackageJson(consumer: Consumer, component: Component, componentId: BitId): ?BitId {
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

function getIdFromBitMap(consumer: Consumer, component: Component, componentId: BitId): ?BitId {
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

/**
 * The dependency version is determined by the following strategies by this order.
 * 1) if bit.json is different than the model, use bit.json
 * 2) if package.json is different than the model, use package.json. to find the package.json follow this steps:
 * 2 a) search in the component directory for package.json and look for dependencies or devDependencies with the name of the dependency
 * 2 b) if not found there, propagate until you reach the consumer root directory.
 * 2 c) if not found, go directly to the dependency directory and find the version in its package.json
 * 3) if bitmap has a version, use it.
 * 4) use the model if it has a version
 * 5) use the version from bit.json (regardless the status of the model)
 * 6) use the version from package.json (regardless the status of the model)
 *
 * cases where dependency version may be different than the model:
 * 1) user changed bit.json
 * 2) user changed package.json, either, manually or by npm-install —save.
 * 3) user updated a dependency with npm without —save.
 * 4) user imported the dependency with different version causing the bitmap to change.
 */
export default (async function updateDependenciesVersions(consumer: Consumer, component: Component) {
  const updateDependencies = async (dependencies: Dependencies) => {
    dependencies.get().forEach((dependency) => {
      const id = dependency.id;
      // $FlowFixMe component.componentFromModel is set
      const idFromModel = getIdFromModelDeps(component.componentFromModel, id);
      // $FlowFixMe component.bitJson is set
      const idFromBitJson = getIdFromBitJson(component.bitJson, id);
      const idFromPackageJson = getIdFromPackageJson(consumer, component, id);
      const idFromBitMap = getIdFromBitMap(consumer, component, id);

      // get from bitJson when it was changed from the model or when there is no model.
      const getFromBitJsonIfChanged = () => {
        if (!idFromBitJson) return null;
        if (!idFromModel) return idFromBitJson;
        if (idFromBitJson !== idFromModel) return idFromBitJson;
        return null;
      };
      // get from packageJson when it was changed from the model or when there is no model.
      const getFromPackageJsonIfChanged = () => {
        if (!idFromPackageJson) return null;
        if (!idFromModel) return idFromPackageJson;
        if (idFromPackageJson !== idFromModel) return idFromPackageJson;
        return null;
      };
      const getFromBitMap = () => {
        if (idFromBitMap) return idFromBitMap;
        return null;
      };
      const getFromModel = () => {
        if (idFromModel) return idFromModel;
        return null;
      };
      const getFromBitJsonOrPackageJson = () => {
        if (idFromBitJson) return idFromBitJson;
        if (idFromPackageJson) return idFromPackageJson;
        return null;
      };
      const strategies: Function[] = [
        getFromBitJsonIfChanged,
        getFromPackageJsonIfChanged,
        getFromBitMap,
        getFromModel,
        getFromBitJsonOrPackageJson
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
  };
  updateDependencies(component.dependencies);
  updateDependencies(component.devDependencies);
  updateDependencies(component.compilerDependencies);
  updateDependencies(component.testerDependencies);
});
