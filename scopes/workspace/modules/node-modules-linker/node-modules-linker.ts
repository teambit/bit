import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import { linkPkgsToBitRoots } from '@teambit/bit-roots';
import { ComponentID } from '@teambit/component-id';
import { IS_WINDOWS, PACKAGE_JSON, SOURCE_DIR_SYMLINK_TO_NM } from '@teambit/legacy/dist/constants';
import BitMap from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import getNodeModulesPathOfComponent from '@teambit/legacy/dist/utils/bit/component-node-modules-path';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { changeCodeFromRelativeToModulePaths } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import Symlink from '@teambit/legacy/dist/links/symlink';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { Workspace } from '@teambit/workspace';
import { snapToSemver } from '@teambit/component-package-version';
import { Component } from '@teambit/component';
import { PackageJsonTransformer } from './package-json-transformer';

type LinkDetail = { from: string; to: string };
export type NodeModulesLinksResult = {
  id: ComponentID;
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
    this.components = this.components.filter((component) => this.bitMap.getComponentIfExist(component.id));
    const links = await this.getLinks();
    const linksResults = this.getLinksResults();
    const workspacePath = this.workspace.path;
    links.addBasePath(workspacePath);
    await links.persistAllToFS();
    await this.consumer?.componentFsCache.deleteAllDependenciesDataCache();
    await linkPkgsToBitRoots(
      workspacePath,
      this.components.map((comp) => componentIdToPackageName(comp.state._consumer))
    );
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
    const getExistingLinkResult = (id: ComponentID) => linksResults.find((linkResult) => linkResult.id.isEqual(id));
    const addLinkResult = (id: ComponentID | null | undefined, from: string, to: string) => {
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
      const existingLinkResult = getExistingLinkResult(component.id);
      if (!existingLinkResult) {
        linksResults.push({ id: component.id, bound: [] });
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
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent(legacyComponent);

    this.symlinkComponentDir(component, linkPath);
    this._deleteExistingLinksRootIfSymlink(linkPath);
    await this.createPackageJson(component);
  }

  private symlinkComponentDir(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = this.bitMap.getComponent(component.id);

    const filesToBind = componentMap.getAllFilesPaths();
    filesToBind.forEach((file) => {
      const fileWithRootDir = path.join(componentMap.rootDir as string, file);
      const dest = path.join(linkPath, file);
      this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id, true));
    });

    if (IS_WINDOWS) {
      // symlink the entire source directory into "_src" in node-modules.
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
    } catch (err: any) {
      return undefined; // probably file does not exist
    }
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
      })
    );
    const packageJson = PackageJsonFile.createFromComponent(dest, legacyComp, true);
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

    // indicate that this component exists locally and it is symlinked into the workspace. not a normal package.
    packageJson.packageJsonObject._bit_local = true;
    packageJson.packageJsonObject.source = component.mainFile.relative;

    // This is a hack because we have in the workspace package.json types:index.ts
    // but also exports for core aspects
    // TS can't find the types
    // in order to solve it we copy the types to exports.types
    // this will be applied only to aspects to minimize how it affects users
    const envsData = component.state.aspects.get('teambit.envs/envs');
    const isAspect = envsData?.data.type === 'aspect';
    if (isAspect && packageJson.packageJsonObject.types && packageJson.packageJsonObject.exports) {
      const exports = packageJson.packageJsonObject.exports['.']
        ? packageJson.packageJsonObject.exports['.']
        : packageJson.packageJsonObject.exports;
      if (!exports.types) {
        const defaultModule = exports.default;
        if (defaultModule) delete exports.default;
        exports.types = `./${packageJson.packageJsonObject.types}`;
        exports.default = defaultModule;
      }
    }

    // packageJson.mergePropsFromExtensions(component);
    // TODO: we need to have an hook here to get the transformer from the pkg extension

    // don't delete the "version" prop, because in some scenarios, it's needed for the component to work properly.
    // an example is when developing a vscode extension, vscode expects to have a valid package.json during the development.

    this.dataToPersist.addFile(packageJson.toVinylFile());
    const injectedDirs = await this.workspace.getInjectedDirs(component);
    const src = path.join(dest, 'package.json');
    for (const injectedDir of injectedDirs) {
      this.dataToPersist.addSymlink(Symlink.makeInstance(src, path.join(injectedDir, 'package.json')));
    }
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
  bitIds: ComponentID[],
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
  bitIds: ComponentID[],
  loadFromScope = false
): Promise<NodeModulesLinksResult[]> {
  const componentsIds = await workspace.resolveMultipleComponentIds(bitIds);
  if (!componentsIds.length) return [];
  const getComponents = async () => {
    if (loadFromScope) {
      return workspace.scope.getMany(componentsIds);
    }
    return workspace.getMany(componentsIds, { idsToNotLoadAsAspects: bitIds.map((id) => id.toString()) });
  };
  const components = await getComponents();
  const nodeModuleLinker = new NodeModuleLinker(components, workspace);
  return nodeModuleLinker.link();
}

export async function linkToNodeModulesByComponents(components: Component[], workspace: Workspace) {
  const nodeModuleLinker = new NodeModuleLinker(components, workspace);
  return nodeModuleLinker.link();
}

export async function removeLinksFromNodeModules(
  component: Component,
  workspace: Workspace,
  files: PathOsBasedAbsolute[]
) {
  const absoluteCompDir = workspace.componentDir(component.id); // os format
  const relativeFilesInsideCompDir = files.map((file) => path.relative(absoluteCompDir, file));
  const pkgDir = await workspace.getComponentPackagePath(component);
  const pathsToRemove = relativeFilesInsideCompDir.map((file) => path.join(pkgDir, file));
  logger.debug(`removeLinksFromNodeModules, deleting the following files:
${pathsToRemove.join('\n')}`);
  await Promise.all(pathsToRemove.map((file) => fs.remove(file)));
}
