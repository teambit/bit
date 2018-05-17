// @flow
import path from 'path';
import fs from 'fs-extra';
import { moveExistingComponent } from './move-components';
import { linkComponents } from '../../links';
import { installNpmPackagesForComponents } from '../../npm-client/install-packages';
import * as packageJson from '../component/package-json';
import { ComponentWithDependencies } from '../../scope';
import Component from '../component/consumer-component';
import { Remotes } from '../../remotes';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import { Consumer } from '..';

/**
 * write the components into '/components' dir (or according to the bit.map) and its dependencies in the
 * '/components/.dependencies' dir. Both directories are configurable in bit.json
 * For example: global/a has a dependency my-scope/global/b@1. The directories will be:
 * project/root/components/global/a/impl.js
 * project/root/components/.dependencies/global/b/my-scope/1/impl.js
 *
 * In case there are some same dependencies shared between the components, it makes sure to
 * write them only once.
 */
export default (async function writeToComponentsDir({
  consumer,
  silentPackageManagerResult,
  componentsWithDependencies,
  writeToPath,
  override = true, // override files
  writePackageJson = true,
  writeBitJson = true,
  writeBitDependencies = false,
  createNpmLinkFiles = false,
  writeDists = true,
  saveDependenciesAsComponents = false,
  installNpmPackages = true,
  installPeerDependencies = false,
  addToRootPackageJson = true,
  verbose = false, // display the npm output
  excludeRegistryPrefix = false
}: {
  consumer: Consumer,
  silentPackageManagerResult: boolean,
  componentsWithDependencies: ComponentWithDependencies[],
  writeToPath?: string,
  override?: boolean,
  writePackageJson?: boolean,
  writeBitJson?: boolean,
  writeBitDependencies?: boolean,
  createNpmLinkFiles?: boolean,
  writeDists?: boolean,
  saveDependenciesAsComponents?: boolean, // as opposed to npm packages
  installNpmPackages?: boolean,
  installPeerDependencies?: boolean,
  addToRootPackageJson?: boolean,
  verbose?: boolean,
  excludeRegistryPrefix?: boolean
}): Promise<Component[]> {
  const dependenciesIdsCache = {};
  const remotes: Remotes = await consumer.scope.remotes();
  const writeComponentsP = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
    const bitDir = writeToPath
      ? path.resolve(writeToPath)
      : consumer.composeComponentPath(componentWithDeps.component.id);
    // if it doesn't go to the hub, it can't import dependencies as packages
    componentWithDeps.component.dependenciesSavedAsComponents =
      saveDependenciesAsComponents || !remotes.isHub(componentWithDeps.component.scope);
    // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
    // find the component in bit.map
    const componentMap = consumer.bitMap.getComponent(componentWithDeps.component.id.toStringWithoutVersion(), false);
    const origin =
      componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED
        ? COMPONENT_ORIGINS.AUTHORED
        : COMPONENT_ORIGINS.IMPORTED;
    if (origin === COMPONENT_ORIGINS.IMPORTED) {
      componentWithDeps.component.stripOriginallySharedDir(consumer.bitMap);
    }
    // don't write dists files for authored components as the author has its own mechanism to generate them
    // also, don't write dists file for imported component, unless the user used '--dist' flag
    componentWithDeps.component.dists.writeDistsFiles = writeDists && origin === COMPONENT_ORIGINS.IMPORTED;
    return componentWithDeps.component.write({
      bitDir,
      override,
      writeBitJson,
      writePackageJson,
      origin,
      consumer: this,
      writeBitDependencies: writeBitDependencies || !componentWithDeps.component.dependenciesSavedAsComponents, // when dependencies are written as npm packages, they must be written in package.json
      componentMap,
      excludeRegistryPrefix
    });
  });
  const writtenComponents = await Promise.all(writeComponentsP);

  const allDependenciesP = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
    const writeDependenciesP = componentWithDeps.allDependencies.map((dep: Component) => {
      const dependencyId = dep.id.toString();
      const depFromBitMap = consumer.bitMap.getComponent(dependencyId, false);
      if (!componentWithDeps.component.dependenciesSavedAsComponents && !depFromBitMap) {
        // when depFromBitMap is true, it means that this component was imported as a component already before
        // don't change it now from a component to a package. (a user can do it at any time by using export --eject).
        logger.debug(
          `writeToComponentsDir, ignore dependency ${dependencyId}. It'll be installed later using npm-client`
        );
        Analytics.addBreadCrumb(
          'writeToComponentsDir',
          `writeToComponentsDir, ignore dependency ${Analytics.hashData(
            dependencyId
          )}. It'll be installed later using npm-client`
        );
        return Promise.resolve(null);
      }
      if (depFromBitMap && fs.existsSync(depFromBitMap.rootDir)) {
        dep.writtenPath = depFromBitMap.rootDir;
        logger.debug(
          `writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in bit map and file system`
        );
        Analytics.addBreadCrumb(
          'writeToComponentsDir',
          `writeToComponentsDir, ignore dependency ${Analytics.hashData(
            dependencyId
          )} as it already exists in bit map and file system`
        );
        consumer.bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
        return Promise.resolve(dep);
      }
      if (dependenciesIdsCache[dependencyId]) {
        logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in cache`);
        Analytics.addBreadCrumb(
          'writeToComponentsDir',
          `writeToComponentsDir, ignore dependency ${Analytics.hashData(dependencyId)} as it already exists in cache`
        );
        dep.writtenPath = dependenciesIdsCache[dependencyId];
        consumer.bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
        return Promise.resolve(dep);
      }
      const depBitPath = consumer.composeDependencyPath(dep.id);
      dep.writtenPath = depBitPath;
      dependenciesIdsCache[dependencyId] = depBitPath;
      // When a component is NESTED we do interested in the exact version, because multiple components with the same scope
      // and namespace can co-exist with different versions.
      const componentMap = consumer.bitMap.getComponent(dep.id.toString(), false);
      return dep.write({
        bitDir: depBitPath,
        override,
        writePackageJson,
        origin: COMPONENT_ORIGINS.NESTED,
        parent: componentWithDeps.component.id,
        consumer: this,
        componentMap,
        excludeRegistryPrefix
      });
    });

    return Promise.all(writeDependenciesP).then(deps => deps.filter(dep => dep));
  });
  const writtenDependenciesIncludesNull = await Promise.all(allDependenciesP);
  const writtenDependencies = writtenDependenciesIncludesNull.filter(dep => dep);
  if (writeToPath) {
    componentsWithDependencies.forEach((componentWithDeps) => {
      const relativeWrittenPath = consumer.getPathRelativeToConsumer(componentWithDeps.component.writtenPath);
      if (relativeWrittenPath && path.resolve(relativeWrittenPath) !== path.resolve(writeToPath)) {
        const component = componentWithDeps.component;
        moveExistingComponent(consumer.bitMap, component, relativeWrittenPath, writeToPath);
      }
    });
  }

  // add workspaces if flag is true
  await packageJson.addWorkspacesToPackageJson(
    this,
    consumer.getPath(),
    consumer.bitJson.componentsDefaultDirectory,
    consumer.bitJson.dependenciesDirectory,
    writeToPath
  );

  if (installNpmPackages) {
    await installNpmPackagesForComponents(
      this,
      componentsWithDependencies,
      verbose,
      silentPackageManagerResult,
      installPeerDependencies
    );
  }
  if (addToRootPackageJson) await packageJson.addComponentsToRoot(this, writtenComponents.map(c => c.id));

  return linkComponents(
    componentsWithDependencies,
    writtenComponents,
    writtenDependencies,
    this,
    createNpmLinkFiles,
    writePackageJson
  );
});
