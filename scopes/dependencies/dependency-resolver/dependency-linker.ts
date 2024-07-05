import isBuiltinModule from 'is-builtin-module';
import path from 'path';
import { uniq, compact, flatten, head, omit } from 'lodash';
import { Stats } from 'fs';
import fs from 'fs-extra';
import resolveFrom from 'resolve-from';
import { findCurrentBvmDir } from '@teambit/bvm.path';
import { ComponentMap, Component, ComponentID, ComponentMain } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from '@teambit/toolbox.path.path';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { BitError } from '@teambit/bit-error';
import { EnvsMain } from '@teambit/envs';
import { AspectLoaderMain, getCoreAspectName, getCoreAspectPackageName, getAspectDir } from '@teambit/aspect-loader';
import {
  MainAspectNotLinkable,
  RootDirNotDefined,
  CoreAspectLinkError,
  NonAspectCorePackageLinkError,
} from './exceptions';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

/**
 * context of the linking process.
 */
export type DepLinkerContext = {
  inCapsule?: boolean;
};

export type LinkingOptions = {
  rewire?: boolean;
  /**
   * Whether to create link to @teambit/bit in the root node modules
   */
  linkTeambitBit?: boolean;
  /**
   * Whether to create links in the root dir node modules to all core aspects
   */
  linkCoreAspects?: boolean;

  linkNestedDepsInNM?: boolean;

  /**
   * link to another project, so that project could use components from this workspace.
   * similar to npm/yarn link
   */
  linkToDir?: string;

  /**
   * Link peer dependencies of the components to the target project.
   * Peer dependencies should be singletons, so the project should use the same
   * version of the peer dependency as the linked in components.
   */
  includePeers?: boolean;

  /**
   * whether link should import objects before linking
   */
  fetchObject?: boolean;

  /**
   * Link deps which should be linked to the env
   */
  linkDepsResolvedFromEnv?: boolean;
};

const DEFAULT_LINKING_OPTIONS: LinkingOptions = {
  rewire: false,
  linkTeambitBit: true,
  linkCoreAspects: true,
  linkDepsResolvedFromEnv: true,
  linkNestedDepsInNM: true,
};

export type LinkDetail = { packageName: string; from: string; to: string };

export type CoreAspectLinkResult = {
  aspectId: string;
  linkDetail: LinkDetail;
};

export type DepsLinkedToEnvResult = {
  componentId: string;
  linksDetail: LinkDetail[];
};

export type NestedNMDepsLinksResult = {
  componentId: string;
  linksDetail: LinkDetail[];
};

export type LinkToDirResult = {
  componentId: string;
  linksDetail: LinkDetail;
};

export type LinkResults = {
  teambitBitLink?: CoreAspectLinkResult;
  coreAspectsLinks?: CoreAspectLinkResult[];
  harmonyLink?: LinkDetail;
  teambitLegacyLink?: LinkDetail;
  resolvedFromEnvLinks?: DepsLinkedToEnvResult[];
  nestedDepsInNmLinks?: NestedNMDepsLinksResult[];
  linkToDirResults?: LinkToDirResult[];
};

type NestedModuleFolderEntry = {
  moduleName: string;
  path: string;
  origPath?: string;
};

export class DependencyLinker {
  private _currentBitDir: string | null;

  constructor(
    private dependencyResolver: DependencyResolverMain,

    private aspectLoader: AspectLoaderMain,

    private componentAspect: ComponentMain,

    private envs: EnvsMain,

    private logger: Logger,

    private rootDir?: string | PathAbsolute,

    private linkingOptions?: LinkingOptions,

    private linkingContext: DepLinkerContext = {}
  ) {
    this._currentBitDir = findCurrentBvmDir();
  }

