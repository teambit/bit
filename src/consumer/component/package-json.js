/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs-extra';
import format from 'string-format';
import { BitId } from '../../bit-id';
import Component from '../component';
import {
  COMPONENT_ORIGINS,
  CFG_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_SEPARATOR,
  ASTERISK,
  COMPONENTES_DEPENDECIES_REGEX,
  NODE_PATH_SEPARATOR
} from '../../constants';
import ComponentMap from '../bit-map/component-map';
import { pathRelativeLinux } from '../../utils';
import { getSync } from '../../api/consumer/lib/global-config';
import Consumer from '../consumer';
import { Dependencies } from './dependencies';
import { pathNormalizeToLinux } from '../../utils/path';
import logger from '../../logger/logger';

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
      const locationAsUnixFormat = `./${componentMap.rootDir}`;
      return [componentId.toStringWithoutVersion(), locationAsUnixFormat];
    })
  );
  const registryPrefix = getRegistryPrefix();
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, registryPrefix);
}

/**
 * Add given components with their versions to root package.json
 */
async function addComponentsWithVersionToRoot(consumer: Consumer, componentsIds: BitId[]) {
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;

  const componentsToAdd = R.fromPairs(
    componentsIds.map((id) => {
      return [id.toStringWithoutVersion(), id.version];
    })
  );
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, getRegistryPrefix());
}

/**
 * Only imported components should be saved with relative path in package.json
 * If a component is nested or imported as a package dependency, it should be saved with the version
 */
function getPackageDependencyValue(
  dependencyId: BitId,
  parentComponentMap: ComponentMap,
  dependencyComponentMap?: ComponentMap
) {
  if (!dependencyComponentMap || dependencyComponentMap.origin === COMPONENT_ORIGINS.NESTED) {
    return dependencyId.version;
  }
  const dependencyRootDir = dependencyComponentMap.rootDir;
  const rootDirRelative = pathRelativeLinux(parentComponentMap.rootDir, dependencyRootDir);
  return rootDirRelative.startsWith('.') ? rootDirRelative : `./${rootDirRelative}`;
}

async function getPackageDependency(consumer: Consumer, dependencyId: BitId, parentId: BitId) {
  const dependencyComponentMap = consumer.bitMap.getComponent(dependencyId);
  const parentComponentMap = consumer.bitMap.getComponent(parentId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}

async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
) {
  const dependenciesIds = dependencies.map(dependency => dependency.id.toStringWithoutVersion());
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const updateComponent = async (component) => {
    const componentMap = component.getComponentMap(consumer.bitMap);
    let packageJson;
    try {
      packageJson = await PackageJson.load(componentMap.rootDir);
    } catch (e) {
      return Promise.resolve(); // package.json doesn't exist, that's fine, no need to update anything
    }
    const getPackages = (dev: boolean = false) => {
      const deps = dev ? component.devDependencies.get() : component.dependencies.get();
      const packages = deps.map((dependency) => {
        const dependencyId = dependency.id.toStringWithoutVersion();
        if (dependenciesIds.includes(dependencyId)) {
          const dependencyComponent = dependencies.find(d => d.id.toStringWithoutVersion() === dependencyId);
          const dependencyComponentMap = dependencyComponent.getComponentMap(consumer.bitMap);
          const dependencyLocation = getPackageDependencyValue(dependencyId, componentMap, dependencyComponentMap);
          return [dependencyId, dependencyLocation];
        }
        return [];
      });
      return R.fromPairs(packages);
    };

    packageJson.addDependencies(getPackages(), getRegistryPrefix());
    packageJson.addDevDependencies(getPackages(true), getRegistryPrefix());
    return packageJson.write({ override: true });
  };
  return Promise.all(components.map(component => updateComponent(component)));
}

function getRegistryPrefix(): string {
  return getSync(CFG_REGISTRY_DOMAIN_PREFIX) || DEFAULT_REGISTRY_DOMAIN_PREFIX;
}

function convertIdToNpmName(id: BitId, withVersion = false): string {
  const registryPrefix = getRegistryPrefix();
  const npmName = `${registryPrefix}/${id.toStringWithoutVersion().replace(/\//g, NODE_PATH_SEPARATOR)}`;
  return withVersion ? `${npmName}@${id.version}` : npmName;
}

