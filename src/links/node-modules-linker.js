/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import symlinkOrCopy from 'symlink-or-copy';
import glob from 'glob';
import { BitId } from '../bit-id';
import type Component from '../consumer/component/consumer-component';
import { COMPONENT_ORIGINS } from '../constants';
import type ComponentMap from '../consumer/bit-map/component-map';
import logger from '../logger/logger';
import { pathRelativeLinux, first, pathNormalizeToLinux } from '../utils';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';
import type Consumer from '../consumer/consumer';
import { getIndexFileName, writeComponentsDependenciesLinks, getComponentsDependenciesLinks } from './link-generator';
import { getLinkToFileContent } from './link-content';
import type { PathOsBasedRelative, PathLinuxRelative } from '../utils/path';
import getNodeModulesPathOfComponent from '../utils/component-node-modules-path';
import type { Dependency } from '../consumer/component/dependencies';
import BitMap from '../consumer/bit-map/bit-map';
import AbstractVinyl from '../consumer/component/sources/abstract-vinyl';
import Symlink from './symlink';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import LinkFile from './link-file';

type LinkDetail = { from: string, to: string };

export type LinksResult = {
  id: BitId,
  bound: LinkDetail[]
};

/**
 * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
 * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
 */
function symlinkPackages(from: string, to: string, consumer: Consumer, component: Component) {
  const dependenciesSavedAsComponents = component.dependenciesSavedAsComponents;
  const fromNodeModules = path.join(from, 'node_modules');
  const toNodeModules = path.join(to, 'node_modules');
  logger.debug(`symlinkPackages for dists outside the component directory from ${fromNodeModules} to ${toNodeModules}`);
  const unfilteredDirs = glob.sync('*', { cwd: fromNodeModules });
  // when dependenciesSavedAsComponents the node_modules/@bit has real link files, we don't want to touch them
  // otherwise, node_modules/@bit has packages as any other directory in node_modules
  const dirsToFilter = dependenciesSavedAsComponents ? [consumer.bitJson.bindingPrefix] : [];
  const customResolvedData = component.dependencies.getCustomResolvedData();
  if (!R.isEmpty(customResolvedData)) {
    // filter out packages that are actually symlinks to dependencies
    Object.keys(customResolvedData).forEach(importSource => dirsToFilter.push(first(importSource.split('/'))));
  }
  const dirs = dirsToFilter.length ? unfilteredDirs.filter(dir => !dirsToFilter.includes(dir)) : unfilteredDirs;
  if (!dirs.length) return;
  fs.ensureDirSync(toNodeModules);
  dirs.forEach((dir) => {
    const fromDir = path.join(fromNodeModules, dir);
    const toDir = path.join(toNodeModules, dir);
    logger.debug(`removing current ${toDir} and generating a symlink for package, from ${fromDir} to ${toDir}`);
    fs.removeSync(toDir);
    symlinkOrCopy.sync(fromDir, toDir);
  });
}