  async calculateLinkedDeps(
    rootDir: string | undefined,
    componentDirectoryMap: ComponentMap<string>,
    options: LinkingOptions = {}
  ): Promise<{ linkedRootDeps: Record<string, string>; linkResults: LinkResults }> {
    const linkResults = await this._calculateLinks(rootDir, componentDirectoryMap, options);
    const localLinks: Array<[string, string]> = [];
    if (linkResults.teambitBitLink) {
      localLinks.push(this.linkDetailToLocalDepEntry(linkResults.teambitBitLink.linkDetail));
    }
    if (linkResults.coreAspectsLinks) {
      linkResults.coreAspectsLinks.forEach((link) => {
        localLinks.push(this.linkDetailToLocalDepEntry(link.linkDetail));
      });
    }
    if (linkResults.harmonyLink) {
      localLinks.push(this.linkDetailToLocalDepEntry(linkResults.harmonyLink));
    }
    if (linkResults.teambitLegacyLink) {
      localLinks.push(this.linkDetailToLocalDepEntry(linkResults.teambitLegacyLink));
    }
    if (linkResults.resolvedFromEnvLinks) {
      linkResults.resolvedFromEnvLinks.forEach((link) => {
        link.linksDetail.forEach((linkDetail) => {
          localLinks.push(this.linkDetailToLocalDepEntry(linkDetail));
        });
      });
    }
    if (linkResults.linkToDirResults) {
      linkResults.linkToDirResults.forEach((link) => {
        localLinks.push(this.linkDetailToLocalDepEntry(link.linksDetail));
      });
    }
    return {
      linkedRootDeps: Object.fromEntries(localLinks.map(([key, value]) => [key, `link:${value}`])),
      linkResults,
    };
  }

  private linkDetailToLocalDepEntry(linkDetail: LinkDetail): [string, string] {
    return [linkDetail.packageName, linkDetail.from];
  }

  private async _calculateLinks(
    rootDir: string | undefined,
    componentDirectoryMap: ComponentMap<string>,
    options: LinkingOptions = {}
  ): Promise<LinkResults> {
    const outputMessage = this.linkingContext?.inCapsule
      ? `(capsule) linking components in root dir: ${rootDir || this.rootDir}`
      : 'linking components';
    if (!this.linkingContext?.inCapsule) {
      this.logger.setStatusLine(outputMessage);
    }
    this.logger.debug('linking components with options', omit(options, ['consumer']));
    const startTime = process.hrtime();

    let result: LinkResults = {};
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {}, options || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    if (options.linkToDir) {
      const components = componentDirectoryMap.toArray().map(([component]) => component);
      const linkToDirResults = await this.linkToDir(finalRootDir, options.linkToDir, components);
      result.linkToDirResults = linkToDirResults;
      if (options.includePeers) {
        result.linkToDirResults.push(
          ...(await this._getLinksToPeers(componentDirectoryMap, { finalRootDir, linkToDir: options.linkToDir }))
        );
      }
      return result;
    }

    // Link deps which should be linked to the env
    if (linkingOpts.linkDepsResolvedFromEnv) {
      result.resolvedFromEnvLinks = await this.linkDepsResolvedFromEnv(componentDirectoryMap);
    }
    if (linkingOpts.linkNestedDepsInNM) {
      result.nestedDepsInNmLinks = this.addSymlinkFromComponentDirNMToWorkspaceDirNM(
        finalRootDir,
        componentDirectoryMap
      );
    }

    // We remove the version since it used in order to check if it's core aspects, and the core aspects arrived from aspect loader without versions
    const componentIds: ComponentID[] = [];
    componentDirectoryMap.map((_dir, comp) => {
      componentIds.push(comp.id);
      return undefined;
    });
    result = {
      ...result,
      ...(await this.linkCoreAspectsAndLegacy(finalRootDir, componentIds, linkingOpts)),
    };
    if (!this.linkingContext?.inCapsule) {
      this.logger.consoleSuccess(outputMessage, startTime);
    }
    return result;
  }

  async _getLinksToPeers(
    componentDirectoryMap: ComponentMap<string>,
    options: {
      finalRootDir: string;
      linkToDir: string;
    }
  ): Promise<LinkToDirResult[]> {
    const peers = new Set<string>();
    await Promise.all(
      componentDirectoryMap.toArray().map(async ([component]) => {
        const depList = this.dependencyResolver.getDependencies(component);
        const peerList = depList.byLifecycle('peer');
        peerList.forEach((dependency) => {
          if (dependency.getPackageName) {
            peers.add(dependency.getPackageName());
          }
        });
      })
    );
    const fromDir = path.join(options.finalRootDir, 'node_modules');
    const toDir = path.join(options.linkToDir, 'node_modules');
    return Array.from(peers).map((packageName) => ({
      componentId: packageName,
      linksDetail: {
        packageName,
        from: path.join(fromDir, packageName),
        to: path.join(toDir, packageName),
      },
    }));
  }