async function write(
  consumer: Consumer,
  component: Component,
  bitDir: string,
  force?: boolean = true,
  writeBitDependencies?: boolean = false,
  excludeRegistryPrefix?: boolean
): Promise<boolean> {
  const PackageJson = consumer.driver.getDriver(false).PackageJson;
  const getBitDependencies = async (dev: boolean = false) => {
    if (!writeBitDependencies) return {};
    const dependencies: Dependencies = dev ? component.devDependencies : component.dependencies;
    const dependenciesPackages = dependencies.get().map(async (dep) => {
      const packageDependency = await getPackageDependency(consumer, dep.id, component.id);
      return [dep.id.toStringWithoutVersion(), packageDependency];
    });
    return R.fromPairs(await Promise.all(dependenciesPackages));
  };
  const bitDependencies = await getBitDependencies();
  const bitDevDependencies = await getBitDependencies(true);
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
      devDependencies: component.devPackageDependencies,
      peerDependencies: component.peerPackageDependencies,
      componentRootFolder: dir,
      license: `SEE LICENSE IN ${!R.isEmpty(component.license) ? 'LICENSE' : 'UNLICENSED'}`
    });
    packageJson.addDependencies(bitDependencies, registryPrefix);
    packageJson.addDevDependencies(bitDevDependencies, registryPrefix);
    return packageJson;
  };
  const packageJson = getPackageJsonInstance(bitDir);

  if (!component.dists.isEmpty() && !component.dists.areDistsInsideComponentDir) {
    const distRootDir = component.dists.distsRootDir;
    if (!distRootDir) throw new Error('component.dists.distsRootDir is not defined yet');
    const distPackageJson = getPackageJsonInstance(distRootDir);
    await distPackageJson.write({ override: force });
  }

  return packageJson.write({ override: force });
}

async function updateAttribute(consumer: Consumer, componentDir, attributeName, attributeValue): Promise<*> {
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
 *
 * formatedComponentsPath- used to resolve import path dsl. replacing all {}->*
 * for example {components/{namespace} -> components/*
 *
 */
async function addWorkspacesToPackageJson(
  consumer: Consumer,
  rootDir: string,
  componentsDefaultDirectory: string,
  dependenciesDirectory: string,
  customImportPath: ?string
) {
  if (
    consumer.bitJson.manageWorkspaces &&
    consumer.bitJson.packageManager === 'yarn' &&
    consumer.bitJson.useWorkspaces
  ) {
    const formatedComponentsPath = format(componentsDefaultDirectory, {
      name: ASTERISK,
      scope: ASTERISK,
      namespace: ASTERISK
    });
    const formatedRegexPath = formatedComponentsPath
      .split(DEFAULT_SEPARATOR)
      .map(part => (R.contains(ASTERISK, part) ? ASTERISK : part))
      .join(DEFAULT_SEPARATOR);
    const driver = await consumer.driver.getDriver(false);
    const PackageJson = driver.PackageJson;

    await PackageJson.addWorkspacesToPackageJson(
      rootDir,
      formatedRegexPath,
      dependenciesDirectory + COMPONENTES_DEPENDECIES_REGEX,
      customImportPath ? consumer.getPathRelativeToConsumer(customImportPath) : customImportPath
    );
  }
}

async function removeComponentsFromNodeModules(consumer: Consumer, componentIds: BitId[]) {
  logger.debug(`removeComponentsFromNodeModules: ${componentIds.map(c => c.toString()).join(', ')}`);
  const registryPrefix = getRegistryPrefix();
  // paths without scope name, don't have a symlink in node-modules
  const pathsToRemove = componentIds
    .map((id) => {
      return id.scope ? Consumer.getNodeModulesPathOfComponent(registryPrefix, id) : null;
    })
    .filter(a => a); // remove null

  logger.debug(`deleting the following paths: ${pathsToRemove.join('\n')}`);
  return Promise.all(pathsToRemove.map(componentPath => fs.remove(path.join(consumer.getPath(), componentPath))));
}

async function removeComponentsFromWorkspacesAndDependencies(
  consumer: Consumer,
  rootDir: string,
  bitMap: BitMap,
  componentIds: BitId[]
) {
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  if (
    consumer.bitJson.manageWorkspaces &&
    consumer.bitJson.packageManager === 'yarn' &&
    consumer.bitJson.useWorkspaces
  ) {
    const dirsToRemove = componentIds.map(id => bitMap.getComponent(id.toStringWithoutVersion()).rootDir);
    await PackageJson.removeComponentsFromWorkspaces(rootDir, dirsToRemove);
  }
  await PackageJson.removeComponentsFromDependencies(
    rootDir,
    getRegistryPrefix(),
    componentIds.map(id => id.toStringWithoutVersion())
  );
  await removeComponentsFromNodeModules(consumer, componentIds);
}

export {
  addComponentsToRoot,
  removeComponentsFromNodeModules,
  changeDependenciesToRelativeSyntax,
  write,
  addComponentsWithVersionToRoot,
  updateAttribute,
  addWorkspacesToPackageJson,
  removeComponentsFromWorkspacesAndDependencies
};