function writeDependenciesLinks(component: Component, componentMap: ComponentMap, consumer: Consumer): LinkDetail[] {
  return component.getAllDependencies().map((dependency: Dependency) => {
    const dependencyComponentMap = consumer.bitMap.getComponentIfExist(dependency.id);
    const writtenLinks = [];
    if (!dependencyComponentMap) return writtenLinks;
    const parentRootDir = componentMap.rootDir || '.'; // compilers/testers don't have rootDir
    writtenLinks.push(
      writeDependencyLink(
        consumer.toAbsolutePath(parentRootDir),
        dependency.id,
        consumer.toAbsolutePath(dependencyComponentMap.rootDir || '.'),
        component.bindingPrefix
      )
    );
    if (!consumer.shouldDistsBeInsideTheComponent()) {
      // when dists are written outside the component, it doesn't matter whether a component
      // has dists files or not, in case it doesn't have, the files are copied from the component
      // dir into the dist dir. (see consumer-component.write())
      const from = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
      const to = component.dists.getDistDirForConsumer(consumer, dependencyComponentMap.rootDir);
      writtenLinks.push(writeDependencyLink(from, dependency.id, to, component.bindingPrefix));
      // @todo: why is it from a component to its dependency? shouldn't it be from component src to dist/component?
      symlinkPackages(from, to, consumer, component);
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
  const dest = path.join(getNodeModulesPathOfComponent(component.bindingPrefix, componentId), indexFileName);
  const destAbs = consumer.toAbsolutePath(dest);
  const mainFileAbs = consumer.toAbsolutePath(mainFile);
  const destRelative = pathRelativeLinux(path.dirname(destAbs), mainFileAbs);
  const fileContent = getLinkToFileContent(destRelative);
  if (fileContent) {
    // otherwise, the file type is not supported, no need to write anything
    fs.outputFileSync(destAbs, fileContent);
  }
}

function writeMissingLinks(consumer: Consumer, component: Component, componentMap: ComponentMap): LinkDetail[] {
  const missingLinks = component.issues.missingLinks;
  const result = Object.keys(component.issues.missingLinks).map((key) => {
    return missingLinks[key].map((dependencyIdRaw: BitId) => {
      const dependencyId: BitId = consumer.bitMap.getBitId(dependencyIdRaw, { ignoreVersion: true });
      const dependencyComponentMap = consumer.bitMap.getComponent(dependencyId);
      return writeDependencyLink(
        consumer.toAbsolutePath(componentMap.rootDir),
        dependencyId,
        consumer.toAbsolutePath(dependencyComponentMap.rootDir),
        component.bindingPrefix
      );
    });
  });
  return R.flatten(result);
}

async function writeMissingCustomResolvedLinks(consumer: Consumer, component: Component) {
  if (!component.componentFromModel) return [];

  const componentWithDependencies = await component.toComponentWithDependencies(consumer);
  const missingLinks = component.issues.missingCustomModuleResolutionLinks;
  const dependenciesStr = R.flatten(Object.keys(missingLinks).map(fileName => missingLinks[fileName]));
  component.copyDependenciesFromModel(dependenciesStr);
  await writeComponentsDependenciesLinks([componentWithDependencies], consumer, false);

  // for now, don't display these links as they're not symlinks, and are not compatible with the
  // LinkDetail type
  return [];
}

async function _linkImportedComponents(
  consumer: Consumer,
  component: Component,
  componentMap: ComponentMap
): Promise<LinksResult> {
  const componentId = component.id;
  const relativeLinkPath = getNodeModulesPathOfComponent(consumer.bitJson.bindingPrefix, componentId);
  const linkPath = consumer.toAbsolutePath(relativeLinkPath);
  // when a user moves the component directory, use component.writtenPath to find the correct target
  const srcTarget = component.writtenPath || componentMap.rootDir;
  if (!component.dists.isEmpty() && component.dists.writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
    const distTarget = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
    symlinkPackages(srcTarget, distTarget, consumer, component);
    createSymlinkOrCopy(distTarget, linkPath, componentId.toString());
  } else {
    createSymlinkOrCopy(srcTarget, linkPath, componentId.toString());
  }

  const bound = [{ from: componentMap.rootDir, to: relativeLinkPath }];
  const boundDependencies = component.hasDependencies()
    ? writeDependenciesLinks(component, componentMap, consumer)
    : [];
  const boundMissingDependencies =
    component.issues && component.issues.missingLinks ? writeMissingLinks(consumer, component, componentMap) : [];
  const boundMissingCustomResolvedLinks =
    component.issues && component.issues.missingCustomModuleResolutionLinks
      ? await writeMissingCustomResolvedLinks(consumer, component)
      : [];
  const boundAll = bound.concat([
    ...R.flatten(boundDependencies),
    ...boundMissingDependencies,
    ...boundMissingCustomResolvedLinks
  ]);
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
    const dest = path.join(getNodeModulesPathOfComponent(component.bindingPrefix, componentId), file);
    const destAbs = consumer.toAbsolutePath(dest);
    const fileAbs = consumer.toAbsolutePath(file);
    const destRelative = pathRelativeLinux(path.dirname(destAbs), fileAbs);
    const fileContent = getLinkToFileContent(destRelative);
    fs.outputFileSync(destAbs, fileContent);
    return { from: dest, to: file };
  });
  linkToMainFile(component, componentMap, componentId, consumer);
  return { id: componentId, bound };
}

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default class NodeModuleLinker {
  components: Component[];
  consumer: ?Consumer;
  bitMap: BitMap;
  symlinks: Symlink[] = [];
  files: AbstractVinyl[] = [];
  constructor(components: Component[], consumer: ?Consumer, bitMap: ?BitMap) {
    this.components = components;
    this.consumer = consumer; // $FlowFixMe
    this.bitMap = bitMap || consumer.bitMap;
  }
  async link(): Promise<void> {
    const links = await this.getLinks();
    await links.persistAll();
  }
  async getLinks(): Promise<DataToPersist> {
    await Promise.all(
      this.components.map((component) => {
        const componentId = component.id;
        logger.debug(`linking component to node_modules: ${componentId.toString()}`);
        // const componentMap: ComponentMap = consumer.bitMap.getComponent(componentId);
        // $FlowFixMe
        const componentMap: ComponentMap = component.componentMap;
        switch (componentMap.origin) {
          case COMPONENT_ORIGINS.IMPORTED:
            return this._populateImportedComponentsLinks(component);
          case COMPONENT_ORIGINS.NESTED:
            return this._populateNestedComponentsLinks(component);
          case COMPONENT_ORIGINS.AUTHORED:
            return this._populateAuthoredComponentsLinks(component);
          default:
            throw new Error(
              `ComponentMap.origin ${componentMap.origin} of ${componentId.toString()} is not recognized`
            );
        }
      })
    );
    return DataToPersist.makeInstance({ files: this.files, symlinks: this.symlinks });
  }

  async getLinksResults(): LinksResults[] {
    throw new Error('to implement');
  }

  async _populateImportedComponentsLinks(component: Component): Promise<void> {
    const componentMap = component.componentMap;
    const componentId = component.id;
    const bindingPrefix = this.consumer ? this.consumer.bitJson.bindingPrefix : null;
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent(bindingPrefix, componentId);
    // when a user moves the component directory, use component.writtenPath to find the correct target
    // $FlowFixMe
    const srcTarget: PathOsBasedRelative = component.writtenPath || componentMap.rootDir;
    const shouldDistsBeInsideTheComponent = this.consumer ? this.consumer.shouldDistsBeInsideTheComponent() : true;
    if (
      this.consumer &&
      !component.dists.isEmpty() &&
      component.dists.writeDistsFiles &&
      !shouldDistsBeInsideTheComponent
    ) {
      const distTarget = component.dists.getDistDir(this.consumer, componentMap.rootDir);
      const packagesSymlinks = this.getSymlinkPackages(srcTarget, distTarget, component);
      this.symlinks.push(...packagesSymlinks);
      this.symlinks.push(Symlink.makeInstance(distTarget, linkPath, componentId.toString()));
    } else {
      this.symlinks.push(Symlink.makeInstance(srcTarget, linkPath, componentId.toString()));
    }

    if (component.hasDependencies()) {
      const dependenciesLinks = this.getDependenciesLinks(component);
      this.symlinks.push(...dependenciesLinks);
    }
    const missingDependenciesLinks =
      this.consumer && component.issues && component.issues.missingLinks ? this.getMissingLinks(component) : [];
    this.symlinks.push(...missingDependenciesLinks);
    const missingCustomResolvedLinks =
      this.consumer && component.issues && component.issues.missingCustomModuleResolutionLinks
        ? await this.getMissingCustomResolvedLinks(component)
        : [];
    this.files.push(...missingCustomResolvedLinks);
  }

  /**
   * nested components are linked only during the import process. running `bit link` command won't
   * link them because the nested dependencies are not loaded during consumer.loadComponents()
   */
  _populateNestedComponentsLinks(component: Component): void {
    if (component.hasDependencies()) {
      const dependenciesLinks = this.getDependenciesLinks(component);
      this.symlinks.push(...dependenciesLinks);
    }
  }

  /**
   * authored components are linked only when they were exported before
   */
  _populateAuthoredComponentsLinks(component: Component): void {
    const componentId = component.id;
    if (!componentId.scope) return; // scope is a must to generate the link
    const filesToBind = component.componentMap.getFilesRelativeToConsumer();
    filesToBind.forEach((file) => {
      const dest = path.join(getNodeModulesPathOfComponent(component.bindingPrefix, componentId), file);
      // const destAbs = consumer.toAbsolutePath(dest);
      // const fileAbs = consumer.toAbsolutePath(file);
      const destRelative = this.getPathRelativeRegardlessCWD(dest, file);
      const fileContent = getLinkToFileContent(destRelative);
      const vinyl = new AbstractVinyl({ path: dest, contents: fileContent });
      this.files.push(vinyl);
    });
    this.populateLinkToMainFile(component);
  }

  /**
   * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
   * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
   */
  getSymlinkPackages(from: string, to: string, component: Component): Symlink[] {
    if (!this.consumer) throw new Error('getSymlinkPackages expects the Consumer to be defined');
    const dependenciesSavedAsComponents = component.dependenciesSavedAsComponents;
    const fromNodeModules = path.join(from, 'node_modules');
    const toNodeModules = path.join(to, 'node_modules');
    logger.debug(
      `symlinkPackages for dists outside the component directory from ${fromNodeModules} to ${toNodeModules}`
    );
    const unfilteredDirs = glob.sync('*', { cwd: fromNodeModules });
    // when dependenciesSavedAsComponents the node_modules/@bit has real link files, we don't want to touch them
    // otherwise, node_modules/@bit has packages as any other directory in node_modules
    const dirsToFilter = dependenciesSavedAsComponents ? [this.consumer.bitJson.bindingPrefix] : [];
    const customResolvedData = component.dependencies.getCustomResolvedData();
    if (!R.isEmpty(customResolvedData)) {
      // filter out packages that are actually symlinks to dependencies
      Object.keys(customResolvedData).forEach(importSource => dirsToFilter.push(first(importSource.split('/'))));
    }
    const dirs = dirsToFilter.length ? unfilteredDirs.filter(dir => !dirsToFilter.includes(dir)) : unfilteredDirs;
    if (!dirs.length) return [];
    return dirs.map((dir) => {
      const fromDir = path.join(fromNodeModules, dir);
      const toDir = path.join(toNodeModules, dir);
      return Symlink.makeInstance(fromDir, toDir);
    });
  }

  getDependenciesLinks(component: Component): Symlink[] {
    // $FlowFixMe
    const componentMap: ComponentMap = component.componentMap;
    const getSymlinks = (dependency: Dependency): Symlink[] => {
      const dependencyComponentMap = this.bitMap.getComponentIfExist(dependency.id);
      const dependenciesLinks: Symlink[] = [];
      if (!dependencyComponentMap) return dependenciesLinks;
      const parentRootDir = componentMap.rootDir || '.'; // compilers/testers don't have rootDir
      dependenciesLinks.push(
        this.getDependencyLink(
          parentRootDir,
          dependency.id,
          dependencyComponentMap.rootDir || '.',
          component.bindingPrefix
        )
      );
      if (this.consumer && !this.consumer.shouldDistsBeInsideTheComponent()) {
        // when dists are written outside the component, it doesn't matter whether a component
        // has dists files or not, in case it doesn't have, the files are copied from the component
        // dir into the dist dir. (see consumer-component.write())
        const from = component.dists.getDistDirForConsumer(this.consumer, componentMap.rootDir);
        const to = component.dists.getDistDirForConsumer(this.consumer, dependencyComponentMap.rootDir);
        dependenciesLinks.push(this.getDependencyLink(from, dependency.id, to, component.bindingPrefix));
        // @todo: why is it from a component to its dependency? shouldn't it be from component src to dist/component?
        const packagesSymlinks = this.getSymlinkPackages(from, to, component);
        dependenciesLinks.push(...packagesSymlinks);
      }
      return dependenciesLinks;
    };
    const symlinks = component.getAllDependencies().map((dependency: Dependency) => getSymlinks(dependency));
    return R.flatten(symlinks);
  }

  getMissingLinks(component: Component): Symlink[] {
    const missingLinks = component.issues.missingLinks;
    const result = Object.keys(component.issues.missingLinks).map((key) => {
      return missingLinks[key].map((dependencyIdRaw: BitId) => {
        const dependencyId: BitId = this.bitMap.getBitId(dependencyIdRaw, { ignoreVersion: true });
        const dependencyComponentMap = this.bitMap.getComponent(dependencyId);
        return this.getDependencyLink(
          component.componentMap.rootDir,
          dependencyId,
          dependencyComponentMap.rootDir,
          component.bindingPrefix
        );
      });
    });
    return R.flatten(result);
  }

  getDependencyLink(
    parentRootDir: PathOsBasedRelative,
    bitId: BitId,
    rootDir: PathOsBasedRelative,
    bindingPrefix: string
  ): Symlink {
    const relativeDestPath = getNodeModulesPathOfComponent(bindingPrefix, bitId);
    const destPathInsideParent = path.join(parentRootDir, relativeDestPath);
    return Symlink.makeInstance(rootDir, destPathInsideParent, bitId.toString());
  }

  async getMissingCustomResolvedLinks(component: Component): Promise<LinkFile[]> {
    if (!component.componentFromModel) return [];

    const componentWithDependencies = await component.toComponentWithDependencies(this.consumer);
    const missingLinks = component.issues.missingCustomModuleResolutionLinks;
    const dependenciesStr = R.flatten(Object.keys(missingLinks).map(fileName => missingLinks[fileName]));
    component.copyDependenciesFromModel(dependenciesStr);
    return getComponentsDependenciesLinks([componentWithDependencies], this.consumer, false);
  }

  /**
   * path.resolve uses current working dir.
   * for us, the cwd is not important. a user may running bit command from an inner dir.
   */
  getPathRelativeRegardlessCWD(from: PathOsBasedRelative, to: PathOsBasedRelative): PathLinuxRelative {
    const fromLinux = pathNormalizeToLinux(from);
    const toLinux = pathNormalizeToLinux(to);
    // change them to absolute so path.relative won't consider the cwd
    return pathRelativeLinux(`/${fromLinux}`, `/${toLinux}`);
  }

  /**
   * Link from node_modules/@bit/component-name/index.js to the component's main file.
   * It is needed for Authored components only.
   * Since an authored component doesn't have rootDir, it's impossible to symlink to the component directory.
   * It makes it easier for Author to use absolute syntax between their own components.
   */
  populateLinkToMainFile(component: Component) {
    component.dists.updateDistsPerConsumerBitJson(component.id, this.consumer, component.componentMap);
    const mainFile = component.dists.calculateMainDistFileForAuthored(component.mainFile, this.consumer);
    const indexFileName = getIndexFileName(mainFile);
    const dest = path.join(getNodeModulesPathOfComponent(component.bindingPrefix, component.id), indexFileName);
    const destRelative = this.getPathRelativeRegardlessCWD(dest, mainFile);
    const fileContent = getLinkToFileContent(destRelative);
    if (fileContent) {
      // otherwise, the file type is not supported, no need to write anything
      const vinyl = new AbstractVinyl({ path: dest, contents: fileContent });
      this.files.push(vinyl);
    }
  }
}
