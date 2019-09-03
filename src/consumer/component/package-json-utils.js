/** @flow */
import R from 'ramda';
import fs from 'fs-extra';
import { BitId, BitIds } from '../../bit-id';
import type Component from '../component/consumer-component';
import { COMPONENT_ORIGINS, SUB_DIRECTORIES_GLOB_PATTERN } from '../../constants';
import ComponentMap from '../bit-map/component-map';
import { pathRelativeLinux } from '../../utils';
import type Consumer from '../consumer';
import type { Dependencies } from './dependencies';
import { pathNormalizeToLinux } from '../../utils/path';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import type { PathLinux, PathOsBasedAbsolute, PathRelative } from '../../utils/path';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import JSONFile from './sources/json-file';
import npmRegistryName from '../../utils/bit/npm-registry-name';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import PackageJsonFile from './package-json-file';
import searchFilesIgnoreExt from '../../utils/fs/search-files-ignore-ext';
import ComponentVersion from '../../scope/component-version';
import BitMap from '../bit-map/bit-map';

/**
 * Add components as dependencies to root package.json
 */
export async function addComponentsToRoot(consumer: Consumer, components: Component[]): Promise<void> {
  const componentsToAdd = components.reduce((acc, component) => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    if (componentMap.origin !== COMPONENT_ORIGINS.IMPORTED) return acc;
    if (!componentMap.rootDir) {
      throw new GeneralError(`rootDir is missing from an imported component ${component.id.toString()}`);
    }
    const locationAsUnixFormat = convertToValidPathForPackageManager(componentMap.rootDir);
    const packageName = componentIdToPackageName(component.id, component.bindingPrefix);
    acc[packageName] = locationAsUnixFormat;
    return acc;
  }, {});
  if (R.isEmpty(componentsToAdd)) return;
  await _addDependenciesPackagesIntoPackageJson(consumer.getPath(), componentsToAdd);
}

/**
 * Add given components with their versions to root package.json
 */
export async function addComponentsWithVersionToRoot(consumer: Consumer, componentsVersions: ComponentVersion[]) {
  const componentsToAdd = R.fromPairs(
    componentsVersions.map(({ component, version }) => {
      const packageName = componentIdToPackageName(component.toBitId(), component.bindingPrefix);
      return [packageName, version];
    })
  );
  await _addDependenciesPackagesIntoPackageJson(consumer.getPath(), componentsToAdd);
}

