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
import { isDir, isDirEmptySync } from '../../utils';
import GeneralError from '../../error/general-error';
import ComponentMap from '../bit-map/component-map';
import ComponentWriter from './component-writer';

function throwErrorWhenDirectoryNotEmpty(
  componentDir: string,
  override: boolean,
  componentMap: ?ComponentMap,
  writeToPath: ?string
) {
  // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
  // component is not new, and it's ok to override the existing directory.
  if (!writeToPath && componentMap) return;
  // if writeToPath specified and that directory is already used for that component, it's ok to override
  if (writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === writeToPath) return;

  if (fs.pathExistsSync(componentDir)) {
    if (!isDir(componentDir)) {
      throw new GeneralError(`unable to import to ${componentDir} because it's a file`);
    }
    if (!isDirEmptySync(componentDir) && !override) {
      throw new GeneralError(
        `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
      );
    }
  }
}

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
  writeConfig = false,
  configDir,
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
  silentPackageManagerResult?: boolean,
  componentsWithDependencies: ComponentWithDependencies[],
  writeToPath?: string,
  override?: boolean,
  writePackageJson?: boolean,
  writeConfig?: boolean,
  configDir?: string,
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
  const writeComponentsParams = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
    const bitDir = writeToPath
      ? path.resolve(writeToPath)
      : consumer.composeComponentPath(componentWithDeps.component.id);
    // if it doesn't go to the hub, it can't import dependencies as packages
    componentWithDeps.component.dependenciesSavedAsComponents =
      saveDependenciesAsComponents || !remotes.isHub(componentWithDeps.component.scope);
    // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
    // find the component in bit.map
    const componentMap = consumer.bitMap.getComponentPreferNonNested(componentWithDeps.component.id);
    const origin =
      componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED
        ? COMPONENT_ORIGINS.AUTHORED
        : COMPONENT_ORIGINS.IMPORTED;
    const configDirFromComponentMap = componentMap ? componentMap.configDir : undefined;
    throwErrorWhenDirectoryNotEmpty(bitDir, override, componentMap, writeToPath);
    // don't write dists files for authored components as the author has its own mechanism to generate them
    // also, don't write dists file for imported component, unless the user used '--dist' flag
    componentWithDeps.component.dists.writeDistsFiles = writeDists && origin === COMPONENT_ORIGINS.IMPORTED;
    return {
      writeParams: {
        component: componentWithDeps.component,
        writeToPath: bitDir,
        override: true,
        writeConfig,
        configDir: configDir || configDirFromComponentMap,
        writePackageJson,
        origin,
        consumer,
        writeBitDependencies: writeBitDependencies || !componentWithDeps.component.dependenciesSavedAsComponents, // when dependencies are written as npm packages, they must be written in package.json
        existingComponentMap: componentMap,
        excludeRegistryPrefix
      }
    };
  });
  const writeComponentsP = writeComponentsParams.map(({ writeParams }) => {
    const componentWriter = ComponentWriter.getInstance(writeParams);
    return componentWriter.write();
  });
  const writtenComponents = await Promise.all(writeComponentsP);

  const allDependenciesP = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
    const writeDependenciesP = componentWithDeps.allDependencies.map((dep: Component) => {
      const dependencyId = dep.id.toString();
      const depFromBitMap = consumer.bitMap.getComponentIfExist(dep.id);
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
      if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.AUTHORED) {
        dep.writtenPath = consumer.getPath();
        logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in bit map`);
        Analytics.addBreadCrumb(
          'writeToComponentsDir',
          `writeToComponentsDir, ignore dependency ${Analytics.hashData(dependencyId)} as it already exists in bit map`
        );
        consumer.bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
        return Promise.resolve(dep);
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
      const depRootPath = consumer.composeDependencyPath(dep.id);
      dep.writtenPath = depRootPath;
      dependenciesIdsCache[dependencyId] = depRootPath;
      // When a component is NESTED we do interested in the exact version, because multiple components with the same scope
      // and namespace can co-exist with different versions.
      const componentMap = consumer.bitMap.getComponentIfExist(dep.id);
      const componentWriter = ComponentWriter.getInstance({
        component: dep,
        writeToPath: depRootPath,
        override: true,
        writePackageJson,
        origin: COMPONENT_ORIGINS.NESTED,
        parent: componentWithDeps.component.id,
        consumer,
        existingComponentMap: componentMap,
        excludeRegistryPrefix
      });
      return componentWriter.write();
    });

    return Promise.all(writeDependenciesP).then(deps => deps.filter(dep => dep));
  });
  const writtenDependenciesIncludesNull = await Promise.all(allDependenciesP);
  const writtenDependencies = writtenDependenciesIncludesNull.filter(dep => dep);
  if (writeToPath) {
    componentsWithDependencies.forEach((componentWithDeps) => {
      const relativeWrittenPath = consumer.getPathRelativeToConsumer(componentWithDeps.component.writtenPath);
      const absoluteWrittenPath = consumer.toAbsolutePath(relativeWrittenPath);
      const absoluteWriteToPath = path.resolve(writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
      if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
        const component = componentWithDeps.component;
        moveExistingComponent(consumer, component, absoluteWrittenPath, absoluteWriteToPath);
      }
    });
  }

  // add workspaces if flag is true
  await packageJson.addWorkspacesToPackageJson(consumer, writeToPath);

  if (installNpmPackages) {
    await installNpmPackagesForComponents(
      consumer,
      componentsWithDependencies,
      verbose,
      silentPackageManagerResult,
      installPeerDependencies
    );
  }
  if (addToRootPackageJson) await packageJson.addComponentsToRoot(consumer, writtenComponents.map(c => c.id));

  return linkComponents(
    componentsWithDependencies,
    writtenComponents,
    writtenDependencies,
    consumer,
    createNpmLinkFiles,
    writePackageJson
  );
});
