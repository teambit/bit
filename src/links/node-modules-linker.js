/** @flow */
import path from 'path';
import R from 'ramda';
import glob from 'glob';
import { BitId } from '../bit-id';
import type Component from '../consumer/component/consumer-component';
import { COMPONENT_ORIGINS } from '../constants';
import type ComponentMap from '../consumer/bit-map/component-map';
import logger from '../logger/logger';
import { pathRelativeLinux, first, pathNormalizeToLinux } from '../utils';
import type Consumer from '../consumer/consumer';
import { getIndexFileName, getComponentsDependenciesLinks } from './link-generator';
import { getLinkToFileContent } from './link-content';
import type { PathOsBasedRelative, PathLinuxRelative } from '../utils/path';
import getNodeModulesPathOfComponent from '../utils/bit/component-node-modules-path';
import type { Dependency } from '../consumer/component/dependencies';
import BitMap from '../consumer/bit-map/bit-map';
import AbstractVinyl from '../consumer/component/sources/abstract-vinyl';
import Symlink from './symlink';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import LinkFile from './link-file';
import ComponentsList from '../consumer/component/components-list';

type LinkDetail = { from: string, to: string };
export type LinksResult = {
  id: BitId,
  bound: LinkDetail[]
};

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default class NodeModuleLinker {
  components: Component[];
  consumer: ?Consumer;
  bitMap: BitMap; // preparation for the capsule, which is going to have only BitMap with no Consumer
  symlinks: Symlink[] = [];
  files: AbstractVinyl[] = [];
  constructor(components: Component[], consumer: ?Consumer, bitMap: ?BitMap) {
    this.components = ComponentsList.getUniqueComponents(components);
    this.consumer = consumer; // $FlowFixMe
    this.bitMap = bitMap || consumer.bitMap;
  }
  async link(): Promise<LinksResult[]> {
    const links = await this.getLinks();
    const linksResults = this.getLinksResults();
    if (this.consumer) links.addBasePath(this.consumer.getPath());
    await links.persistAllToFS();
    return linksResults;
  }
  async getLinks(): Promise<DataToPersist> {
    await Promise.all(
      this.components.map((component) => {
        const componentId = component.id.toString();
        logger.debug(`linking component to node_modules: ${componentId}`);
        const componentMap: ComponentMap = this.bitMap.getComponent(component.id);
        component.componentMap = componentMap;
        switch (componentMap.origin) {
          case COMPONENT_ORIGINS.IMPORTED:
            return this._populateImportedComponentsLinks(component);
          case COMPONENT_ORIGINS.NESTED:
            return this._populateNestedComponentsLinks(component);
          case COMPONENT_ORIGINS.AUTHORED:
            return this._populateAuthoredComponentsLinks(component);
          default:
            throw new Error(`ComponentMap.origin ${componentMap.origin} of ${componentId} is not recognized`);
        }
      })
    );
    const dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(this.files);
    dataToPersist.addManySymlinks(this.symlinks);
    return dataToPersist;
  }
  getLinksResults(): LinksResult[] {
    const linksResults: LinksResult[] = [];
    const getExistingLinkResult = id => linksResults.find(linkResult => linkResult.id.isEqual(id));
    const addLinkResult = (id: ?BitId, from: string, to: string) => {
      if (!id) return;
      const existingLinkResult = getExistingLinkResult(id);
      if (existingLinkResult) {
        existingLinkResult.bound.push({ from, to });
      } else {
        linksResults.push({ id, bound: [{ from, to }] });
      }
    };
    this.symlinks.forEach((symlink: Symlink) => {
      addLinkResult(symlink.componentId, symlink.src, symlink.dest);
    });
    this.files.forEach((file: LinkFile) => {
      addLinkResult(file.componentId, file.srcPath, file.path);
    });
    this.components.forEach((component) => {
      const existingLinkResult = getExistingLinkResult(component.id);
      if (!existingLinkResult) {
        linksResults.push({ id: component.id, bound: [] });
      }
    });
    return linksResults;
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
      const packagesSymlinks = this._getSymlinkPackages(srcTarget, distTarget, component);
      this.symlinks.push(...packagesSymlinks);
      this.symlinks.push(Symlink.makeInstance(distTarget, linkPath, componentId));
    } else {
      this.symlinks.push(Symlink.makeInstance(srcTarget, linkPath, componentId));
    }

    if (component.hasDependencies()) {
      const dependenciesLinks = this._getDependenciesLinks(component);
      this.symlinks.push(...dependenciesLinks);
    }
    const missingDependenciesLinks =
      this.consumer && component.issues && component.issues.missingLinks ? this._getMissingLinks(component) : [];
    this.symlinks.push(...missingDependenciesLinks);
    if (this.consumer && component.issues && component.issues.missingCustomModuleResolutionLinks) {
      const missingCustomResolvedLinks = await this._getMissingCustomResolvedLinks(component);
      this.files.push(...missingCustomResolvedLinks.files);
      this.symlinks.push(...missingCustomResolvedLinks.symlinks);
    }
  }
  /**
   * nested components are linked only during the import process. running `bit link` command won't
   * link them because the nested dependencies are not loaded during consumer.loadComponents()
   */
  _populateNestedComponentsLinks(component: Component): void {
    if (component.hasDependencies()) {
      const dependenciesLinks = this._getDependenciesLinks(component);
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
      const destRelative = this._getPathRelativeRegardlessCWD(path.dirname(dest), file);
      const fileContent = getLinkToFileContent(destRelative);
      const linkFile = LinkFile.load({ filePath: dest, content: fileContent, srcPath: file, componentId });
      this.files.push(linkFile);
    });
    this._populateLinkToMainFile(component);
  }
  /**
   * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
   * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
   */
  _getSymlinkPackages(from: string, to: string, component: Component): Symlink[] {
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

  _getDependenciesLinks(component: Component): Symlink[] {
    // $FlowFixMe
    const componentMap: ComponentMap = component.componentMap;
    const getSymlinks = (dependency: Dependency): Symlink[] => {
      const dependencyComponentMap = this.bitMap.getComponentIfExist(dependency.id);
      const dependenciesLinks: Symlink[] = [];
      if (!dependencyComponentMap) return dependenciesLinks;
      const parentRootDir = componentMap.rootDir || '.'; // compilers/testers don't have rootDir
      dependenciesLinks.push(
        this._getDependencyLink(
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
        dependenciesLinks.push(this._getDependencyLink(from, dependency.id, to, component.bindingPrefix));
        // @todo: why is it from a component to its dependency? shouldn't it be from component src to dist/component?
        const packagesSymlinks = this._getSymlinkPackages(from, to, component);
        dependenciesLinks.push(...packagesSymlinks);
      }
      return dependenciesLinks;
    };
    const symlinks = component.getAllDependencies().map((dependency: Dependency) => getSymlinks(dependency));
    return R.flatten(symlinks);
  }

  _getMissingLinks(component: Component): Symlink[] {
    const missingLinks = component.issues.missingLinks;
    const result = Object.keys(component.issues.missingLinks).map((key) => {
      return missingLinks[key].map((dependencyIdRaw: BitId) => {
        const dependencyId: BitId = this.bitMap.getBitId(dependencyIdRaw, { ignoreVersion: true });
        const dependencyComponentMap = this.bitMap.getComponent(dependencyId);
        return this._getDependencyLink(
          component.componentMap.rootDir,
          dependencyId,
          dependencyComponentMap.rootDir,
          component.bindingPrefix
        );
      });
    });
    return R.flatten(result);
  }

  _getDependencyLink(
    parentRootDir: PathOsBasedRelative,
    bitId: BitId,
    rootDir: PathOsBasedRelative,
    bindingPrefix: string
  ): Symlink {
    const relativeDestPath = getNodeModulesPathOfComponent(bindingPrefix, bitId);
    const destPathInsideParent = path.join(parentRootDir, relativeDestPath);
    return Symlink.makeInstance(rootDir, destPathInsideParent, bitId);
  }

  async _getMissingCustomResolvedLinks(component: Component): Promise<DataToPersist> {
    if (!component.componentFromModel) return new DataToPersist();

    const componentWithDependencies = await component.toComponentWithDependencies(this.consumer);
    const missingLinks = component.issues.missingCustomModuleResolutionLinks;
    const dependenciesStr = R.flatten(Object.keys(missingLinks).map(fileName => missingLinks[fileName]));
    component.copyDependenciesFromModel(dependenciesStr);
    const componentsDependenciesLinks = getComponentsDependenciesLinks(
      [componentWithDependencies],
      this.consumer,
      false
    );
    return componentsDependenciesLinks;
  }

  /**
   * path.resolve uses current working dir.
   * for us, the cwd is not important. a user may running bit command from an inner dir.
   */
  _getPathRelativeRegardlessCWD(from: PathOsBasedRelative, to: PathOsBasedRelative): PathLinuxRelative {
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
  _populateLinkToMainFile(component: Component) {
    component.dists.updateDistsPerConsumerBitJson(component.id, this.consumer, component.componentMap);
    const mainFile = component.dists.calculateMainDistFileForAuthored(component.mainFile, this.consumer);
    const indexFileName = getIndexFileName(mainFile);
    const dest = path.join(getNodeModulesPathOfComponent(component.bindingPrefix, component.id), indexFileName);
    const destRelative = this._getPathRelativeRegardlessCWD(path.dirname(dest), mainFile);
    const fileContent = getLinkToFileContent(destRelative);
    if (fileContent) {
      // otherwise, the file type is not supported, no need to write anything
      const linkFile = LinkFile.load({
        filePath: dest,
        content: fileContent,
        srcPath: mainFile,
        componentId: component.id
      });
      this.files.push(linkFile);
    }
  }
}
