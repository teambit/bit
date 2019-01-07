/** @flow */
import R from 'ramda';
import fs from 'fs-extra';
import { BitId, BitIds } from '../../bit-id';
import type Component from '../component/consumer-component';
import {
  COMPONENT_ORIGINS,
  CFG_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_REGISTRY_DOMAIN_PREFIX,
  SUB_DIRECTORIES_GLOB_PATTERN,
  NODE_PATH_COMPONENT_SEPARATOR
} from '../../constants';
import ComponentMap from '../bit-map/component-map';
import { pathRelativeLinux } from '../../utils';
import { getSync } from '../../api/consumer/lib/global-config';
import type Consumer from '../consumer';
import type { Dependencies } from './dependencies';
import { pathNormalizeToLinux } from '../../utils/path';
import getNodeModulesPathOfComponent from '../../utils/component-node-modules-path';
import type { PathLinux } from '../../utils/path';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';

export type PackageJsonInstance = {};

/**
 * Add components as dependencies to root package.json
 */
async function addComponentsToRoot(consumer: Consumer, componentsIds: BitId[]) {
  const importedComponents = componentsIds.filter((id) => {
    const componentMap = consumer.bitMap.getComponent(id);
    return componentMap.origin === COMPONENT_ORIGINS.IMPORTED;
  });
  if (!importedComponents || !importedComponents.length) return;

  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const componentsToAdd = R.fromPairs(
    importedComponents.map((componentId) => {
      const componentMap = consumer.bitMap.getComponent(componentId);
      if (!componentMap.rootDir) {
        throw new GeneralError(`rootDir is missing from an imported component ${componentId.toString()}`);
      }
      const locationAsUnixFormat = convertToValidPathForPackageManager(componentMap.rootDir);
      return [componentId.toStringWithoutVersion(), locationAsUnixFormat];
    })
  );
  const registryPrefix = getRegistryPrefix();
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, registryPrefix);
}

/**
 * Add given components with their versions to root package.json
 */
async function addComponentsWithVersionToRoot(consumer: Consumer, componentsIds: BitIds) {
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;

  const componentsToAdd = R.fromPairs(
    componentsIds.map((id) => {
      return [id.toStringWithoutVersion(), id.version];
    })
  );
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, getRegistryPrefix());
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

async function getPackageDependency(consumer: Consumer, dependencyId: BitId, parentId: BitId): Promise<?string> {
  const parentComponentMap = consumer.bitMap.getComponent(parentId);
  const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependencyId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}

async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
) {
  const dependenciesIds = BitIds.fromArray(dependencies.map(dependency => dependency.id));
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const updateComponent = async (component) => {
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
    packageJson.addDependencies(getPackages(component.dependencies), getRegistryPrefix());
    packageJson.addDevDependencies({ ...devDeps, ...compilerDeps, ...testerDeps }, getRegistryPrefix());
    return packageJson.write({ override: true });
  };
  return Promise.all(components.map(component => updateComponent(component)));
}

function getRegistryPrefix(): string {
  return getSync(CFG_REGISTRY_DOMAIN_PREFIX) || DEFAULT_REGISTRY_DOMAIN_PREFIX;
}

function convertIdToNpmName(id: BitId, withVersion = false): string {
  const registryPrefix = getRegistryPrefix();
  const npmName = `${registryPrefix}/${id.toStringWithoutVersion().replace(/\//g, NODE_PATH_COMPONENT_SEPARATOR)}`;
  // $FlowFixMe the id here has a version
  return withVersion ? `${npmName}@${id.version}` : npmName;
}

async function write(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  override?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): Promise<PackageJsonInstance> {
  const packageJson = await preparePackageJsonToWrite(
    consumer,
    component,
    bitDir,
    override,
    writeBitDependencies,
    excludeRegistryPrefix
  );
  await packageJson.write({ override });
  return packageJson;
}

async function preparePackageJsonToWrite(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  override?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): Promise<PackageJsonInstance> {
  logger.debug(`package-json.write. bitDir ${bitDir}. override ${override.toString()}`);
  const PackageJson = consumer.driver.getDriver(false).PackageJson;
  const getBitDependencies = async (dependencies: Dependencies) => {
    if (!writeBitDependencies) return {};
    const dependenciesPackages = dependencies.get().map(async (dep) => {
      const packageDependency = await getPackageDependency(consumer, dep.id, component.id);
      return [dep.id.toStringWithoutVersion(), packageDependency];
    });
    return R.fromPairs(await Promise.all(dependenciesPackages));
  };
  const bitDependencies = await getBitDependencies(component.dependencies);
  const bitDevDependencies = await getBitDependencies(component.devDependencies);
  const bitCompilerDependencies = await getBitDependencies(component.compilerDependencies);
  const bitTesterDependencies = await getBitDependencies(component.testerDependencies);
  const registryPrefix = getRegistryPrefix();
  const name = excludeRegistryPrefix
    ? component.id.toStringWithoutVersion().replace(/\//g, '.')
    : convertIdToNpmName(component.id);
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

  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new GeneralError('component.dists.distsRootDir is not defined yet');
    const distPackageJson = getPackageJsonInstance(distRootDir);
    await distPackageJson.write({ override });
  }

  return packageJson;
}

async function updateAttribute(
  consumer: Consumer,
  componentDir: PathLinux,
  attributeName: string,
  attributeValue: string
): Promise<*> {
  const PackageJson = consumer.driver.getDriver(false).PackageJson;
  try {
    const packageJson = await PackageJson.load(componentDir);
    packageJson[attributeName] = attributeValue;
    return packageJson.write({ override: true });
  } catch (e) {
    // package.json doesn't exist, that's fine, no need to update anything
    return Promise.resolve();
  }
}

/**
 * Adds workspace array to package.json - only if user wants to work with yarn workspaces
 */
async function addWorkspacesToPackageJson(consumer: Consumer, customImportPath: ?string) {
  if (
    consumer.bitJson.manageWorkspaces &&
    consumer.bitJson.packageManager === 'yarn' &&
    consumer.bitJson.useWorkspaces
  ) {
    const rootDir = consumer.getPath();
    const dependenciesDirectory = consumer.bitJson.dependenciesDirectory;
    const { componentsDefaultDirectory } = consumer.dirStructure;
    const driver = await consumer.driver.getDriver(false);
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
  const registryPrefix = getRegistryPrefix();
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
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  if (
    consumer.bitJson.manageWorkspaces &&
    consumer.bitJson.packageManager === 'yarn' &&
    consumer.bitJson.useWorkspaces
  ) {
    const dirsToRemove = componentIds.map(id => consumer.bitMap.getComponent(id, { ignoreVersion: true }).rootDir);
    await PackageJson.removeComponentsFromWorkspaces(rootDir, dirsToRemove);
  }
  await PackageJson.removeComponentsFromDependencies(
    rootDir,
    getRegistryPrefix(),
    componentIds.map(id => id.toStringWithoutVersion())
  );
  await removeComponentsFromNodeModules(consumer, componentIds);
}

async function getPackageJsonObject(consumer: Consumer): Promise<Object> {
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  return PackageJson.getPackageJson(consumer.getPath());
}

async function writePackageJsonFromObject(consumer: Consumer, data: Object) {
  if (!data) return null;
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  return PackageJson.saveRawObject(consumer.getPath(), data);
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
  getPackageJsonObject,
  writePackageJsonFromObject,
  removeComponentsFromWorkspacesAndDependencies
};
