import path from 'path';
import { uniq, compact } from 'lodash';
import fs from 'fs-extra';
import resolveFrom from 'resolve-from';
import { link as legacyLink } from 'bit-bin/dist/api/consumer';
import { ComponentMap, Component, ComponentMain } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { BitError } from 'bit-bin/dist/error/bit-error';
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinksResult as LegacyLinksResult } from 'bit-bin/dist/links/node-modules-linker';
import { CodemodResult } from 'bit-bin/dist/consumer/component-ops/codemod-components';
import { EnvsMain } from '@teambit/envs';
import { AspectLoaderMain, getCoreAspectName, getCoreAspectPackageName, getAspectDir } from '@teambit/aspect-loader';
import { MainAspectNotLinkable, RootDirNotDefined, CoreAspectLinkError, HarmonyLinkError } from './exceptions';
import { WorkspacePolicy } from './policy';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

export type LinkingOptions = {
  legacyLink?: boolean;
  rewire?: boolean;
  /**
   * Whether to create link to @teambit/bit in the root node modules
   */
  linkTeambitBit?: boolean;
  /**
   * Whether to create links in the root dir node modules to all core aspects
   */
  linkCoreAspects?: boolean;
};

const DEFAULT_LINKING_OPTIONS: LinkingOptions = {
  legacyLink: true,
  rewire: false,
  linkTeambitBit: true,
  linkCoreAspects: true,
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

export type LinkResults = {
  legacyLinkResults?: LegacyLinksResult[];
  legacyLinkCodemodResults?: CodemodResult[];
  teambitBitLink?: CoreAspectLinkResult;
  coreAspectsLinks?: CoreAspectLinkResult[];
  harmonyLink?: LinkDetail;
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
    const result: LinkResults = {};
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {}, options || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    if (linkingOpts.legacyLink) {
      const legacyStringIds = componentDirectoryMap.toArray().map(([component]) => component.id._legacy.toString());
      const legacyResults = await legacyLink(legacyStringIds, linkingOpts.rewire ?? false);
      result.legacyLinkResults = legacyResults.linksResults;
      result.legacyLinkCodemodResults = legacyResults.codemodResults;
    }

    // Link deps which should be linked to the env
    await this.linkDepsResolvedFromEnv(componentDirectoryMap);

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

    const harmonyLink = this.linkHarmony(componentDirectoryMap, finalRootDir);
    result.harmonyLink = harmonyLink;
    this.logger.consoleSuccess('linking components');
    return result;
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
        const NM = 'node_modules';
        const linkSrc = path.join(
          resolvedModule?.slice(0, resolvedModule.lastIndexOf(NM) + NM.length),
          depEntry.dependencyId
        );
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
      const filterdLinkes = compact(oneComponentLinks);
      const depsLinkedToEnvResult: DepsLinkedToEnvResult = {
        componentId: entry.component.id.toString(),
        linksDetail: filterdLinkes,
      };
      return depsLinkedToEnvResult;
    });
    return Promise.all(allLinksP);
  }

  private async linkBitAspectIfNotExist(
    dir: string,
    componentIds: string[]
  ): Promise<CoreAspectLinkResult | undefined> {
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
    const isTargetExists = await fs.pathExists(target);
    // Do not override links created by other means
    if (isTargetExists) {
      return undefined;
    }
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
      if (aspectId === this.aspectLoader.mainAspect.id) {
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

    const results = filtered.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id), hasLocalInstallation);
    });
    return compact(results);
  }

  private isBitRepoWorkspace(dir: string) {
    // A special condition to not link core aspects in bit workspace itself
    if (this.aspectLoader.mainAspect.path.startsWith(dir)) {
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
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }

    const mainAspectPath = path.join(dir, this.aspectLoader.mainAspect.packageName);
    let aspectDir = path.join(mainAspectPath, 'dist', name);
    const target = path.join(dir, packageName);
    const isTargetExists = fs.pathExistsSync(target);
    // Do not override links created by other means
    if (isTargetExists && !hasLocalInstallation) {
      return undefined;
    }
    const isAspectDirExist = fs.pathExistsSync(aspectDir);
    if (!isAspectDirExist) {
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
        return undefined;
      }
      fs.symlinkSync(aspectPath, target);
      return { aspectId: id, linkDetail: { from: aspectPath, to: target } };
    } catch (err) {
      throw new CoreAspectLinkError(id, err);
    }
  }

  private linkHarmony(dirMap: ComponentMap<string>, rootDir: string): LinkDetail | undefined {
    const name = 'harmony';
    const packageName = '@teambit/harmony';

    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }
    const mainAspectPath = path.join(rootDir, this.aspectLoader.mainAspect.packageName);
    const harmonyDir = path.join(mainAspectPath, 'dist', name);

    const target = path.join(rootDir, 'node_modules', packageName);
    const isTargetExists = fs.pathExistsSync(target);
    // Do not override links created by other means
    if (isTargetExists) {
      return undefined;
    }
    const isHarmonyDirExist = fs.pathExistsSync(harmonyDir);
    if (!isHarmonyDirExist) {
      const newDir = getHarmonyDirForDevEnv();
      createSymlinkOrCopy(newDir, target);
      return { from: newDir, to: target };
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(harmonyDir);
      const harmonyPath = path.resolve(path.join(module.path, '..', '..'));
      // in this case we want the symlinks to be relative links
      // Using the fs module to make sure it is relative to the target
      if (fs.existsSync(target)) {
        return undefined;
      }
      fs.symlinkSync(harmonyPath, target);
      return { from: harmonyPath, to: target };
    } catch (err) {
      throw new HarmonyLinkError(err);
    }
  }
}

/**
 * When running dev env (bd) we need to get the harmony folder from the node_modules of the clone
 */
function getHarmonyDirForDevEnv(): string {
  const moduleDirectory = require.resolve('@teambit/harmony');
  const dirPath = path.join(moduleDirectory, '../..'); // to remove the "index.js" at the end
  if (!fs.existsSync(dirPath)) {
    throw new BitError(`unable to find @teambit/harmony in ${dirPath}`);
  }
  return dirPath;
}

function resolveModuleFromDir(fromDir: string, moduleId: string): string | undefined {
  return resolveFrom.silent(fromDir, moduleId);
}