  async linkCoreAspectsAndLegacy(
    rootDir: string,
    componentIds: ComponentID[] = [],
    options: Pick<LinkingOptions, 'linkTeambitBit' | 'linkCoreAspects'> = {}
  ) {
    const result: LinkResults = {};
    const componentIdsWithoutVersions: string[] = [];
    componentIds.map((id) => {
      componentIdsWithoutVersions.push(id.toString({ ignoreVersion: true }));
      return undefined;
    });
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {}, options || {});
    if (linkingOpts.linkTeambitBit && !this.isBitRepoWorkspace(rootDir)) {
      const bitLink = await this.linkBitAspectIfNotExist(
        path.join(rootDir, 'node_modules'),
        componentIdsWithoutVersions
      );
      result.teambitBitLink = bitLink;
    }

    let mainAspectPath = result.teambitBitLink?.linkDetail.from;
    if (!mainAspectPath && this.aspectLoader.mainAspect) {
      if (!this.aspectLoader.mainAspect.packageName) {
        throw new MainAspectNotLinkable();
      }
      mainAspectPath = path.join(rootDir, 'node_modules', this.aspectLoader.mainAspect.packageName);
    }
    if (linkingOpts.linkCoreAspects && !this.isBitRepoWorkspace(rootDir)) {
      const hasLocalInstallation = !linkingOpts.linkTeambitBit;
      if (mainAspectPath) {
        result.coreAspectsLinks = await this.linkNonExistingCoreAspects(componentIdsWithoutVersions, {
          targetModulesDir: path.join(rootDir, 'node_modules'),
          mainAspectPath,
          hasLocalInstallation,
        });
      } else {
        result.coreAspectsLinks = [];
      }
    }

