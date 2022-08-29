import fs from 'fs-extra';
import R from 'ramda';
import { compact } from 'lodash';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import { PathLinux, pathNormalizeToLinux, PathOsBasedAbsolute } from '../../utils/path';
import Component from '../component/consumer-component';
import Consumer from '../consumer';
import PackageJson from './package-json';
import PackageJsonFile from './package-json-file';
import BitMap from '../bit-map';
import ComponentMap from '../bit-map/component-map';

export async function addComponentsWithVersionToRoot(consumer: Consumer, components: Component[]) {
  const componentsToAdd = R.fromPairs(
    components.map((component) => {
      const packageName = componentIdToPackageName(component);
      return [packageName, component.version];
    })
  );
  await _addDependenciesPackagesIntoPackageJson(consumer.getPath(), componentsToAdd);
}

export async function removeComponentsFromWorkspacesAndDependencies(
  consumer: Consumer,
  components: Component[],
  invalidComponents: BitId[] = []
) {
  const bitIds = [...components.map((c) => c.id), ...invalidComponents];
  const rootDir = consumer.getPath();
  if (
    consumer.config._manageWorkspaces &&
    consumer.config.packageManager === 'yarn' &&
    consumer.config._useWorkspaces
  ) {
    const dirsToRemove = bitIds.map((id) => consumer.bitMap.getComponent(id, { ignoreVersion: true }).rootDir);
    if (dirsToRemove && dirsToRemove.length) {
      const dirsToRemoveWithoutEmpty = compact(dirsToRemove);
      await PackageJson.removeComponentsFromWorkspaces(rootDir, dirsToRemoveWithoutEmpty);
    }
  }
  await PackageJson.removeComponentsFromDependencies(rootDir, components);
  await removeComponentsFromNodeModules(consumer, components);
}

export function preparePackageJsonToWrite(
  bitMap: BitMap,
  component: Component,
  bitDir: string,
  override = true,
  ignoreBitDependencies: BitIds | boolean = true,
  excludeRegistryPrefix?: boolean,
  packageManager?: string,
  isIsolated?: boolean
): { packageJson: PackageJsonFile; distPackageJson: PackageJsonFile | null | undefined } {
  logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}. override ${override.toString()}`);
  const getBitDependencies = (dependencies: BitIds) => {
    if (ignoreBitDependencies === true) return {};
    return dependencies.reduce((acc, depId: BitId) => {
      if (Array.isArray(ignoreBitDependencies) && ignoreBitDependencies.searchWithoutVersion(depId)) return acc;
      const packageDependency = getPackageDependency(bitMap, depId);
      const packageName = componentIdToPackageName({
        ...component,
        id: depId,
        isDependency: true,
      });
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const bitDependencies = getBitDependencies(component.dependencies.getAllIds());
  const bitDevDependencies = getBitDependencies(component.devDependencies.getAllIds());
  const bitExtensionDependencies = getBitDependencies(component.extensions.extensionsBitIds);
  const packageJson = PackageJsonFile.createFromComponent(bitDir, component, excludeRegistryPrefix, isIsolated);
  const main = pathNormalizeToLinux(component.mainFile);
  packageJson.addOrUpdateProperty('main', main);
  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({
      ...bitDevDependencies,
      ...bitExtensionDependencies,
    });
  };
  addDependencies(packageJson);
  let distPackageJson;

  return { packageJson, distPackageJson };
}

async function _addDependenciesPackagesIntoPackageJson(dir: PathOsBasedAbsolute, dependencies: Record<string, any>) {
  const packageJsonFile = await PackageJsonFile.load(dir);
  packageJsonFile.addDependencies(dependencies);
  await packageJsonFile.write();
}

export async function removeComponentsFromNodeModules(consumer: Consumer, components: Component[]) {
  logger.debug(`removeComponentsFromNodeModules: ${components.map((c) => c.id.toString()).join(', ')}`);
  const pathsToRemoveWithNulls = components.map((c) => {
    return getNodeModulesPathOfComponent({ ...c, id: c.id, allowNonScope: true });
  });
  const pathsToRemove = compact(pathsToRemoveWithNulls);
  logger.debug(`deleting the following paths: ${pathsToRemove.join('\n')}`);
  return Promise.all(pathsToRemove.map((componentPath) => fs.remove(consumer.toAbsolutePath(componentPath))));
}

export function convertToValidPathForPackageManager(pathStr: PathLinux): string {
  const prefix = 'file:'; // it works for both, Yarn and NPM
  return prefix + (pathStr.startsWith('.') ? pathStr : `./${pathStr}`);
}

/**
 * Only imported components should be saved with relative path in package.json
 * If a component is nested or imported as a package dependency, it should be saved with the version
 * If a component is authored, no need to save it as a dependency of the imported component because
 * the root package.json takes care of it already.
 */
function getPackageDependencyValue(
  dependencyId: BitId,
  dependencyComponentMap?: ComponentMap | null | undefined
): string | null | undefined {
  if (!dependencyComponentMap) {
    return dependencyId.version;
  }
  return null;
}

function getPackageDependency(bitMap: BitMap, dependencyId: BitId): string | null | undefined {
  const dependencyComponentMap = bitMap.getComponentIfExist(dependencyId);
  return getPackageDependencyValue(dependencyId, dependencyComponentMap);
}
