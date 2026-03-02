import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import { linkPkgsToRootComponents } from '@teambit/workspace.root-components';
import type { ComponentID } from '@teambit/component-id';
import { IS_WINDOWS, PACKAGE_JSON, SOURCE_DIR_SYMLINK_TO_NM } from '@teambit/legacy.constants';
import type { BitMap } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { PackageJsonFile, DataToPersist, RemovePath, Symlink } from '@teambit/component.sources';
import type { Consumer } from '@teambit/legacy.consumer';
import { logger } from '@teambit/legacy.logger';
import type { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/toolbox.path.path';
import { componentIdToPackageName, getNodeModulesPathOfComponent } from '@teambit/pkg.modules.component-package-name';
import type { Workspace } from '@teambit/workspace';
import { snapToSemver } from '@teambit/component-package-version';
import type { Component } from '@teambit/component';
import { PackageJsonTransformer } from './package-json-transformer';
import { changeCodeFromRelativeToModulePaths } from './codemod-components';

type LinkDetail = { from: string; to: string; existsBefore: boolean };
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
  existingLinks: NodeModulesLinksResult[];
  packageJsonCreated: boolean;

  constructor(
    private components: Component[],
    private workspace: Workspace
  ) {
    this.consumer = this.workspace.consumer;
    this.bitMap = this.consumer.bitMap;
    this.dataToPersist = new DataToPersist();
    this.existingLinks = [];
    this.packageJsonCreated = false;
  }
  async link(): Promise<NodeModulesLinksResult[]> {
    this.components = this.components.filter((component) => this.bitMap.getComponentIfExist(component.id));
    const links = await this.getLinks();

    const linksResults = this.getLinksResults();
    if (!linksResults.length) {
      // avoid clearing the cache if it ends up with no links. (e.g. happens when mistakenly generating links for a
      // component not in the workspace)
      // or when all links are already exist.
      return [];
    }
    const workspacePath = this.workspace.path;
    links.addBasePath(workspacePath);
    await links.persistAllToFS();
    // Only clear cache if new package.json of components were created
    if (this.packageJsonCreated) {
      await Promise.all(
        this.components.map((component) =>
          this.consumer?.componentFsCache.deleteDependenciesDataCache(component.id.toString())
        )
      );
      // if this cache is not cleared, then when asking workspace.get again to the same component, it returns it with
      // component-issues like "MissingLinksFromNodeModulesToSrc" incorrectly.
      this.workspace.clearAllComponentsCache();
    }

    await linkPkgsToRootComponents(
      {
        rootComponentsPath: this.workspace.rootComponentsPath,
        workspacePath,
      },
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
  private addLinkResult(
    linksResults: NodeModulesLinksResult[],
    id: ComponentID | null | undefined,
    from: string,
    to: string,
    existsBefore: boolean
  ) {
    if (!id) return;
    const existingLinkResult = linksResults.find((linkResult) => linkResult.id.isEqual(id));
    if (existingLinkResult) {
      existingLinkResult.bound.push({ from, to, existsBefore });
    } else {
      linksResults.push({ id, bound: [{ from, to, existsBefore }] });
    }
  }

  getLinksResults(): NodeModulesLinksResult[] {
    const linksResults: NodeModulesLinksResult[] = [];
    this.dataToPersist.symlinks.forEach((symlink: Symlink) => {
      this.addLinkResult(linksResults, symlink.componentId, symlink.src, symlink.dest, false);
    });
    this.existingLinks.forEach((link: NodeModulesLinksResult) => {
      const componentId = link.id;
      link.bound.forEach((bound) => {
        this.addLinkResult(linksResults, componentId, bound.from, bound.to, true);
      });
    });
    this.components.forEach((component) => {
      const existingLinkResult = linksResults.find((linkResult) => linkResult.id.isEqual(component.id));
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

    await this.symlinkComponentDir(component, linkPath);
    this._deleteExistingLinksRootIfSymlink(linkPath);
    await this.createPackageJson(component);
  }

  private async symlinkComponentDir(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = this.bitMap.getComponent(component.id);

    const filesToBind = componentMap.getAllFilesPaths();
    await Promise.all(
      filesToBind.map(async (file) => {
        const fileWithRootDir = path.join(componentMap.rootDir as string, file);
        const dest = path.join(linkPath, file);
        let stat;
        try {
          stat = await fs.lstat(dest);
        } catch {
          // Ignore this error, it's probably because the file doesn't exist
        }
        if (stat && stat.isSymbolicLink()) {
          this.addLinkResult(this.existingLinks, component.id, fileWithRootDir, dest, true);
        } else {
          this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id, true));
        }
      })
    );

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
    } catch {
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
    const packageJsonPath = path.join(dest, 'package.json');
    const packageJsonExist = await fs.pathExists(packageJsonPath);
    if (!packageJsonExist) {
      this.packageJsonCreated = true;
    }

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

    if (!this.packageJsonCreated && packageJsonExist) {
      try {
        const existingPkgJson = await fs.readJson(packageJsonPath);
        const newPkgJsonStr = JSON.stringify(packageJson.packageJsonObject);
        const existingPkgJsonStr = JSON.stringify(existingPkgJson);
        if (newPkgJsonStr !== existingPkgJsonStr) {
          this.packageJsonCreated = true;
        }
      } catch {
        // if we can't read the existing package.json, treat it as changed
        this.packageJsonCreated = true;
      }
    }

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
    codemodResults = await changeCodeFromRelativeToModulePaths(workspace, bitIds);
  }
  const linksResults = await linkToNodeModulesByIds(workspace, bitIds);
  return { linksResults, codemodResults };
}

export async function linkToNodeModulesByIds(
  workspace: Workspace,
  componentsIds: ComponentID[],
  loadFromScope = false
): Promise<NodeModulesLinksResult[]> {
  if (!componentsIds.length) return [];
  const getComponents = async () => {
    if (loadFromScope) {
      return workspace.scope.getMany(componentsIds);
    }
    return workspace.getMany(componentsIds, {
      idsToNotLoadAsAspects: componentsIds.map((id) => id.toString()),
      loadSeedersAsAspects: false,
      loadExtensions: false,
    });
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