    if (mainAspectPath) {
      result.teambitLegacyLink = this.linkNonAspectCorePackages(rootDir, 'legacy', mainAspectPath);
      result.harmonyLink = this.linkNonAspectCorePackages(rootDir, 'harmony', mainAspectPath);
    }
    return result;
  }

  private async linkToDir(rootDir: string, targetDir: string, components: Component[]): Promise<LinkToDirResult[]> {
    const results: LinkToDirResult[] = components.map((component) => {
      const componentPackageName = componentIdToPackageName(component.state._consumer);
      return {
        componentId: component.id.toString(),
        linksDetail: {
          packageName: componentPackageName,
          from: path.join(rootDir, 'node_modules', componentPackageName),
          to: path.join(targetDir, 'node_modules', componentPackageName),
        },
      };
    });
    return results;
  }

  /**
   * Add symlinks from the node_modules in the component's root-dir to the workspace node_modules
   * of the component. e.g.
   * <ws-root>/node_modules/comp1/node_modules/<dep> -> <ws-root>/components/comp1/node_modules/<dep>
   * This is needed because the component is compiled into the dist folder at <ws-root>/node_modules/comp1/dist,
   * so the files in the dist folder need to find the right dependencies of comp1.
   */
  private addSymlinkFromComponentDirNMToWorkspaceDirNM(
    rootDir: string,
    componentDirectoryMap: ComponentMap<string>
  ): NestedNMDepsLinksResult[] {
    const rootNodeModules = path.join(rootDir, 'node_modules');
    const getPackagesFoldersToLink = (dir: string, parent?: string): NestedModuleFolderEntry[] => {
      const folders = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((dirent) => {
          if (dirent.name.startsWith('.')) {
            return false;
          }
          return dirent.isDirectory() || dirent.isSymbolicLink();
        })
        .map((dirent) => {
          const dirPath = path.join(dir, dirent.name);
          const moduleName = parent ? `${parent}/${dirent.name}` : dirent.name;
          // If we have a folder with a name of built in module (like events)
          // the resolve from will resolve it from the core, so it will return something like 'events'
          // instead of the path.
          // adding a '/' at the end solve this
          const moduleNameToResolve = isBuiltinModule(moduleName) ? `${moduleName}/` : moduleName;
          // This is a scoped package, need to go inside
          if (dirent.name.startsWith('@')) {
            return getPackagesFoldersToLink(dirPath, dirent.name);
          }

          if (dirent.isSymbolicLink()) {
            const resolvedModuleFrom = resolveModuleFromDir(dir, moduleNameToResolve);
            if (!resolvedModuleFrom) {
              return {
                moduleName,
                path: dirPath,
              };
            }
            return {
              origPath: dirPath,
              moduleName,
              path: resolveModuleDirFromFile(resolvedModuleFrom, moduleName),
            };
          }
          return {
            moduleName,
            path: dirPath,
          };
        });
      return flatten(folders);
    };
    const linksOfAllComponents = componentDirectoryMap.toArray().map(([component, dir]) => {
      const compDirNM = path.join(dir, 'node_modules');
      if (!fs.existsSync(compDirNM)) return undefined;
      // TODO: support modules with scoped packages (start with @) - we need to make this logic 2 levels

      const componentPackageName = componentIdToPackageName(component.state._consumer);
      const innerNMofComponentInNM = path.join(rootNodeModules, componentPackageName);
      // If the folder itself is a symlink, do not try to symlink inside it
      if (isPathSymlink(innerNMofComponentInNM)) {
        return undefined;
      }
      const packagesFoldersToLink: NestedModuleFolderEntry[] = getPackagesFoldersToLink(compDirNM);
      fs.ensureDirSync(innerNMofComponentInNM);

      const oneComponentLinks: LinkDetail[] = packagesFoldersToLink.map((folderEntry: NestedModuleFolderEntry) => {
        const linkTarget = path.join(innerNMofComponentInNM, 'node_modules', folderEntry?.moduleName);
        const linkSrc = folderEntry.path;
        // This works as well, consider using it instead
        // const linkSrc = folderEntry.origPath || folderEntry.path;
        const origPath = folderEntry.origPath ? `(${folderEntry.origPath})` : '';
        const linkDetail: LinkDetail = {
          packageName: folderEntry.moduleName,
          from: `${linkSrc} ${origPath}`,
          to: linkTarget,
        };
        this.logger.info(
          `linking nested dependency ${folderEntry.moduleName} for component ${component}. link src: ${linkSrc} link target: ${linkTarget}`
        );
        return linkDetail;
      });

      const filteredLinks = compact(oneComponentLinks);
      return {
        componentId: component.id.toString(),
        linksDetail: filteredLinks,
      };
    });
    const filteredLinks = compact(linksOfAllComponents);
    return filteredLinks;
  }

  private async linkDepsResolvedFromEnv(
    componentDirectoryMap: ComponentMap<string>
  ): Promise<Array<DepsLinkedToEnvResult>> {
    const componentsNeedLinks: {
      component: Component;
      dir: string;
      env;
      resolvedFromEnv;
      envId?: string;
      envDir?: string;
    }[] = [];

    const componentsNeedLinksP = componentDirectoryMap.toArray().map(async ([component, dir]) => {
      const policy = await this.dependencyResolver.getPolicy(component);
      const resolvedFromEnv = policy.getResolvedFromEnv();
      // Nothing should be resolved from env, do nothing
      if (!resolvedFromEnv.length) {
        return;
      }
      const env = this.envs.getEnv(component);
      const componentNeedLink = {
        component,
        dir,
        env,
        resolvedFromEnv,
      };
      componentsNeedLinks.push(componentNeedLink);
    });

    await Promise.all(componentsNeedLinksP);
    // Stop if there are not components needs to be linked
    if (!componentsNeedLinks || !componentsNeedLinks.length) return [];
    const envsStringIds = componentsNeedLinks.map((obj) => obj.env.id);
    const uniqEnvIds = uniq(envsStringIds);
    const host = this.componentAspect.getHost();
    const resolvedEnvIds = await host.resolveMultipleComponentIds(uniqEnvIds);
    const resolvedAspects = await host.resolveAspects(undefined, resolvedEnvIds);
    const resolvedAspectsIndex = resolvedAspects.reduce((acc, curr) => {
      if (curr.getId) {
        acc[curr.getId] = curr;
      }
      return acc;
    }, {});
    const allLinksP = componentsNeedLinks.map(async (entry) => {
      const oneComponentLinksP: Array<LinkDetail | undefined> = entry.resolvedFromEnv.entries.map(async (depEntry) => {
        const linkTarget = path.join(entry.dir, 'node_modules', depEntry.dependencyId);
        const envDir = resolvedAspectsIndex[entry.env.id].aspectPath;
        const resolvedModule = resolveModuleFromDir(envDir, depEntry.dependencyId);
        if (!resolvedModule) {
          this.logger.console(`could not resolve ${depEntry.dependencyId} from env directory ${envDir}`);
          return undefined;
        }
        const linkSrc = resolveModuleDirFromFile(resolvedModule, depEntry.dependencyId);
        const linkDetail: LinkDetail = {
          packageName: depEntry.dependencyId,
          from: linkSrc,
          to: linkTarget,
        };
        this.logger.info(
          `linking dependency ${depEntry.dependencyId} from env directory ${envDir}. link src: ${linkSrc} link target: ${linkTarget}`
        );

        return linkDetail;
      });
      const oneComponentLinks = await Promise.all(oneComponentLinksP);
      const filteredLinks = compact(oneComponentLinks);
      const depsLinkedToEnvResult: DepsLinkedToEnvResult = {
        componentId: entry.component.id.toString(),
        linksDetail: filteredLinks,
      };
      return depsLinkedToEnvResult;
    });
    return Promise.all(allLinksP);
  }

  private async linkBitAspectIfNotExist(
    dir: string,
    componentIds: string[]
  ): Promise<CoreAspectLinkResult | undefined> {
    if (!this.aspectLoader.mainAspect) return undefined;
    const mainAspectId = this.aspectLoader.mainAspect.id;
    const existing = componentIds.find((id) => {
      return id === mainAspectId;
    });

    if (existing) {
      return undefined;
    }
    const linkDetail = await this.linkBit(dir);
    if (!linkDetail) return undefined;
    return {
      aspectId: mainAspectId,
      linkDetail,
    };
  }

  async linkBit(dir: string): Promise<LinkDetail | undefined> {
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }
    const target = path.join(dir, this.aspectLoader.mainAspect.packageName);
    const shouldSymlink = this.removeSymlinkTarget(target);
    if (!shouldSymlink) return undefined;
    const src =
      this._getPkgPathFromCurrentBitDir(this.aspectLoader.mainAspect.packageName) ?? this.aspectLoader.mainAspect.path;
    await fs.ensureDir(path.dirname(target));
    return { packageName: this.aspectLoader.mainAspect.packageName, from: src, to: target };
  }

  private async linkNonExistingCoreAspects(
    componentIds: string[],
    opts: {
      targetModulesDir: string;
      mainAspectPath: string;
      hasLocalInstallation?: boolean;
    }
  ): Promise<CoreAspectLinkResult[]> {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const filtered = coreAspectsIds.filter((aspectId) => {
      // Remove bit aspect
      if (aspectId === this.aspectLoader.mainAspect?.id) {
        return false;
      }
      // TODO: use the aspect id once default scope is resolved and the component dir map has the id with scope
      const name = getCoreAspectName(aspectId);
      const existing = componentIds.find((componentId) => {
        return componentId === name || componentId === aspectId;
      });
      if (existing) {
        return false;
      }
      return true;
    });

    this.logger.debug(`linkNonExistingCoreAspects: linking the following core aspects ${filtered.join()}`);

    const results = filtered.map((id) => this.linkCoreAspect(id, opts));
    return compact(results);
  }

  private isBitRepoWorkspace(dir: string) {
    // A special condition to not link core aspects in bit workspace itself
    if (this.aspectLoader.mainAspect?.path.startsWith(dir)) {
      return true;
    }
    return false;
  }

  private linkCoreAspect(
    id: string,
    {
      targetModulesDir,
      mainAspectPath,
      hasLocalInstallation,
    }: {
      targetModulesDir: string;
      mainAspectPath: string;
      hasLocalInstallation?: boolean;
    }
  ): CoreAspectLinkResult | undefined {
    const name = getCoreAspectName(id);
    const packageName = getCoreAspectPackageName(id);
    let aspectDir = path.join(mainAspectPath, 'dist', name);
    const target = path.join(targetModulesDir, packageName);
    const fromDir = this._getPkgPathFromCurrentBitDir(packageName);
    if (fromDir) {
      return { aspectId: id, linkDetail: { packageName, from: fromDir, to: target } };
    }
    const shouldSymlink = this.removeSymlinkTarget(target, hasLocalInstallation);
    if (!shouldSymlink) return undefined;
    const isAspectDirExist = fs.pathExistsSync(aspectDir);
    if (!isAspectDirExist) {
      this.logger.debug(`linkCoreAspect: aspectDir ${aspectDir} does not exist, linking it to ${target}`);
      aspectDir = getAspectDir(id);
      return { aspectId: id, linkDetail: { packageName, from: aspectDir, to: target } };
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(aspectDir);
      const aspectPath = path.resolve(path.join(module.path, '..', '..'));
      this.logger.debug(`linkCoreAspect: linking aspectPath ${aspectPath} to ${target}`);
      return { aspectId: id, linkDetail: { packageName, from: aspectPath, to: target } };
    } catch (err: any) {
      throw new CoreAspectLinkError(id, err);
    }
  }

  /**
   * returns true if it's safe to symlink it later.
   */
  private removeSymlinkTarget(targetPath: string, hasLocalInstallation = false): boolean {
    // TODO: change to fs.lstatSync(dest, {throwIfNoEntry: false});
    // TODO: this requires to upgrade node to v15.3.0 to have the throwIfNoEntry property (maybe upgrade fs-extra will work as well)
    // TODO: we don't use fs.pathExistsSync since it will return false in case the dest is a symlink which will result error on write
    let targetStat: Stats | undefined;
    try {
      targetStat = fs.lstatSync(targetPath);
      // eslint-disable-next-line no-empty
    } catch (e: any) {}
    if (targetStat && !hasLocalInstallation) {
      // Do not override links created by other means
      if (!targetStat.isSymbolicLink()) {
        this.logger.debug(`removing link target, target ${targetPath} already exist. skipping it`);
        return false;
      }
      return true;
    }
    return true;
  }

  private _getPkgPathFromCurrentBitDir(packageName: string): string | undefined {
    if (!this._currentBitDir) return undefined;
    return path.join(this._currentBitDir, 'node_modules', packageName);
  }

  private linkNonAspectCorePackages(rootDir: string, name: string, mainAspectPath: string): LinkDetail | undefined {
    const distDir = path.join(mainAspectPath, 'dist', name);

    const packageName = `@teambit/${name}`;
    const target = path.join(rootDir, 'node_modules', packageName);
    const fromDir = this._getPkgPathFromCurrentBitDir(packageName);
    if (fromDir) {
      return { packageName, from: fromDir, to: target };
    }
    const isDistDirExist = fs.pathExistsSync(distDir);
    if (!isDistDirExist) {
      const newDir = getDistDirForDevEnv(packageName);
      return { packageName, from: newDir, to: target };
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(distDir);
      const resolvedPath = path.resolve(path.join(module.path, '..', '..'));
      return { packageName, from: resolvedPath, to: target };
    } catch (err: any) {
      throw new NonAspectCorePackageLinkError(err, packageName);
    }
  }
}

