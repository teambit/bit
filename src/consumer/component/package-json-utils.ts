import fs from 'fs-extra';
import R from 'ramda';
import { compact } from 'lodash';

import { BitId, BitIds } from '../../bit-id';
import { COMPONENT_ORIGINS, SUB_DIRECTORIES_GLOB_PATTERN } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { pathRelativeLinux } from '../../utils';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import searchFilesIgnoreExt from '../../utils/fs/search-files-ignore-ext';
import { PathLinux, pathNormalizeToLinux, PathOsBasedAbsolute, PathRelative } from '../../utils/path';
import BitMap from '../bit-map/bit-map';
import ComponentMap from '../bit-map/component-map';
import Component from '../component/consumer-component';
import Consumer from '../consumer';
import PackageJson from './package-json';
import PackageJsonFile from './package-json-file';
import JSONFile from './sources/json-file';

/**
 * Add components as dependencies to root package.json
 */
export async function addComponentsToRoot(consumer: Consumer, components: Component[]): Promise<void> {
  const componentsToAdd = components.reduce((acc, component) => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    if (componentMap.origin !== COMPONENT_ORIGINS.IMPORTED) return acc;
    if (!componentMap.rootDir) {
      throw new ShowDoctorError(`rootDir is missing from an imported component ${component.id.toString()}`);
    }
    const locationAsUnixFormat = convertToValidPathForPackageManager(componentMap.rootDir);
    const packageName = componentIdToPackageName(component);
    acc[packageName] = locationAsUnixFormat;
    return acc;
  }, {});
  if (R.isEmpty(componentsToAdd)) return;
  await _addDependenciesPackagesIntoPackageJson(consumer.getPath(), componentsToAdd);
}

export async function addComponentsWithVersionToRoot(consumer: Consumer, components: Component[]) {
  const componentsToAdd = R.fromPairs(
    components.map((component) => {
      const packageName = componentIdToPackageName(component);
      return [packageName, component.version];
    })
  );
  await _addDependenciesPackagesIntoPackageJson(consumer.getPath(), componentsToAdd);
}

export async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
): Promise<JSONFile[]> {
  const dependenciesIds = BitIds.fromArray(dependencies.map((dependency) => dependency.id));
  const updateComponentPackageJson = async (component: Component): Promise<JSONFile | null | undefined> => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    const componentRootDir = componentMap.rootDir;
    if (!componentRootDir) return null;
    const packageJsonFile = await PackageJsonFile.load(consumer.getPath(), componentRootDir);
    if (!packageJsonFile.fileExist) return null; // if package.json doesn't exist no need to update anything
    const devDeps = getPackages(component.devDependencies.getAllIds(), componentMap);
    const extensionDeps = getPackages(component.extensions.extensionsBitIds, componentMap);
    packageJsonFile.addDependencies(getPackages(component.dependencies.getAllIds(), componentMap));
    packageJsonFile.addDevDependencies({ ...devDeps, ...extensionDeps });
    return packageJsonFile.toVinylFile();
  };
  const packageJsonFiles = await Promise.all(components.map((component) => updateComponentPackageJson(component)));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return packageJsonFiles.filter((file) => file);

  function getPackages(deps: BitIds, componentMap: ComponentMap) {
    return deps.reduce((acc, dependencyId: BitId) => {
      const dependencyIdStr = dependencyId.toStringWithoutVersion();
      if (dependenciesIds.searchWithoutVersion(dependencyId)) {
        const dependencyComponent = dependencies.find((d) => d.id.isEqualWithoutVersion(dependencyId));
        if (!dependencyComponent) {
          throw new Error('getDependenciesAsPackages, dependencyComponent is missing');
        }
        const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependencyComponent.id);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const dependencyPackageValue = getPackageDependencyValue(dependencyIdStr, componentMap, dependencyComponentMap);
        if (dependencyPackageValue) {
          const packageName = componentIdToPackageName({ ...dependencyComponent, id: dependencyId });
          acc[packageName] = dependencyPackageValue;
        }
      }
      return acc;
    }, {});
  }
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
      const packageDependency = getPackageDependency(bitMap, depId, component.id);
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
  const main = pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile));
  packageJson.addOrUpdateProperty('main', main);
  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({
      ...bitDevDependencies,
      ...bitExtensionDependencies,
    });
  };
  packageJson.setPackageManager(packageManager);
  addDependencies(packageJson);
  let distPackageJson;
  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new Error('component.dists.distsRootDir is not defined yet');
    distPackageJson = PackageJsonFile.createFromComponent(distRootDir, component, excludeRegistryPrefix, isIsolated);
    const distMainFile = searchFilesIgnoreExt(component.dists.get(), component.mainFile, 'relative');
    distPackageJson.addOrUpdateProperty('main', component.dists.getMainDistFile() || distMainFile);
    addDependencies(distPackageJson);
  }

  return { packageJson, distPackageJson };
}

