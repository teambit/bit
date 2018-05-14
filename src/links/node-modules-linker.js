/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import symlinkOrCopy from 'symlink-or-copy';
import glob from 'glob';
import { BitId } from '../bit-id';
import Component from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import ComponentMap from '../consumer/bit-map/component-map';
import logger from '../logger/logger';
import { pathRelativeLinux } from '../utils';
import Consumer from '../consumer/consumer';
import { getLinkContent, getIndexFileName } from './link-generator';
import type { PathOsBased, PathLinux } from '../utils/path';
import GeneralError from '../error/general-error';
import { Dependency } from '../consumer/component/dependencies';
import type { RelativePath } from '../consumer/component/dependencies/Dependency';

type LinkDetail = { from: string, to: string };

export type LinksResult = {
  id: BitId,
  bound: LinkDetail[]
};

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
    throw new GeneralError(`failed to link a component ${componentId.toString()}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }
}

function writeDependencyLink(
  parentRootDir: PathOsBased, // absolute path
  bitId: BitId,
  rootDir: PathOsBased, // absolute path
  bindingPrefix: string
): LinkDetail {
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

/**
 * relevant when custom-module-resolution was used in the original (authored) component
 */
function writeNonRelativeDependenciesLinks(
  parentComponentMap: ComponentMap,
  dependency: Dependency,
  dependencyRootDir: PathLinux
): LinkDetail[] {
  // $FlowFixMe
  const parentRootDir: string = parentComponentMap.rootDir;
  const writeLink = (importSource: string): LinkDetail => {
    const destPath = path.join(parentRootDir, 'node_modules', importSource);
    createSymlinkOrCopy(dependency.id, dependencyRootDir, destPath);
    return { from: parentRootDir, to: dependencyRootDir };
  };
  const writtenLinks = [];
  dependency.relativePaths.forEach((relativePath: RelativePath) => {
    if (relativePath.isCustomResolveUsed) {
      writtenLinks.push(writeLink(relativePath.importSource));
    }
  });
  return writtenLinks;
}

function writeDependenciesLinks(component: Component, componentMap: ComponentMap, consumer: Consumer): LinkDetail[] {
  return component.getAllDependencies().map((dependency: Dependency) => {
    const dependencyComponentMap = consumer.bitMap.getComponent(dependency.id);
    const writtenLinks = [];
    if (!dependencyComponentMap) return writtenLinks;
    if (!componentMap.rootDir) throw new Error(`rootDir is missing from ${component.id.toString()}`);
    writtenLinks.push(
      writeDependencyLink(
        consumer.toAbsolutePath(componentMap.rootDir),
        dependency.id,
        consumer.toAbsolutePath(dependencyComponentMap.rootDir),
        component.bindingPrefix
      )
    );
    if (!dependencyComponentMap.rootDir) throw new Error(`rootDir is missing from ${dependency.id.toString()}`);
    writeNonRelativeDependenciesLinks(componentMap, dependency, dependencyComponentMap.rootDir);
    if (!consumer.shouldDistsBeInsideTheComponent()) {
      const from = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
      const to = component.dists.getDistDirForConsumer(consumer, dependencyComponentMap.rootDir);
      writtenLinks.push(writeDependencyLink(from, dependency.id, to, component.bindingPrefix));
      // writeNonRelativeDependenciesLinks() // @todo
      symlinkPackages(from, to, consumer);
    }
    return writtenLinks;
  });
}

/**
 * Link from node_modules/@bit/component-name/index.js to the component's main file.
 * It is needed for Authored components only.
 * Since an authored component doesn't have rootDir, it's impossible to symlink to the component directory.
 * It makes it easier for Author to use absolute syntax between their own components.
 */
function linkToMainFile(component: Component, componentMap: ComponentMap, componentId: BitId, consumer: Consumer) {
  component.dists.updateDistsPerConsumerBitJson(component.id, consumer, componentMap);
  const mainFile = component.dists.calculateMainDistFileForAuthored(component.mainFile, consumer);
  const indexFileName = getIndexFileName(mainFile);
  const dest = path.join(Consumer.getNodeModulesPathOfComponent(component.bindingPrefix, componentId), indexFileName);
  const destRelative = pathRelativeLinux(path.dirname(dest), mainFile);
  const fileContent = getLinkContent(destRelative);
  fs.outputFileSync(dest, fileContent);
}

function writeMissingLinks(consumer: Consumer, component, componentMap: ComponentMap) {
  const missingLinks = component.missingDependencies.missingLinks;
  const result = Object.keys(component.missingDependencies.missingLinks).map((key) => {
    return missingLinks[key].map((dependencyIdStr) => {
      const dependencyId = consumer.bitMap.getExistingComponentId(dependencyIdStr);
      if (!dependencyId) return null;

      const dependencyComponentMap = consumer.bitMap.getComponent(dependencyId);
      return writeDependencyLink(
        consumer.toAbsolutePath(componentMap.rootDir),
        BitId.parse(dependencyId),
        consumer.toAbsolutePath(dependencyComponentMap.rootDir),
        component.bindingPrefix
      );
    });
  });
  return R.flatten(result);
}

function _linkImportedComponents(consumer: Consumer, component: Component, componentMap: ComponentMap): LinksResult {
  const componentId = component.id;
  const relativeLinkPath = Consumer.getNodeModulesPathOfComponent(consumer.bitJson.bindingPrefix, componentId);
  const linkPath = consumer.toAbsolutePath(relativeLinkPath);
  // when a user moves the component directory, use component.writtenPath to find the correct target
  const srcTarget = component.writtenPath || consumer.toAbsolutePath(componentMap.rootDir);
  if (!component.dists.isEmpty() && component.dists.writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
    const distTarget = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
    symlinkPackages(srcTarget, distTarget, consumer, component.dependenciesSavedAsComponents);
    createSymlinkOrCopy(componentId, distTarget, linkPath);
  } else {
    createSymlinkOrCopy(componentId, srcTarget, linkPath);
  }

  const bound = [{ from: componentMap.rootDir, to: relativeLinkPath }];
  const boundDependencies = component.hasDependencies()
    ? writeDependenciesLinks(component, componentMap, consumer)
    : [];
  const boundMissingDependencies =
    component.missingDependencies && component.missingDependencies.missingLinks
      ? writeMissingLinks(consumer, component, componentMap)
      : [];
  const boundAll = bound.concat([...R.flatten(boundDependencies), ...boundMissingDependencies]);
  // $FlowFixMe
  return { id: componentId, bound: boundAll };
}

/**
 * nested components are linked only during the import process. running `bit link` command won't
 * link them because the nested dependencies are not loaded during consumer.loadComponents()
 */
function _linkNestedComponents(consumer: Consumer, component: Component, componentMap: ComponentMap): LinksResult {
  const componentId = component.id;
  if (!component.hasDependencies()) return { id: componentId, bound: [] };
  const bound = writeDependenciesLinks(component, componentMap, consumer);
  return { id: componentId, bound };
}

/**
 * authored components are linked only when they were exported before
 */
function _linkAuthoredComponents(consumer: Consumer, component: Component, componentMap: ComponentMap): LinksResult {
  const componentId = component.id;
  if (!componentId.scope) return { id: componentId, bound: [] }; // scope is a must to generate the link
  const filesToBind = componentMap.getFilesRelativeToConsumer();
  const bound = filesToBind.map((file) => {
    const dest = path.join(Consumer.getNodeModulesPathOfComponent(component.bindingPrefix, componentId), file);
    const destRelative = pathRelativeLinux(path.dirname(dest), file);
    const fileContent = `module.exports = require('${destRelative}');`;
    fs.outputFileSync(dest, fileContent);
    return { from: dest, to: file };
  });
  linkToMainFile(component, componentMap, componentId, consumer);
  return { id: componentId, bound };
}

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default function linkComponents(components: Component[], consumer: Consumer): LinksResult[] {
  return components.map((component) => {
    const componentId = component.id;
    logger.debug(`linking component to node_modules: ${componentId}`);
    const componentMap: ComponentMap = consumer.bitMap.getComponent(componentId, true);
    switch (componentMap.origin) {
      case COMPONENT_ORIGINS.IMPORTED:
        return _linkImportedComponents(consumer, component, componentMap);
      case COMPONENT_ORIGINS.NESTED:
        return _linkNestedComponents(consumer, component, componentMap);
      case COMPONENT_ORIGINS.AUTHORED:
        return _linkAuthoredComponents(consumer, component, componentMap);
      default:
        throw new Error(`ComponentMap.origin ${componentMap.origin} of ${componentId} is not recognized`);
    }
  });
}