/**
 * When running dev env (bd) we need to get the harmony/legacy folder from the node_modules of the clone
 */
function getDistDirForDevEnv(packageName: string): string {
  let moduleDirectory = require.resolve(packageName);
  let dirPath;
  if (moduleDirectory.includes(packageName)) {
    dirPath = path.join(moduleDirectory, '../..'); // to remove the "index.js" at the end
  } else {
    // This is usually required for the @teambit/legacy, as we re inside the nm so we can't find it in the other way
    const nmDir = __dirname.substring(0, __dirname.indexOf('@teambit'));
    dirPath = path.join(nmDir, packageName);
    moduleDirectory = require.resolve(packageName, { paths: [nmDir] });
  }
  if (!fs.existsSync(dirPath)) {
    throw new BitError(`unable to find ${packageName} in ${dirPath}`);
  }

  return dirPath;
}

// TODO: extract to new component
function resolveModuleFromDir(fromDir: string, moduleId: string, silent = true): string | undefined {
  if (silent) {
    return resolveFrom.silent(fromDir, moduleId);
  }
  return resolveFrom(fromDir, moduleId);
}

// TODO: extract to new component
function resolveModuleDirFromFile(resolvedModulePath: string, moduleId: string): string {
  const NM = 'node_modules';
  if (resolvedModulePath.includes(NM)) {
    return path.join(resolvedModulePath.slice(0, resolvedModulePath.lastIndexOf(NM) + NM.length), moduleId);
  }

  const [start, end] = resolvedModulePath.split('@');
  if (!end) return path.basename(resolvedModulePath);
  const versionStr = head(end.split('/'));
  return `${start}@${versionStr}`;
}

function isPathSymlink(folderPath: string): boolean | undefined {
  // TODO: change to fs.lstatSync(dest, {throwIfNoEntry: false}); once upgrade fs-extra
  try {
    const stat = fs.lstatSync(folderPath);
    return stat.isSymbolicLink();
  } catch (e: any) {
    return undefined;
  }
}
