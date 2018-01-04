/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import symlinkOrCopy from 'symlink-or-copy';
import glob from 'glob';
import { BitId } from '../bit-id';
import Component from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import BitMap from '../consumer/bit-map/bit-map';
import ComponentMap from '../consumer/bit-map/component-map';
import logger from '../logger/logger';
import { pathRelative } from '../utils';
import Consumer from '../consumer/consumer';

/**
 * @param componentId
 * @param srcPath the path where the symlink is pointing to
 * @param destPath the path where to write the symlink
 */
function createSymlinkOrCopy(componentId, srcPath, destPath) {
  fs.removeSync(destPath); // in case a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.debug(`generating a symlink on ${destPath} pointing to ${srcPath}`);
    symlinkOrCopy.sync(srcPath, destPath);
  } catch (err) {
    throw new Error(`failed to link a component ${componentId.toString()}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }
}

function writeDependencyLink(parentRootDir: string, bitId: BitId, rootDir: string, bindingPrefix: string) {
  const relativeDestPath = Consumer.getNodeModulesPathOfComponent(bindingPrefix, bitId);
  const destPath = path.join(parentRootDir, relativeDestPath);
  createSymlinkOrCopy(bitId, rootDir, destPath);

  return { from: parentRootDir, to: rootDir };
}

/**
 * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
 * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
 */
function symlinkPackages(from: string, to: string, consumer, dependenciesSavedAsComponents: boolean = true) {
  const fromNodeModules = path.join(from, 'node_modules');
  const toNodeModules = path.join(to, 'node_modules');
  const dirsIncludesBindingPrefix = glob.sync('*', { cwd: fromNodeModules });
  // when dependenciesSavedAsComponents the node_modules/@bit has real link files, we don't want to touch them
  // otherwise, node_modules/@bit has packages as any other directory in node_modules
  const dirs = dependenciesSavedAsComponents
    ? dirsIncludesBindingPrefix.filter(dir => dir !== consumer.bitJson.bindingPrefix)
    : dirsIncludesBindingPrefix;
  if (!dirs.length) return;
  logger.debug(`deleting the content of ${toNodeModules}`);
  fs.emptyDirSync(toNodeModules);
  dirs.forEach((dir) => {
    symlinkOrCopy.sync(path.join(fromNodeModules, dir), path.join(toNodeModules, dir));
  });
}

function writeDependenciesLinks(component, componentMap, bitMap, consumer) {
  return component.dependencies.map((dependency) => {
    const dependencyComponentMap = bitMap.getComponent(dependency.id);
    const writtenLinks = [];
    writtenLinks.push(
      writeDependencyLink(
        path.join(consumer.getPath(), componentMap.rootDir),
        dependency.id,
        path.join(consumer.getPath(), dependencyComponentMap.rootDir),
        component.bindingPrefix
      )
    );
    if (!consumer.shouldDistsBeInsideTheComponent()) {
      const from = component.getDistDirForConsumer(consumer, componentMap.rootDir);
      const to = component.getDistDirForConsumer(consumer, dependencyComponentMap.rootDir);
      writtenLinks.push(writeDependencyLink(from, dependency.id, to, component.bindingPrefix));
      symlinkPackages(from, to, consumer);
    }
    return writtenLinks;
  });
}

function writeMissingLinks(component, componentMap, bitMap) {
  return component.missingDependencies.missingLinks.map((dependencyIdStr) => {
    const dependencyId = bitMap.getExistingComponentId(dependencyIdStr);
    if (!dependencyId) return null;

    const dependencyComponentMap = bitMap.getComponent(dependencyId);
    return writeDependencyLink(
      componentMap.rootDir,
      BitId.parse(dependencyId),
      dependencyComponentMap.rootDir,
      component.bindingPrefix
    );
  });
}

export default function linkComponents(components: Component[], bitMap: BitMap, consumer: Consumer): Object[] {
  return components.map((component) => {
    const componentId = component.id;
    logger.debug(`linking component: ${componentId}`);
    const componentMap: ComponentMap = bitMap.getComponent(componentId, true);
    if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
      const relativeLinkPath = Consumer.getNodeModulesPathOfComponent(consumer.bitJson.bindingPrefix, componentId);
      const linkPath = path.join(consumer.getPath(), relativeLinkPath);
      // when a user moves the component directory, use component.writtenPath to find the correct target
      const srcTarget = component.writtenPath || path.join(consumer.getPath(), componentMap.rootDir);
      if (component.dists && component._writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
        const distTarget = component.getDistDirForConsumer(consumer, componentMap.rootDir);
        symlinkPackages(srcTarget, distTarget, consumer, component.dependenciesSavedAsComponents);
        createSymlinkOrCopy(componentId, distTarget, linkPath);
      } else {
        createSymlinkOrCopy(componentId, srcTarget, linkPath);
      }

      const bound = [{ from: componentMap.rootDir, to: relativeLinkPath }];
      const boundDependencies =
        component.dependencies && component.dependenciesSavedAsComponents
          ? writeDependenciesLinks(component, componentMap, bitMap, consumer)
          : [];
      const boundMissingDependencies =
        component.missingDependencies && component.missingDependencies.missingLinks
          ? writeMissingLinks(component, componentMap, bitMap)
          : [];

      return { id: componentId, bound: bound.concat([...R.flatten(boundDependencies), ...boundMissingDependencies]) };
    }
    if (componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      if (!component.dependencies) return { id: componentId, bound: null };
      const bound = writeDependenciesLinks(component, componentMap, bitMap, consumer);
      return { id: componentId, bound };
    }

    // origin is AUTHORED
    const filesToBind = componentMap.getFilesRelativeToConsumer();
    const bound = filesToBind.map((file) => {
      if (!componentId.scope) return { id: componentId, bound: null }; // scope is a must to generate the link
      const dest = path.join(Consumer.getNodeModulesPathOfComponent(component.bindingPrefix, componentId), file);
      const destRelative = pathRelative(path.dirname(dest), file);
      const fileContent = `module.exports = require('${destRelative}');`;
      fs.outputFileSync(dest, fileContent);
      return { from: dest, to: file };
    });
    return { id: componentId, bound };
  });
}