export async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
): Promise<JSONFile[]> {
  const dependenciesIds = BitIds.fromArray(dependencies.map(dependency => dependency.id));
  const updateComponentPackageJson = async (component): Promise<?JSONFile> => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    const componentRootDir = componentMap.rootDir;
    if (!componentRootDir) return null;
    const packageJsonFile = await PackageJsonFile.load(consumer.getPath(), componentRootDir);
    if (!packageJsonFile.fileExist) return null; // if package.json doesn't exist no need to update anything
    const devDeps = getPackages(component.devDependencies, componentMap);
    const compilerDeps = getPackages(component.compilerDependencies, componentMap);
    const testerDeps = getPackages(component.testerDependencies, componentMap);
    packageJsonFile.addDependencies(getPackages(component.dependencies, componentMap));
    packageJsonFile.addDevDependencies({ ...devDeps, ...compilerDeps, ...testerDeps });
    return packageJsonFile.toVinylFile();
  };
  const packageJsonFiles = await Promise.all(components.map(component => updateComponentPackageJson(component)));
  // $FlowFixMe
  return packageJsonFiles.filter(file => file);

  function getPackages(deps: Dependencies, componentMap: ComponentMap) {
    return deps.get().reduce((acc, dependency) => {
      const dependencyId = dependency.id.toStringWithoutVersion();
      if (dependenciesIds.searchWithoutVersion(dependency.id)) {
        const dependencyComponent = dependencies.find(d => d.id.isEqualWithoutVersion(dependency.id));
        if (!dependencyComponent) {
          throw new Error('getDependenciesAsPackages, dependencyComponent is missing');
        }
        const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependencyComponent.id);
        const dependencyPackageValue = getPackageDependencyValue(dependencyId, componentMap, dependencyComponentMap);
        if (dependencyPackageValue) {
          const packageName = componentIdToPackageName(
            dependency.id,
            dependencyComponent.bindingPrefix || npmRegistryName()
          );
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
  override?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): { packageJson: PackageJsonFile, distPackageJson: ?PackageJsonFile } {
  logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}. override ${override.toString()}`);
  const getBitDependencies = (dependencies: Dependencies) => {
    if (!writeBitDependencies) return {};
    return dependencies.get().reduce((acc, dep) => {
      const packageDependency = getPackageDependency(bitMap, dep.id, component.id);
      const packageName = componentIdToPackageName(dep.id, component.bindingPrefix || npmRegistryName());
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({ ...bitDevDependencies, ...bitCompilerDependencies, ...bitTesterDependencies });
  };
  const bitDependencies = getBitDependencies(component.dependencies);
  const bitDevDependencies = getBitDependencies(component.devDependencies);
  const bitCompilerDependencies = getBitDependencies(component.compilerDependencies);
  const bitTesterDependencies = getBitDependencies(component.testerDependencies);
  const packageJson = PackageJsonFile.createFromComponent(bitDir, component, excludeRegistryPrefix);
  const main = pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile));
  packageJson.addOrUpdateProperty('main', main);
  addDependencies(packageJson);
  let distPackageJson;
  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new GeneralError('component.dists.distsRootDir is not defined yet');
    distPackageJson = PackageJsonFile.createFromComponent(distRootDir, component, excludeRegistryPrefix);
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
export async function addWorkspacesToPackageJson(consumer: Consumer, customImportPath: ?string) {
  if (consumer.config.manageWorkspaces && consumer.config.packageManager === 'yarn' && consumer.config.useWorkspaces) {
    const rootDir = consumer.getPath();
    const dependenciesDirectory = consumer.config.dependenciesDirectory;
    const { componentsDefaultDirectory } = consumer.dirStructure;
    const driver = consumer.driver.getDriver(false);
    const PackageJson = driver.PackageJson;

    await PackageJson.addWorkspacesToPackageJson(
      rootDir,
      componentsDefaultDirectory + SUB_DIRECTORIES_GLOB_PATTERN,
      dependenciesDirectory + SUB_DIRECTORIES_GLOB_PATTERN,
      customImportPath ? consumer.getPathRelativeToConsumer(customImportPath) : customImportPath
    );
  }
}

export async function removeComponentsFromWorkspacesAndDependencies(consumer: Consumer, componentIds: BitIds) {
  const rootDir = consumer.getPath();
  const driver = consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  if (consumer.config.manageWorkspaces && consumer.config.packageManager === 'yarn' && consumer.config.useWorkspaces) {
    const dirsToRemove = componentIds.map(id => consumer.bitMap.getComponent(id, { ignoreVersion: true }).rootDir);
    await PackageJson.removeComponentsFromWorkspaces(rootDir, dirsToRemove);
  }
  await PackageJson.removeComponentsFromDependencies(
    rootDir,
    npmRegistryName(),
    componentIds.map(id => id.toStringWithoutVersion())
  );
  await removeComponentsFromNodeModules(consumer, componentIds);
}

async function _addDependenciesPackagesIntoPackageJson(dir: PathOsBasedAbsolute, dependencies: Object) {
  const packageJsonFile = await PackageJsonFile.load(dir);
  packageJsonFile.addDependencies(dependencies);
  await packageJsonFile.write();
}

async function removeComponentsFromNodeModules(consumer: Consumer, componentIds: BitIds) {
  logger.debug(`removeComponentsFromNodeModules: ${componentIds.map(c => c.toString()).join(', ')}`);
  const registryPrefix = npmRegistryName();
  // paths without scope name, don't have a symlink in node-modules
  const pathsToRemove = componentIds
    .map((id) => {
      return id.scope ? getNodeModulesPathOfComponent(registryPrefix, id) : null;
    })
    .filter(a => a); // remove null

  logger.debug(`deleting the following paths: ${pathsToRemove.join('\n')}`);
  // $FlowFixMe nulls were removed in the previous filter function
  return Promise.all(pathsToRemove.map(componentPath => fs.remove(consumer.toAbsolutePath(componentPath))));
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
  dependencyComponentMap?: ?ComponentMap
): ?string {
  if (!dependencyComponentMap || dependencyComponentMap.origin === COMPONENT_ORIGINS.NESTED) {
    return dependencyId.version;
  }
  if (dependencyComponentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
    return null;
  }
  const dependencyRootDir = dependencyComponentMap.rootDir;
  if (!dependencyRootDir) {
    throw new GeneralError(`rootDir is missing from an imported component ${dependencyId.toString()}`);
  }
  if (!parentComponentMap.rootDir) throw new GeneralError('rootDir is missing from an imported component');
  const rootDirRelative = pathRelativeLinux(parentComponentMap.rootDir, dependencyRootDir);
  return convertToValidPathForPackageManager(rootDirRelative);
}

function getPackageDependency(bitMap: BitMap, dependencyId: BitId, parentId: BitId): ?string {
  const parentComponentMap = bitMap.getComponent(parentId);
  const dependencyComponentMap = bitMap.getComponentIfExist(dependencyId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}
