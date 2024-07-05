import fs from 'fs-extra';
import R from 'ramda';
import { compact } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import logger from '../../logger/logger';
import { PathOsBasedAbsolute, getNodeModulesPathOfComponent } from '@teambit/legacy.utils';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-id-to-package-name';
import Component from '../component/consumer-component';
import Consumer from '../consumer';
import PackageJson from './package-json';
import PackageJsonFile from './package-json-file';

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
  invalidComponents: ComponentID[] = []
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
    return getNodeModulesPathOfComponent({ ...c, id: c.id });
  });
  const pathsToRemove = compact(pathsToRemoveWithNulls);
  logger.debug(`deleting the following paths: ${pathsToRemove.join('\n')}`);
  return Promise.all(pathsToRemove.map((componentPath) => fs.remove(consumer.toAbsolutePath(componentPath))));
}
