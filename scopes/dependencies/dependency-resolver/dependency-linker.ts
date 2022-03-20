import path from 'path';
import { uniq, compact, flatten, head } from 'lodash';
import { Stats } from 'fs';
import fs from 'fs-extra';
import resolveFrom from 'resolve-from';
import { link as legacyLink } from '@teambit/legacy/dist/api/consumer/lib/link';
import { ComponentMap, Component, ComponentMain } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from '@teambit/legacy/dist/utils/path';
import { BitError } from '@teambit/bit-error';
import { createSymlinkOrCopy } from '@teambit/legacy/dist/utils';
import { LinksResult as LegacyLinksResult } from '@teambit/legacy/dist/links/node-modules-linker';
import { CodemodResult } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import Symlink from '@teambit/legacy/dist/links/symlink';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { EnvsMain } from '@teambit/envs';
import { AspectLoaderMain, getCoreAspectName, getCoreAspectPackageName, getAspectDir } from '@teambit/aspect-loader';
import {
  MainAspectNotLinkable,
  RootDirNotDefined,
  CoreAspectLinkError,
  NonAspectCorePackageLinkError,
} from './exceptions';
import { WorkspacePolicy } from './policy';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

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
   * whether link should import objects before linking
   */
  fetchObject?: boolean;

  /**
   * make sure to provide the consumer
   */
  legacyLink?: boolean;

  /**
   * consumer is required for the legacyLink
   */
  consumer?: Consumer;
};

const DEFAULT_LINKING_OPTIONS: LinkingOptions = {
  legacyLink: true,
  rewire: false,
  linkTeambitBit: true,
  linkCoreAspects: true,
  linkNestedDepsInNM: true,
};

