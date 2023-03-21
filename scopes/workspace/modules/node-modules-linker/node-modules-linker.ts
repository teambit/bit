import fs from 'fs-extra';
import glob from 'glob';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import { linkPkgsToBitRoots } from '@teambit/bit-roots';
import { BitId } from '@teambit/legacy-bit-id';
import { IS_WINDOWS, PACKAGE_JSON, SOURCE_DIR_SYMLINK_TO_NM } from '@teambit/legacy/dist/constants';
import BitMap from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import getNodeModulesPathOfComponent from '@teambit/legacy/dist/utils/bit/component-node-modules-path';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { changeCodeFromRelativeToModulePaths } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import Symlink from '@teambit/legacy/dist/links/symlink';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { Workspace } from '@teambit/workspace';
import { snapToSemver } from '@teambit/component-package-version';
import { Component } from '@teambit/component';
import { PackageJsonTransformer } from './package-json-transformer';

type LinkDetail = { from: string; to: string };
export type NodeModulesLinksResult = {
  id: BitId;
  bound: LinkDetail[];
};

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default class NodeModuleLinker {
  consumer: Consumer;
  bitMap: BitMap; // preparation for the capsule, which is going to have only BitMap with no Consumer
  dataToPersist: DataToPersist;
  constructor(private components: Component[], private workspace: Workspace) {
    this.consumer = this.workspace.consumer;
    this.bitMap = this.consumer.bitMap;
    this.dataToPersist = new DataToPersist();
  }
  async link(): Promise<NodeModulesLinksResult[]> {
    this.components = this.components.filter((component) => this.bitMap.getComponentIfExist(component.id._legacy));
    const links = await this.getLinks();
    const linksResults = this.getLinksResults();
    const workspacePath = this.consumer ? this.consumer.getPath() : undefined;
    if (workspacePath) links.addBasePath(workspacePath);
    await links.persistAllToFS();
    await this.consumer?.componentFsCache.deleteAllDependenciesDataCache();
    if (workspacePath) {
      await linkPkgsToBitRoots(
        workspacePath,
        this.components.map((comp) => componentIdToPackageName(comp.state._consumer))
      );
    }
    return linksResults;
  }
  async getLinks(): Promise<DataToPersist> {
    this.dataToPersist = new DataToPersist();
    await pMapSeries(this.components, async (component) => {
      const componentId = component.id.toString();
      logger.debug(`linking component to node_modules: ${componentId}`);
      await this._populateComponentsLinks(component);
    });

    return this.dataToPersist;
  }
  getLinksResults(): NodeModulesLinksResult[] {
    const linksResults: NodeModulesLinksResult[] = [];
    const getExistingLinkResult = (id: BitId) => linksResults.find((linkResult) => linkResult.id.isEqual(id));
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
    this.components.forEach((component) => {
      const existingLinkResult = getExistingLinkResult(component.id._legacy);
      if (!existingLinkResult) {
        linksResults.push({ id: component.id._legacy, bound: [] });
      }
    });
    return linksResults;
  }

  _getDefaultScope(component?: ConsumerComponent): string | undefined | null {
    if (component) {
      return component.defaultScope;
    }
    return this.consumer ? this.consumer.config.defaultScope : null;
  }

  /**
   * even when an authored component has rootDir, we can't just symlink that rootDir to
   * node_modules/rootDir. it could work only when the main-file is index.js, not for other cases.
   * node expects the module inside node_modules to have either package.json with valid "main"
   * property or an index.js file. this main property can't be relative.
   */
  async _populateComponentsLinks(component: Component): Promise<void> {
    const legacyComponent = component.state._consumer as ConsumerComponent;
    const componentId = component.id._legacy;
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent({
      bindingPrefix: legacyComponent.bindingPrefix,
      id: componentId,
      allowNonScope: true,
      defaultScope: this._getDefaultScope(legacyComponent),
      extensions: legacyComponent.extensions,
    });

    this.symlinkComponentDir(component, linkPath);
    this._deleteExistingLinksRootIfSymlink(linkPath);
    await this.createPackageJson(component);
  }

  /**
   * symlink the entire source directory into "src" in node-modules.
   */
  private symlinkComponentDir(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = this.bitMap.getComponent(component.id._legacy);

    const filesToBind = componentMap.getAllFilesPaths();
    filesToBind.forEach((file) => {
      const fileWithRootDir = path.join(componentMap.rootDir as string, file);
      const dest = path.join(linkPath, file);
      this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id._legacy, true));
    });

    if (IS_WINDOWS) {
      this.dataToPersist.addSymlink(
        Symlink.makeInstance(
          componentMap.rootDir as string,
          path.join(linkPath, SOURCE_DIR_SYMLINK_TO_NM),
          component.id._legacy
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
    } catch (err: any) {
      return undefined; // probably file does not exist
    }
  }

  /**
   * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
   * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
   */
  _getSymlinkPackages(from: string, to: string, component: ConsumerComponent): Symlink[] {
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
      Object.keys(customResolvedData).forEach((importSource) => dirsToFilter.push(importSource.split('/')[0]));
    }
    const dirs = dirsToFilter.length ? unfilteredDirs.filter((dir) => !dirsToFilter.includes(dir)) : unfilteredDirs;
    if (!dirs.length) return [];
    return dirs.map((dir) => {
      const fromDir = path.join(fromNodeModules, dir);
      const toDir = path.join(toNodeModules, dir);
      return Symlink.makeInstance(fromDir, toDir);
    });
  }

  _getDependencyLink(
    parentRootDir: PathOsBasedRelative,
    bitId: BitId,
    rootDir: PathOsBasedRelative,
    bindingPrefix: string,
    component: ConsumerComponent
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
  private async createPackageJson(component: Component) {
    const legacyComp = component.state._consumer as ConsumerComponent;
    const hasPackageJsonAsComponentFile = legacyComp.files.some((file) => file.relative === PACKAGE_JSON);
    if (hasPackageJsonAsComponentFile) return; // don't generate package.json on top of the user package.json
    const dest = path.join(
      getNodeModulesPathOfComponent({
        ...legacyComp,
        id: legacyComp.id,
        allowNonScope: true,
      })
    );
    const packageJson = PackageJsonFile.createFromComponent(dest, legacyComp, true, true);
    await this._applyTransformers(component, packageJson);
    if (IS_WINDOWS) {
      // in the workspace, override the "types" and add the "src" prefix.
      // otherwise, the navigation and auto-complete won't work on the IDE.
      // this is for Windows only. For Linux, we use symlinks for the files.
      packageJson.addOrUpdateProperty('types', `${SOURCE_DIR_SYMLINK_TO_NM}/${legacyComp.mainFile}`);
    }
    if (packageJson.packageJsonObject.version === 'latest') {
      packageJson.packageJsonObject.version = '0.0.1-new';
    } else {
      packageJson.packageJsonObject.version = snapToSemver(packageJson.packageJsonObject.version);
    }
    // packageJson.mergePropsFromExtensions(component);
    // TODO: we need to have an hook here to get the transformer from the pkg extension

    // don't delete the "version" prop, because in some scenarios, it's needed for the component to work properly.
    // an example is when developing a vscode extension, vscode expects to have a valid package.json during the development.

    this.dataToPersist.addFile(packageJson.toVinylFile());
  }

  /**
   * these are changes made by aspects
   */
  async _applyTransformers(component: Component, packageJson: PackageJsonFile) {
    return PackageJsonTransformer.applyTransformers(component, packageJson);
  }
}

export async function linkToNodeModulesWithCodemod(
  workspace: Workspace,
  bitIds: BitId[],
  changeRelativeToModulePaths: boolean
) {
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(workspace.consumer, bitIds);
  }
  const linksResults = await linkToNodeModulesByIds(workspace, bitIds);
  return { linksResults, codemodResults };
}

export async function linkToNodeModulesByIds(
  workspace: Workspace,
  bitIds: BitId[],
  loadFromScope = false
): Promise<NodeModulesLinksResult[]> {
  const componentsIds = await workspace.resolveMultipleComponentIds(bitIds);
  if (!componentsIds.length) return [];
  const getComponents = async () => {
    if (loadFromScope) {
      return workspace.scope.getMany(componentsIds);
    }
    return workspace.getMany(componentsIds);
  };
  const components = await getComponents();
  const nodeModuleLinker = new NodeModuleLinker(components, workspace);
  return nodeModuleLinker.link();
}

export async function linkToNodeModulesByComponents(components: Component[], workspace: Workspace) {
  const nodeModuleLinker = new NodeModuleLinker(components, workspace);
  return nodeModuleLinker.link();
}
