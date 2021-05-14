import fs from 'fs-extra';
import glob from 'glob';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import { IssuesClasses } from '@teambit/component-issues';
import { BitId } from '../bit-id';
import {
  COMPONENT_ORIGINS,
  DEFAULT_BINDINGS_PREFIX,
  IS_WINDOWS,
  PACKAGE_JSON,
  SOURCE_DIR_SYMLINK_TO_NM,
} from '../constants';
import BitMap from '../consumer/bit-map/bit-map';
import ComponentMap from '../consumer/bit-map/component-map';
import ComponentsList from '../consumer/component/components-list';
import Component from '../consumer/component/consumer-component';
import { Dependency } from '../consumer/component/dependencies';
import PackageJsonFile from '../consumer/component/package-json-file';
import { PackageJsonTransformer } from '../consumer/component/package-json-transformer';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import RemovePath from '../consumer/component/sources/remove-path';
import Consumer from '../consumer/consumer';
import logger from '../logger/logger';
import { first } from '../utils';
import getNodeModulesPathOfComponent from '../utils/bit/component-node-modules-path';
import { getPathRelativeRegardlessCWD, PathOsBasedRelative } from '../utils/path';
import { getLinkToFileContent } from './link-content';
import LinkFile from './link-file';
import { getComponentsDependenciesLinks } from './link-generator';
import Symlink from './symlink';

