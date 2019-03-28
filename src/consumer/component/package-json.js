/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs-extra';
import { BitId, BitIds } from '../../bit-id';
import type Component from '../component/consumer-component';
import { COMPONENT_ORIGINS, SUB_DIRECTORIES_GLOB_PATTERN, PACKAGE_JSON } from '../../constants';
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
import DataToPersist from './sources/data-to-persist';
import ComponentBitConfig from '../bit-config';

// the instance comes from bit-javascript PackageJson class
export type PackageJsonInstance = { write: Function, bit?: Object, componentRootFolder: string };

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
  const packageJson = (await getPackageJsonObject(dir)) || { dependencies: {} };
  packageJson.dependencies = Object.assign({}, packageJson.dependencies, dependencies);
  return writePackageJsonFromObject(dir, packageJson);
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
  const driver = consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const updateComponentPackageJson = async (component): Promise<?JSONFile> => {
    const componentMap = consumer.bitMap.getComponent(component.id);
    let packageJson;
    try {
      packageJson = await PackageJson.load(componentMap.rootDir);
    } catch (e) {
      return Promise.resolve(); // package.json doesn't exist, that's fine, no need to update anything
    }
    const getPackages = (deps: Dependencies) => {
      const packages = deps.get().map((dependency) => {
        const dependencyId = dependency.id.toStringWithoutVersion();
        if (dependenciesIds.searchWithoutVersion(dependency.id)) {
          const dependencyComponent = dependencies.find(d => d.id.isEqualWithoutVersion(dependency.id));
          // $FlowFixMe dependencyComponent must be found (two line earlier there is a check for that)
          const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependencyComponent.id);
          const dependencyPackageValue = getPackageDependencyValue(dependencyId, componentMap, dependencyComponentMap);
          return dependencyPackageValue ? [dependencyId, dependencyPackageValue] : [];
        }
        return [];
      });
      return R.fromPairs(packages);
    };
    const devDeps = getPackages(component.devDependencies);
    const compilerDeps = getPackages(component.compilerDependencies);
    const testerDeps = getPackages(component.testerDependencies);
    packageJson.addDependencies(getPackages(component.dependencies), npmRegistryName());
    packageJson.addDevDependencies({ ...devDeps, ...compilerDeps, ...testerDeps }, npmRegistryName());
    // return packageJson.write({ override: true });
    return JSONFile.load({
      // $FlowFixMe
      base: componentMap.rootDir, // $FlowFixMe
      path: path.join(componentMap.rootDir, PACKAGE_JSON),
      content: packageJson,
      override: true
    });
  };
  // $FlowFixMe
  const packageJsonFiles = await Promise.all(components.map(component => updateComponentPackageJson(component)));
  return packageJsonFiles.filter(file => file);
}

async function write(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  override?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): Promise<PackageJsonInstance> {
  const { packageJson, distPackageJson } = preparePackageJsonToWrite(
    consumer,
    component,
    bitDir,
    override,
    writeBitDependencies,
    excludeRegistryPrefix
  );
  await packageJson.write({ override });
  if (distPackageJson) await distPackageJson.write({ override });
  return packageJson;
}

function preparePackageJsonToWrite(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  override?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): { packageJson: PackageJsonInstance, distPackageJson: ?PackageJsonInstance } {
  logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}. override ${override.toString()}`);
  const PackageJson = consumer.driver.getDriver(false).PackageJson;
  const getBitDependencies = (dependencies: Dependencies) => {
    if (!writeBitDependencies) return {};
    const dependenciesPackages = dependencies.get().map((dep) => {
      const packageDependency = getPackageDependency(consumer, dep.id, component.id);
      return [dep.id.toStringWithoutVersion(), packageDependency];
    });
    return R.fromPairs(dependenciesPackages);
  };
  const bitDependencies = getBitDependencies(component.dependencies);
  const bitDevDependencies = getBitDependencies(component.devDependencies);
  const bitCompilerDependencies = getBitDependencies(component.compilerDependencies);
  const bitTesterDependencies = getBitDependencies(component.testerDependencies);
  const registryPrefix = component.bindingPrefix || npmRegistryName();
  const name = excludeRegistryPrefix
    ? componentIdToPackageName(component.id, component.bindingPrefix, false)
    : componentIdToPackageName(component.id, component.bindingPrefix);
  const getPackageJsonInstance = (dir) => {
    const packageJson = new PackageJson(dir, {
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
    packageJson.addDependencies(bitDependencies, registryPrefix);
    packageJson.addDevDependencies(
      { ...bitDevDependencies, ...bitCompilerDependencies, ...bitTesterDependencies },
      registryPrefix
    );
    return packageJson;
  };
  const packageJson = getPackageJsonInstance(bitDir);
  const componentBitConfig = ComponentBitConfig.fromComponent(component);
  componentBitConfig.compiler = component.compiler ? component.compiler.name : {};
  componentBitConfig.tester = component.tester ? component.tester.name : {};
  packageJson.bit = componentBitConfig.toPlainObject();
  let distPackageJson;
  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new GeneralError('component.dists.distsRootDir is not defined yet');
    distPackageJson = getPackageJsonInstance(distRootDir);
  }

  return { packageJson, distPackageJson };
}

async function updateAttribute(
  consumer: Consumer,
  componentDir: PathLinux,
  attributeName: string,
  attributeValue: string,
  writeFile: ?boolean = true
): Promise<*> {
  const packageJson = await getPackageJsonObject(componentDir);
  if (!packageJson) return null; // package.json doesn't exist, that's fine, no need to update anything
  packageJson[attributeName] = attributeValue;
  if (writeFile) await writePackageJsonFromObject(componentDir, packageJson);
  return packageJson;
}

/**
 * Adds workspace array to package.json - only if user wants to work with yarn workspaces
 */
async function addWorkspacesToPackageJson(consumer: Consumer, customImportPath: ?string) {
  if (
    consumer.bitConfig.manageWorkspaces &&
    consumer.bitConfig.packageManager === 'yarn' &&
    consumer.bitConfig.useWorkspaces
  ) {
    const rootDir = consumer.getPath();
    const dependenciesDirectory = consumer.bitConfig.dependenciesDirectory;
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
  if (
    consumer.bitConfig.manageWorkspaces &&
    consumer.bitConfig.packageManager === 'yarn' &&
    consumer.bitConfig.useWorkspaces
  ) {
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

/**
 * get the package.json object of the given dir, if not found, return null
 */
async function getPackageJsonObject(dir: string): Promise<?Object> {
  try {
    const packageJsonObject = await fs.readJson(composePath(dir));
    return packageJsonObject;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // file not found
      return null;
    }
    throw err;
  }
}

function addPackageJsonDataToPersist(packageJson: PackageJsonInstance, dataToPersist: DataToPersist) {
  const packageJsonPath = composePath(packageJson.componentRootFolder);
  const jsonFile = JSONFile.load({
    base: packageJson.componentRootFolder,
    path: packageJsonPath,
    content: packageJson
  });
  dataToPersist.addFile(jsonFile);
}

async function writePackageJsonFromObject(dir: string, data: Object) {
  return fs.outputJSON(composePath(dir), data, { spaces: 2 });
}

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}

export {
  addComponentsToRoot,
  removeComponentsFromNodeModules,
  changeDependenciesToRelativeSyntax,
  write,
  preparePackageJsonToWrite,
  addPackageJsonDataToPersist,
  addComponentsWithVersionToRoot,
  updateAttribute,
  addWorkspacesToPackageJson,
  getPackageJsonObject,
  writePackageJsonFromObject,
  removeComponentsFromWorkspacesAndDependencies
};
