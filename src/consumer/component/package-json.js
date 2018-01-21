/** @flow */

import R from 'ramda';
import format from 'string-format';
import { BitId } from '../../bit-id';
import Component from '../component';
import {
  COMPONENT_ORIGINS,
  CFG_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_SEPARATOR,
  ASTERISK,
  COMPONENTES_DEPENDECIES_REGEX
} from '../../constants';
import BitMap from '../bit-map/bit-map';
import ComponentMap from '../bit-map/component-map';
import { filterAsync, pathNormalizeToLinux, pathRelative } from '../../utils';
import { getSync } from '../../api/consumer/lib/global-config';
import Consumer from '../consumer';

/**
 * Add components as dependencies to root package.json
 */
async function addComponentsToRoot(consumer: Consumer, components: Component[], bitMap: BitMap) {
  const importedComponents = await filterAsync(components, (component: Component) => {
    const componentMap = component.getComponentMap(bitMap);
    return componentMap.origin === COMPONENT_ORIGINS.IMPORTED;
  });
  if (!importedComponents || !importedComponents.length) return;

  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const componentsToAdd = R.fromPairs(
    importedComponents.map((component) => {
      const locationRelativeToConsumer = consumer.getPathRelativeToConsumer(component.writtenPath);
      const locationAsUnixFormat = `./${pathNormalizeToLinux(locationRelativeToConsumer)}`;
      return [component.id.toStringWithoutVersion(), locationAsUnixFormat];
    })
  );
  const registryPrefix = getRegistryPrefix();
  await PackageJson.addComponentsIntoExistingPackageJson(consumer.getPath(), componentsToAdd, registryPrefix);
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
  const rootDirRelative = pathRelative(parentComponentMap.rootDir, dependencyRootDir);
  return rootDirRelative.startsWith('.') ? rootDirRelative : `./${rootDirRelative}`;
}

async function getPackageDependency(consumer: Consumer, dependencyId: BitId, parentId: BitId) {
  const bitMap = await consumer.getBitMap();
  const dependencyComponentMap = bitMap.getComponent(dependencyId);
  const parentComponentMap = bitMap.getComponent(parentId);
  return getPackageDependencyValue(dependencyId, parentComponentMap, dependencyComponentMap);
}

async function changeDependenciesToRelativeSyntax(
  consumer: Consumer,
  components: Component[],
  dependencies: Component[]
) {
  const bitMap = await consumer.getBitMap();
  const dependenciesIds = dependencies.map(dependency => dependency.id.toStringWithoutVersion());
  const driver = await consumer.driver.getDriver(false);
  const PackageJson = driver.PackageJson;
  const updateComponent = async (component) => {
    const componentMap = component.getComponentMap(bitMap);
    let packageJson;
    try {
      packageJson = await PackageJson.load(componentMap.rootDir);
    } catch (e) {
      return Promise.resolve(); // package.json doesn't exist, that's fine, no need to update anything
    }
    const packages = component.dependencies.map((dependency) => {
      const dependencyId = dependency.id.toStringWithoutVersion();
      if (dependenciesIds.includes(dependencyId)) {
        const dependencyComponent = dependencies.find(d => d.id.toStringWithoutVersion() === dependencyId);
        const dependencyComponentMap = dependencyComponent.getComponentMap(bitMap);
        const dependencyLocation = getPackageDependencyValue(dependencyId, componentMap, dependencyComponentMap);
        return [dependencyId, dependencyLocation];
      }
      return [];
    });
    packageJson.setDependencies(packageJson.packageDependencies, R.fromPairs(packages), getRegistryPrefix());
    return packageJson.write({ override: true });
  };
  return Promise.all(components.map(component => updateComponent(component)));
}

function getRegistryPrefix() {
  return getSync(CFG_REGISTRY_DOMAIN_PREFIX) || DEFAULT_REGISTRY_DOMAIN_PREFIX;
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
  const getBitDependencies = async () => {
    if (!writeBitDependencies) return {};
    const dependenciesPackages = component.dependencies.map(async (dep) => {
      const packageDependency = await getPackageDependency(consumer, dep.id, component.id);
      return [dep.id.toStringWithoutVersion(), packageDependency];
    });
    return R.fromPairs(await Promise.all(dependenciesPackages));
  };
  const bitDependencies = await getBitDependencies();
  const registryPrefix = getRegistryPrefix();
  const name = excludeRegistryPrefix
    ? component.id.toStringWithoutVersion().replace(/\//g, '.')
    : `${registryPrefix}/${component.id.toStringWithoutVersion().replace(/\//g, '.')}`;
  const packageJson = new PackageJson(bitDir, {
    name,
    version: component.version,
    homepage: component._getHomepage(),
    main: component.calculateMainDistFile(),
    devDependencies: component.devPackageDependencies,
    peerDependencies: component.peerPackageDependencies,
    componentRootFolder: bitDir,
    license: `SEE LICENSE IN ${!R.isEmpty(component.license) ? 'LICENSE' : 'UNLICENSED'}`
  });
  packageJson.setDependencies(component.packageDependencies, bitDependencies, registryPrefix);

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
      consumer.getPathRelativeToConsumer(customImportPath)
    );
  }
}

async function removeComponentsFromWorkspacesAndDependencies(
  consumer: Consumer,
  rootDir: string,
  bitMap: BitMap,
  componentIds: string[]
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
}

export {
  addComponentsToRoot,
  changeDependenciesToRelativeSyntax,
  write,
  updateAttribute,
  addWorkspacesToPackageJson,
  removeComponentsFromWorkspacesAndDependencies
};
