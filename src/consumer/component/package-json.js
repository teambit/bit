/** @flow */
import R from 'ramda';
import path from 'path';
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
import type { PathLinux } from '../../utils/path';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import JSONFile from './sources/json-file';
import npmRegistryName from '../../utils/bit/npm-registry-name';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import PackageJsonFile from './package-json-file';

/**
 * Add components as dependencies to root package.json
 */
async function addComponentsToRoot(consumer: Consumer, components: Component[]): Promise<void> {
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

async function _addDependenciesPackagesIntoPackageJson(dir: string, dependencies: Object) {
  const packageJsonFile = await PackageJsonFile.load(dir);
  packageJsonFile.addDependencies(dependencies);
  await packageJsonFile.write();
}

/**
 * Add given components with their versions to root package.json
 */
async function addComponentsWithVersionToRoot(consumer: Consumer, componentsIds: BitIds) {
  const driver = consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;

  const componentsToAdd = R.fromPairs(
    componentsIds.map((id) => {
      return [id.toStringWithoutVersion(), id.version];
    })
  );
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, npmRegistryName());
}

function convertToValidPathForPackageManager(pathStr: PathLinux): string {
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

function getPackageDependency(consumer: Consumer, dependencyId: BitId, parentId: BitId): ?string {
  const parentComponentMap = consumer.bitMap.getComponent(parentId);
  const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependencyId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}

async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
): Promise<JSONFile[]> {
  const dependenciesIds = BitIds.fromArray(dependencies.map(dependency => dependency.id));
  const updateComponentPackageJson = async (component): Promise<?JSONFile> => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    const componentRootDir = componentMap.rootDir;
    if (!componentRootDir) return null;
    const packageJsonFile = await PackageJsonFile.load(componentRootDir);
    if (!packageJsonFile.fileExist) return null; // if package.json doesn't exist no need to update anything
    const getPackages = (deps: Dependencies) => {
      return deps.get().reduce((acc, dependency) => {
        const dependencyId = dependency.id.toStringWithoutVersion();
        if (dependenciesIds.searchWithoutVersion(dependency.id)) {
          const dependencyComponent = dependencies.find(d => d.id.isEqualWithoutVersion(dependency.id));
          if (!dependencyComponent) { throw new Error('changeDependenciesToRelativeSyntax, dependencyComponent is missing'); }
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
    };
    const devDeps = getPackages(component.devDependencies);
    const compilerDeps = getPackages(component.compilerDependencies);
    const testerDeps = getPackages(component.testerDependencies);
    packageJsonFile.addDependencies(getPackages(component.dependencies));
    packageJsonFile.addDevDependencies({ ...devDeps, ...compilerDeps, ...testerDeps });
    return packageJsonFile.toJSONFile();
  };
  const packageJsonFiles = await Promise.all(components.map(component => updateComponentPackageJson(component)));
  return packageJsonFiles.filter(file => file);
}

async function write(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): Promise<PackageJsonFile> {
  const { packageJson, distPackageJson } = preparePackageJsonToWrite(
    consumer,
    component,
    bitDir,
    writeBitDependencies,
    excludeRegistryPrefix
  );
  await packageJson.write();
  if (distPackageJson) await distPackageJson.write();
  return packageJson;
}

function preparePackageJsonToWrite(
  consumer: Consumer,
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
      const packageDependency = getPackageDependency(consumer, dep.id, component.id);
      const packageName = componentIdToPackageName(dep.id, component.bindingPrefix || npmRegistryName());
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const bitDependencies = getBitDependencies(component.dependencies);
  const bitDevDependencies = getBitDependencies(component.devDependencies);
  const bitCompilerDependencies = getBitDependencies(component.compilerDependencies);
  const bitTesterDependencies = getBitDependencies(component.testerDependencies);
  const name = excludeRegistryPrefix
    ? componentIdToPackageName(component.id, component.bindingPrefix, false)
    : componentIdToPackageName(component.id, component.bindingPrefix);
  const createPackageJsonFile = (dir): PackageJsonFile => {
    const packageJsonFile = PackageJsonFile.create(dir, {
      name,
      version: component.version,
      homepage: component._getHomepage(),
      main: pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile)),
      dependencies: component.packageDependencies,
      // Add environments PackageDependencies to the devDependencies in the package.json
      devDependencies: {
        ...component.devPackageDependencies,
        ...component.compilerPackageDependencies,
        ...component.testerPackageDependencies
      },
      peerDependencies: component.peerPackageDependencies,
      componentRootFolder: dir,
      license: `SEE LICENSE IN ${!R.isEmpty(component.license) ? 'LICENSE' : 'UNLICENSED'}`
    });
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({ ...bitDevDependencies, ...bitCompilerDependencies, ...bitTesterDependencies });
    return packageJsonFile;
  };
  const packageJson = createPackageJsonFile(bitDir);
  let distPackageJson;
  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new GeneralError('component.dists.distsRootDir is not defined yet');
    distPackageJson = createPackageJsonFile(distRootDir);
  }

  return { packageJson, distPackageJson };
}

async function updateAttribute(
  consumer: Consumer,
  componentDir: PathLinux,
  attributeName: string,
  attributeValue: string
): Promise<void> {
  const packageJsonFile = await PackageJsonFile.load(componentDir);
  if (!packageJsonFile.fileExist) return; // package.json doesn't exist, that's fine, no need to update anything
  packageJsonFile.addOrUpdateProperty(attributeName, attributeValue);
  await packageJsonFile.write();
}

/**
 * Adds workspace array to package.json - only if user wants to work with yarn workspaces
 */
async function addWorkspacesToPackageJson(consumer: Consumer, customImportPath: ?string) {
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

async function removeComponentsFromWorkspacesAndDependencies(consumer: Consumer, componentIds: BitIds) {
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

export {
  addComponentsToRoot,
  removeComponentsFromNodeModules,
  changeDependenciesToRelativeSyntax,
  write,
  preparePackageJsonToWrite,
  addComponentsWithVersionToRoot,
  updateAttribute,
  addWorkspacesToPackageJson,
  removeComponentsFromWorkspacesAndDependencies
};