export async function updateAttribute(
  consumer: Consumer,
  componentDir: PathRelative,
  attributeName: string,
  attributeValue: string
): Promise<void> {
  const packageJsonFile = await PackageJsonFile.load(consumer.getPath(), componentDir);
  if (!packageJsonFile.fileExist) return; // package.json doesn't exist, that's fine, no need to update anything
  packageJsonFile.addOrUpdateProperty(attributeName, attributeValue);
  await packageJsonFile.write();
}

/**
 * Adds workspace array to package.json - only if user wants to work with yarn workspaces
 */
export async function addWorkspacesToPackageJson(consumer: Consumer, customImportPath: string | null | undefined) {
  if (
    consumer.config._manageWorkspaces &&
    consumer.config.packageManager === 'yarn' &&
    consumer.config._useWorkspaces
  ) {
    const rootDir = consumer.getPath();
    const dependenciesDirectory = consumer.config._dependenciesDirectory;
    const { componentsDefaultDirectory } = consumer.dirStructure;

    await PackageJson.addWorkspacesToPackageJson(
      rootDir,
      componentsDefaultDirectory + SUB_DIRECTORIES_GLOB_PATTERN,
      dependenciesDirectory + SUB_DIRECTORIES_GLOB_PATTERN,
      customImportPath ? consumer.getPathRelativeToConsumer(customImportPath) : customImportPath
    );
  }
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

async function _addDependenciesPackagesIntoPackageJson(dir: PathOsBasedAbsolute, dependencies: Record<string, any>) {
  const packageJsonFile = await PackageJsonFile.load(dir);
  packageJsonFile.addDependencies(dependencies);
  await packageJsonFile.write();
}

export async function removeComponentsFromNodeModules(consumer: Consumer, components: Component[]) {
  logger.debug(`removeComponentsFromNodeModules: ${components.map((c) => c.id.toString()).join(', ')}`);
  const pathsToRemoveWithNulls = components.map((c) => {
    // for legacy, paths without scope name, don't have a symlink in node-modules
    if (consumer.isLegacy) return c.id.scope ? getNodeModulesPathOfComponent(c) : null;
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
  parentComponentMap: ComponentMap,
  dependencyComponentMap?: ComponentMap | null | undefined
): string | null | undefined {
  if (!dependencyComponentMap || dependencyComponentMap.origin === COMPONENT_ORIGINS.NESTED) {
    return dependencyId.version;
  }
  if (dependencyComponentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
    return null;
  }
  const dependencyRootDir = dependencyComponentMap.rootDir;
  if (!dependencyRootDir) {
    throw new Error(`rootDir is missing from an imported component ${dependencyId.toString()}`);
  }
  if (!parentComponentMap.rootDir) throw new Error('rootDir is missing from an imported component');
  const rootDirRelative = pathRelativeLinux(parentComponentMap.rootDir, dependencyRootDir);
  return convertToValidPathForPackageManager(rootDirRelative);
}

function getPackageDependency(bitMap: BitMap, dependencyId: BitId, parentId: BitId): string | null | undefined {
  const parentComponentMap = bitMap.getComponent(parentId);
  const dependencyComponentMap = bitMap.getComponentIfExist(dependencyId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}