type LinkDetail = { from: string; to: string };
export type LinksResult = {
  id: BitId;
  bound: LinkDetail[];
};

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default class NodeModuleLinker {
  components: Component[];
  consumer: Consumer | null | undefined;
  bitMap: BitMap; // preparation for the capsule, which is going to have only BitMap with no Consumer
  dataToPersist: DataToPersist;
  constructor(components: Component[], consumer: Consumer | null | undefined, bitMap: BitMap) {
    this.components = ComponentsList.getUniqueComponents(components);
    this.consumer = consumer;
    this.bitMap = bitMap;
    this.dataToPersist = new DataToPersist();
  }
  async link(): Promise<LinksResult[]> {
    const links = await this.getLinks();
    const linksResults = this.getLinksResults();
    if (this.consumer) links.addBasePath(this.consumer.getPath());
    await links.persistAllToFS();
    await this.consumer?.componentFsCache.deleteAllDependenciesDataCache();
    return linksResults;
  }
  async getLinks(): Promise<DataToPersist> {
    this.dataToPersist = new DataToPersist();
    await this._populateShouldDependenciesSavedAsComponentsData();
    // don't use Promise.all because down the road it calls transformPackageJson of pkg aspect, which loads components
    await pMapSeries(this.components, (component) => {
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
    });

    return this.dataToPersist;
  }
  getLinksResults(): LinksResult[] {
    const linksResults: LinksResult[] = [];
    const getExistingLinkResult = (id) => linksResults.find((linkResult) => linkResult.id.isEqual(id));
    const addLinkResult = (id: BitId | null | undefined, from: string, to: string) => {
      if (!id) return;
      const existingLinkResult = getExistingLinkResult(id);
      if (existingLinkResult) {
        existingLinkResult.bound.push({ from, to });
      } else {
        linksResults.push({ id, bound: [{ from, to }] });
      }
    };
    this.dataToPersist.symlinks.forEach((symlink: Symlink) => {
      addLinkResult(symlink.componentId, symlink.src, symlink.dest);
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.dataToPersist.files.forEach((file: LinkFile) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    if (!component.isLegacy) {
      await this._populateImportedNonLegacyComponentsLinks(component);
      return;
    }
    const componentMap = component.componentMap;
    const componentId = component.id;
    // @todo: this should probably be `const bindingPrefix = component.bindingPrefix;`
    const bindingPrefix = component.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent({
      bindingPrefix,
      id: componentId,
      allowNonScope: true,
      defaultScope: this._getDefaultScope(component),
      extensions: component.extensions,
    });
    // when a user moves the component directory, use component.writtenPath to find the correct target
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const srcTarget: PathOsBasedRelative = component.writtenPath || componentMap.rootDir;
    const shouldDistsBeInsideTheComponent = this.consumer ? this.consumer.shouldDistsBeInsideTheComponent() : true;
    if (
      this.consumer &&
      !component.dists.isEmpty() &&
      component.dists.writeDistsFiles &&
      !shouldDistsBeInsideTheComponent
    ) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const distTarget = component.dists.getDistDir(this.consumer, componentMap.getRootDir());
      const packagesSymlinks = this._getSymlinkPackages(srcTarget, distTarget, component);
      this.dataToPersist.addManySymlinks(packagesSymlinks);
      const distSymlink = Symlink.makeInstance(distTarget, linkPath, componentId);
      distSymlink.forDistOutsideComponentsDir = true;
      this.dataToPersist.addSymlink(distSymlink);
    } else if (srcTarget !== '.') {
      // avoid creating symlinks from node_modules to itself
      this.dataToPersist.addSymlink(Symlink.makeInstance(srcTarget, linkPath, componentId, true));
    }
    await this._populateDependenciesAndMissingLinks(component);
  }
  async _populateNestedComponentsLinks(component: Component): Promise<void> {
    await this._populateDependenciesAndMissingLinks(component);
  }

  _getDefaultScope(component?: Component): string | undefined | null {
    if (component) {
      return component.defaultScope;
    }
    return this.consumer ? this.consumer.config.defaultScope : null;
  }

  /**
   * for Harmony version and above, instead of symlink from the component dir to node_modules,
   * create a directory on node_modules and symlink each one of the source files, this way, the
   * structure is exactly the same as Authored
   */
  async _populateImportedNonLegacyComponentsLinks(component: Component) {
    const componentId = component.id;
    const componentNodeModulesPath: PathOsBasedRelative = getNodeModulesPathOfComponent({
      bindingPrefix: component.bindingPrefix,
      id: componentId,
      allowNonScope: true,
      defaultScope: this._getDefaultScope(component),
      extensions: component.extensions,
    });
    const componentMap = component.componentMap as ComponentMap;
    const filesToBind = componentMap.getAllFilesPaths();
    filesToBind.forEach((file) => {
      const fileWithRootDir = componentMap.hasRootDir() ? path.join(componentMap.rootDir as string, file) : file;
      const dest = path.join(componentNodeModulesPath, file);

      this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, componentId, true));
    });
    this._deleteExistingLinksRootIfSymlink(componentNodeModulesPath);
    // remove this for now, it should be handled by dependency-linker.addSymlinkFromComponentDirNMToWorkspaceDirNM
    // this.addSymlinkFromComponentDirNMToWorkspaceDirNM(component, componentNodeModulesPath);
    await this._populateDependenciesAndMissingLinks(component);
  }

  /**
   * add symlink from the node_modules in the component's root-dir to the workspace node-modules
   * of the component. e.g.
   * ws-root/node_modules/comp1/node_modules -> ws-root/components/comp1/node_modules
   */
  // private addSymlinkFromComponentDirNMToWorkspaceDirNM(
  //   component: Component,
  //   componentNodeModulesPath: PathOsBasedRelative
  // ) {
  //   const componentMap = component.componentMap as ComponentMap;
  //   if (!componentMap.rootDir || !this.consumer) return;
  //   const nodeModulesInCompRoot = path.join(componentMap.rootDir, 'node_modules');
  //   if (!fs.existsSync(this.consumer.toAbsolutePath(nodeModulesInCompRoot))) return;
  //   const nodeModulesInWorkspaceRoot = path.join(componentNodeModulesPath, 'node_modules');
  //   this.dataToPersist.addSymlink(
  //     Symlink.makeInstance(nodeModulesInCompRoot, nodeModulesInWorkspaceRoot, component.id)
  //   );
  // }

  /**
   * even when an authored component has rootDir, we can't just symlink that rootDir to
   * node_modules/rootDir. it could work only when the main-file is index.js, not for other cases.
   * node expects the module inside node_modules to have either package.json with valid "main"
   * property or an index.js file. this main property can't be relative.
   */
  async _populateAuthoredComponentsLinks(component: Component): Promise<void> {
    const componentId = component.id;
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent({
      bindingPrefix: component.bindingPrefix,
      id: componentId,
      allowNonScope: true,
      defaultScope: this._getDefaultScope(component),
      extensions: component.extensions,
    });

    component.isLegacy
      ? this.symlinkFilesAuthorLegacy(component, linkPath)
      : this.symlinkDirAuthorHarmony(component, linkPath);

    this._deleteExistingLinksRootIfSymlink(linkPath);
    this._deleteOldLinksOfIdWithoutScope(component);
    await this._createPackageJsonForAuthor(component);
  }

  private symlinkFilesAuthorLegacy(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = component.componentMap as ComponentMap;
    const filesToBind = componentMap.getAllFilesPaths();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    component.dists.updateDistsPerWorkspaceConfig(component.id, this.consumer, component.componentMap);
    filesToBind.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isMain = file === componentMap.mainFile;
      const fileWithRootDir = componentMap.hasRootDir() ? path.join(componentMap.rootDir as string, file) : file;
      const possiblyDist = component.dists.calculateDistFileForAuthored(
        path.normalize(fileWithRootDir),
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.consumer,
        isMain
      );
      const dest = path.join(linkPath, file);
      const destRelative = getPathRelativeRegardlessCWD(path.dirname(dest), possiblyDist);
      const fileContent = getLinkToFileContent(destRelative);
      // if component.compiler is set, this component is working with the old compiler (< v15)
      // and not with compile extension. as such, the dists for author are in the root, not in the
      // component directory. Having symlinks here instead of links causes import of module-paths to
      // break. try e2e-test: 'as author, move individual component files to dedicated directory with bit move --component'
      if (fileContent && component.compiler) {
        const linkFile = LinkFile.load({
          filePath: dest,
          content: fileContent,
          srcPath: file,
          componentId: component.id,
          override: true,
          ignorePreviousSymlink: true, // in case the component didn't have a compiler before, this file was a symlink
        });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.dataToPersist.addFile(linkFile);
      } else {
        // it's an un-supported file, or it's Harmony version and above, create a symlink instead
        this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id, true));
      }
    });
  }

  /**
   * on Harmony, just symlink the entire source directory into "src" in node-modules.
   */
  private symlinkDirAuthorHarmony(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = component.componentMap as ComponentMap;

    const filesToBind = componentMap.getAllFilesPaths();
    filesToBind.forEach((file) => {
      const fileWithRootDir = path.join(componentMap.rootDir as string, file);
      const dest = path.join(linkPath, file);
      this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id, true));
    });

    if (IS_WINDOWS) {
      this.dataToPersist.addSymlink(
        Symlink.makeInstance(
          componentMap.rootDir as string,
          path.join(linkPath, SOURCE_DIR_SYMLINK_TO_NM),
          component.id
        )
      );
    }
  }

  /**
   * Removing existing links root (the package path) - to handle cases it was linked by package manager for example
   * this makes sure we are not affecting other places (like package manager cache) we shouldn't touch
   * If you have a case when this deletes something created by the package manager and it's not the desired behavior,
   * do not delete this code, but make sure the package manger nest the installed version into it's dependent
   * @param component
   */
  _deleteExistingLinksRootIfSymlink(linkPath: string) {
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        this.dataToPersist.removePath(new RemovePath(linkPath));
      }
      return undefined;
    } catch (err) {
      return undefined; // probably file does not exist
    }
  }

  /**
   * for AUTHORED components, when a component is new, upon build, we generate links on
   * node_modules. The path doesn't have the scope-name as it doesn't exist yet. (e.g. @bit/foo).
   * Later on, when the component is exported and has a scope-name, the path is complete.
   * (e.g. @bit/scope.foo). At this stage, this function deletes the old-partial paths.
   *
   * This is not needed in Harmony because in Harmony the node-module has already the default-scope.
   */
  _deleteOldLinksOfIdWithoutScope(component: Component) {
    if (this.consumer?.isLegacy && component.id.scope) {
      const previousDest = getNodeModulesPathOfComponent({
        bindingPrefix: component.bindingPrefix,
        id: component.id.changeScope(null),
        allowNonScope: true,
        defaultScope: this._getDefaultScope(component),
        extensions: component.extensions,
      });
      this.dataToPersist.removePath(new RemovePath(previousDest));
    }
  }
  /**
   * for IMPORTED and NESTED components
   */
  async _populateDependenciesAndMissingLinks(component: Component): Promise<void> {
    // @ts-ignore loaded from FS, componentMap must be set
    const componentMap: ComponentMap = component.componentMap;
    if (
      component.issues &&
      (component.issues.getIssue(IssuesClasses.MissingLinks) ||
        component.issues.getIssue(IssuesClasses.MissingCustomModuleResolutionLinks)) &&
      this.consumer &&
      component.componentFromModel
    ) {
      const componentWithDependencies = await component.toComponentWithDependencies(this.consumer);
      component.copyAllDependenciesFromModel();
      const componentsDependenciesLinks = getComponentsDependenciesLinks(
        [componentWithDependencies],
        this.consumer,
        false,
        this.bitMap
      );
      this.dataToPersist.addManyFiles(componentsDependenciesLinks.files);
      this.dataToPersist.addManySymlinks(componentsDependenciesLinks.symlinks);
    }
    if (component.hasDependencies()) {
      const dependenciesLinks = await this._getDependenciesLinks(component, componentMap);
      this.dataToPersist.addManySymlinks(dependenciesLinks);
    }
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
    const dirsToFilter = dependenciesSavedAsComponents ? [this.consumer.config._bindingPrefix] : [];
    const customResolvedData = component.dependencies.getCustomResolvedData();
    if (!R.isEmpty(customResolvedData)) {
      // filter out packages that are actually symlinks to dependencies
      Object.keys(customResolvedData).forEach((importSource) => dirsToFilter.push(first(importSource.split('/'))));
    }
    const dirs = dirsToFilter.length ? unfilteredDirs.filter((dir) => !dirsToFilter.includes(dir)) : unfilteredDirs;
    if (!dirs.length) return [];
    return dirs.map((dir) => {
      const fromDir = path.join(fromNodeModules, dir);
      const toDir = path.join(toNodeModules, dir);
      return Symlink.makeInstance(fromDir, toDir);
    });
  }

  async _getDependenciesLinks(component: Component, componentMap: ComponentMap): Promise<Symlink[]> {
    const getSymlinks = async (dependency: Dependency): Promise<Symlink[]> => {
      const dependencyComponentMap = this.bitMap.getComponentIfExist(dependency.id);
      const depModel = await (this.consumer?.scope.getModelComponentIfExist(dependency.id) || Promise.resolve());
      const bindingPrefix = depModel ? depModel.bindingPrefix : DEFAULT_BINDINGS_PREFIX;
      const dependenciesLinks: Symlink[] = [];
      if (!dependencyComponentMap || !dependencyComponentMap.hasRootDir()) return dependenciesLinks;
      const parentRootDir = componentMap.getRootDir();
      const dependencyRootDir = dependencyComponentMap.getRootDir();
      dependenciesLinks.push(
        this._getDependencyLink(parentRootDir, dependency.id, dependencyRootDir, bindingPrefix, component)
      );
      if (this.consumer && !this.consumer.shouldDistsBeInsideTheComponent()) {
        // when dists are written outside the component, it doesn't matter whether a component
        // has dists files or not, in case it doesn't have, the files are copied from the component
        // dir into the dist dir. (see consumer-component.write())
        const from = component.dists.getDistDirForConsumer(this.consumer, parentRootDir);
        const to = component.dists.getDistDirForConsumer(this.consumer, dependencyRootDir);
        const distSymlink = this._getDependencyLink(from, dependency.id, to, bindingPrefix, component);
        distSymlink.forDistOutsideComponentsDir = true;
        dependenciesLinks.push(distSymlink);
      }
      return dependenciesLinks;
    };
    const symlinksP = component.getAllDependencies().map((dependency: Dependency) => getSymlinks(dependency));
    const symlinks = await Promise.all(symlinksP);
    return R.flatten(symlinks);
  }

  _getDependencyLink(
    parentRootDir: PathOsBasedRelative,
    bitId: BitId,
    rootDir: PathOsBasedRelative,
    bindingPrefix: string,
    component: Component
  ): Symlink {
    const relativeDestPath = getNodeModulesPathOfComponent({
      ...component,
      id: bitId,
      allowNonScope: true,
      bindingPrefix,
      isDependency: true,
    });
    const destPathInsideParent = path.join(parentRootDir, relativeDestPath);
    return Symlink.makeInstance(rootDir, destPathInsideParent, bitId);
  }

  /**
   * create package.json on node_modules/@bit/component-name/package.json with a property 'main'
   * pointing to the component's main file.
   * It is needed for Authored components only.
   * Since an authored component doesn't have rootDir, it's impossible to symlink to the component directory.
   * It makes it easier for Author to use absolute syntax between their own components.
   */
  async _createPackageJsonForAuthor(component: Component) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const hasPackageJsonAsComponentFile = component.files.some((file) => file.relative === PACKAGE_JSON);
    if (hasPackageJsonAsComponentFile) return; // don't generate package.json on top of the user package.json
    const dest = path.join(
      getNodeModulesPathOfComponent({
        ...component,
        id: component.id,
        allowNonScope: true,
      })
    );
    const packageJson = PackageJsonFile.createFromComponent(dest, component, undefined, true, true);
    if (!this.consumer?.isLegacy) {
      await this._applyTransformers(component, packageJson);
      if (IS_WINDOWS) {
        // in the workspace, override the "types" and add the "src" prefix.
        // otherwise, the navigation and auto-complete won't work on the IDE.
        // this is for Windows only. For Linux, we use symlinks for the files.
        packageJson.addOrUpdateProperty('types', `${SOURCE_DIR_SYMLINK_TO_NM}/${component.mainFile}`);
      }
    }
    if (packageJson.packageJsonObject.version === 'latest') {
      packageJson.packageJsonObject.version = '0.0.1-new';
    }

    // packageJson.mergePropsFromExtensions(component);
    // TODO: we need to have an hook here to get the transformer from the pkg extension

    // delete the version, otherwise, we have to maintains it. such as, when tagging, it should be
    // changed to the new tagged version.
    delete packageJson.packageJsonObject.version;
    this.dataToPersist.addFile(packageJson.toVinylFile());
  }

  /**
   * links are normally generated by `bit import`, `bit link` and `bit install`.
   * for `bit import` the data about whether dependenciesSavedAsComponents is already populated
   * for the rest, it's not.
   * @todo: avoid repopulating for imported. (not easy because by default, all components get "true").
   */
  async _populateShouldDependenciesSavedAsComponentsData(): Promise<void> {
    if (!this.components.length || !this.consumer) return;
    const bitIds = this.components.map((c) => c.id);
    const shouldDependenciesSavedAsComponents = await this.consumer.shouldDependenciesSavedAsComponents(bitIds);
    this.components.forEach((component) => {
      const shouldSavedAsComponents = shouldDependenciesSavedAsComponents.find((c) => c.id.isEqual(component.id));
      if (!shouldSavedAsComponents) {
        throw new Error(
          `_populateShouldDependenciesSavedAsComponentsData, saveDependenciesAsComponents is missing for ${component.id.toString()}`
        );
      }
      component.dependenciesSavedAsComponents = shouldSavedAsComponents.saveDependenciesAsComponents;
    });
  }

  /**
   * these are changes made by aspects
   */
  async _applyTransformers(component: Component, packageJson: PackageJsonFile) {
    return PackageJsonTransformer.applyTransformers(component, packageJson);
  }
}