export type LinkDetail = { from: string; to: string };

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
  legacyLinkResults?: LegacyLinksResult[];
  legacyLinkCodemodResults?: CodemodResult[];
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
  constructor(
    private dependencyResolver: DependencyResolverMain,

    private aspectLoader: AspectLoaderMain,

    private componentAspect: ComponentMain,

    private envs: EnvsMain,

    private logger: Logger,

    private rootDir?: string | PathAbsolute,

    private linkingOptions?: LinkingOptions
  ) {}

  async link(
    rootDir: string | undefined,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: LinkingOptions = {}
  ): Promise<LinkResults> {
    this.logger.setStatusLine('linking components');
    this.logger.debug('linking components with options', options);
    const result: LinkResults = {};
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {}, options || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    if (options.linkToDir) {
      const components = componentDirectoryMap.toArray().map(([component]) => component);
      const linkToDirResults = await this.linkToDir(finalRootDir, options.linkToDir, components);
      result.linkToDirResults = linkToDirResults;
      return result;
    }
    if (linkingOpts.legacyLink) {
      const bitIds = componentDirectoryMap.toArray().map(([component]) => component.id._legacy);
      if (!linkingOpts.consumer) throw new Error(`the consumer is needed to legacy-link`);
      const legacyResults = await legacyLink(linkingOpts.consumer, bitIds, linkingOpts.rewire ?? false);
      result.legacyLinkResults = legacyResults.linksResults;
      result.legacyLinkCodemodResults = legacyResults.codemodResults;
    }

    // Link deps which should be linked to the env
    result.resolvedFromEnvLinks = await this.linkDepsResolvedFromEnv(componentDirectoryMap);
    if (linkingOpts.linkNestedDepsInNM) {
      result.nestedDepsInNmLinks = await this.addSymlinkFromComponentDirNMToWorkspaceDirNM(
        finalRootDir,
        componentDirectoryMap
      );
    }

    // We remove the version since it used in order to check if it's core aspects, and the core aspects arrived from aspect loader without versions
    const componentIdsWithoutVersions: string[] = [];
    componentDirectoryMap.map((_dir, comp) => {
      componentIdsWithoutVersions.push(comp.id.toString({ ignoreVersion: true }));
      return undefined;
    });
    if (linkingOpts.linkTeambitBit && !this.isBitRepoWorkspace(finalRootDir)) {
      const bitLink = await this.linkBitAspectIfNotExist(
        path.join(finalRootDir, 'node_modules'),
        componentIdsWithoutVersions
      );
      result.teambitBitLink = bitLink;
    }

    if (linkingOpts.linkCoreAspects && !this.isBitRepoWorkspace(finalRootDir)) {
      const hasLocalInstallation = !linkingOpts.linkTeambitBit;
      const coreAspectsLinks = await this.linkNonExistingCoreAspects(
        path.join(finalRootDir, 'node_modules'),
        componentIdsWithoutVersions,
        hasLocalInstallation
      );
      result.coreAspectsLinks = coreAspectsLinks;
    }

    const teambitLegacyLink = this.linkTeambitLegacy(componentDirectoryMap, finalRootDir);
    result.teambitLegacyLink = teambitLegacyLink;
    const harmonyLink = this.linkHarmony(componentDirectoryMap, finalRootDir);
    result.harmonyLink = harmonyLink;
    this.logger.consoleSuccess('linking components');
    return result;
  }

  private async linkToDir(rootDir: string, targetDir: string, components: Component[]): Promise<LinkToDirResult[]> {
    const results: LinkToDirResult[] = components.map((component) => {
      const componentPackageName = componentIdToPackageName(component.state._consumer);
      return {
        componentId: component.id.toString(),
        linksDetail: {
          from: path.join(rootDir, 'node_modules', componentPackageName),
          to: path.join(targetDir, 'node_modules', componentPackageName),
        },
      };
    });
    results.forEach(({ componentId, linksDetail }) => {
      createSymlinkOrCopy(linksDetail.from, linksDetail.to, componentId);
    });

    return results;
  }

  /**
   * add symlink from the node_modules in the component's root-dir to the workspace node-modules
   * of the component. e.g.
   * ws-root/node_modules/comp1/node_modules -> ws-root/components/comp1/node_modules
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
          // This is a scoped package, need to go inside
          if (dirent.name.startsWith('@')) {
            return getPackagesFoldersToLink(dirPath, dirent.name);
          }

          if (dirent.isSymbolicLink()) {
            const resolvedModuleFrom = resolveModuleFromDir(dir, moduleName);
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
          from: `${linkSrc} ${origPath}`,
          to: linkTarget,
        };
        const linkTargetParent = path.resolve(linkTarget, '..');
        const relativeSrc = path.relative(linkTargetParent, linkSrc);
        const symlink = new Symlink(relativeSrc, linkTarget, component.id._legacy, false);
        this.logger.info(
          `linking nested dependency ${folderEntry.moduleName} for component ${component}. link src: ${linkSrc} link target: ${linkTarget}`
        );
        symlink.write();
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
          from: linkSrc,
          to: linkTarget,
        };
        fs.removeSync(linkTarget);
        this.logger.info(
          `linking dependency ${depEntry.dependencyId} from env directory ${envDir}. link src: ${linkSrc} link target: ${linkTarget}`
        );

        createSymlinkOrCopy(linkSrc, linkTarget);
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
    const src = this.aspectLoader.mainAspect.path;
    await fs.ensureDir(path.dirname(target));
    createSymlinkOrCopy(src, target);
    return { from: src, to: target };
  }

  async linkCoreAspects(dir: string): Promise<Array<CoreAspectLinkResult | undefined>> {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsIdsWithoutMain = coreAspectsIds.filter((id) => id !== this.aspectLoader.mainAspect.id);
    return coreAspectsIdsWithoutMain.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id));
    });
  }

  private async linkNonExistingCoreAspects(
    dir: string,
    componentIds: string[],
    hasLocalInstallation = false
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

    const results = filtered.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id), hasLocalInstallation);
    });
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
    dir: string,
    id: string,
    name: string,
    packageName: string,
    hasLocalInstallation = false
  ): CoreAspectLinkResult | undefined {
    if (!this.aspectLoader.mainAspect) return undefined;
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }

    const mainAspectPath = path.join(dir, this.aspectLoader.mainAspect.packageName);
    let aspectDir = path.join(mainAspectPath, 'dist', name);
    const target = path.join(dir, packageName);
    const shouldSymlink = this.removeSymlinkTarget(target, hasLocalInstallation);
    if (!shouldSymlink) return undefined;
    const isAspectDirExist = fs.pathExistsSync(aspectDir);
    if (!isAspectDirExist) {
      this.logger.debug(`linkCoreAspect: aspectDir ${aspectDir} does not exist, linking it to ${target}`);
      aspectDir = getAspectDir(id);
      createSymlinkOrCopy(aspectDir, target);
      return { aspectId: id, linkDetail: { from: aspectDir, to: target } };
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(aspectDir);
      const aspectPath = path.resolve(path.join(module.path, '..', '..'));
      // in this case we want the symlinks to be relative links
      // Using the fs module to make sure it is relative to the target
      if (fs.existsSync(target)) {
        this.logger.debug(`linkCoreAspect: aspectPath ${aspectPath} skip linking`);
        return undefined;
      }
      this.logger.debug(`linkCoreAspect: linking aspectPath ${aspectPath} to ${target}`);
      createSymlinkOrCopy(aspectPath, target);
      return { aspectId: id, linkDetail: { from: aspectPath, to: target } };
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
      // it's a symlink, remove is as it might point to an older version
      fs.removeSync(targetPath);
      return true;
    }
    return true;
  }

  private linkNonAspectCorePackages(
    rootDir: string,
    name: string,
    packageName = `@teambit/${name}`,
    skipExisting = false
  ): LinkDetail | undefined {
    if (!this.aspectLoader.mainAspect) return undefined;
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }
    const mainAspectPath = path.join(rootDir, this.aspectLoader.mainAspect.packageName);
    const distDir = path.join(mainAspectPath, 'dist', name);

    const target = path.join(rootDir, 'node_modules', packageName);
    const isTargetExisting = fs.pathExistsSync(target);
    if (skipExisting && isTargetExisting) {
      return undefined;
    }
    const shouldSymlink = this.removeSymlinkTarget(target);
    if (!shouldSymlink) return undefined;
    const isDistDirExist = fs.pathExistsSync(distDir);
    if (!isDistDirExist) {
      const newDir = getDistDirForDevEnv(packageName);
      createSymlinkOrCopy(newDir, target);
      return { from: newDir, to: target };
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(distDir);
      const resolvedPath = path.resolve(path.join(module.path, '..', '..'));
      // in this case we want the symlinks to be relative links
      // Using the fs module to make sure it is relative to the target
      if (fs.existsSync(target)) {
        return undefined;
      }
      createSymlinkOrCopy(resolvedPath, target);
      return { from: resolvedPath, to: target };
    } catch (err: any) {
      throw new NonAspectCorePackageLinkError(err, packageName);
    }
  }

  private linkHarmony(dirMap: ComponentMap<string>, rootDir: string): LinkDetail | undefined {
    const name = 'harmony';
    return this.linkNonAspectCorePackages(rootDir, name);
  }

  private linkTeambitLegacy(dirMap: ComponentMap<string>, rootDir: string): LinkDetail | undefined {
    const name = 'legacy';
    return this.linkNonAspectCorePackages(rootDir, name);
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
