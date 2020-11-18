import path from 'path';
import fs from 'fs-extra';
import {
  MainAspect,
  AspectLoaderMain,
  getCoreAspectName,
  getCoreAspectPackageName,
  getAspectDir,
} from '@teambit/aspect-loader';
import { ComponentMap } from '@teambit/component';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { BitError } from 'bit-bin/dist/error/bit-error';
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinkingOptions } from './dependency-resolver.main.runtime';
import {
  MainAspectNotInstallable,
  MainAspectNotLinkable,
  RootDirNotDefined,
  CoreAspectLinkError,
  HarmonyLinkError,
} from './exceptions';
import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { WorkspacePolicy } from './policy';

const DEFAULT_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
  copyPeerToRuntimeOnRoot: true,
  copyPeerToRuntimeOnComponents: false,
};

const DEFAULT_LINKING_OPTIONS: LinkingOptions = {
  bitLinkType: 'link',
  linkCoreAspects: true,
};

export type BitLinkType = 'link' | 'install';

export class DependencyInstaller {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    private aspectLoader: AspectLoaderMain,

    private rootDir?: string | PathAbsolute,

    private cacheRootDir?: string | PathAbsolute,

    private linkingOptions?: LinkingOptions
  ) {}

  async install(
    rootDir: string | undefined,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerInstallOptions = DEFAULT_INSTALL_OPTIONS
  ) {
    const mainAspect: MainAspect = this.aspectLoader.mainAspect;
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign({}, DEFAULT_INSTALL_OPTIONS, { cacheRootDir: this.cacheRootDir }, options);
    if (linkingOpts.bitLinkType === 'install') {
      if (!mainAspect.version || !mainAspect.packageName) {
        throw new MainAspectNotInstallable();
      }
      const version = mainAspect.version;
      rootPolicy.add({
        dependencyId: mainAspect.packageName,
        lifecycleType: 'runtime',
        value: {
          version,
        },
      });
    }

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootPolicy, componentDirectoryMap, calculatedOpts);
    // We remove the version since it used in order to check if it's core aspects, and the core aspects arrived from aspect loader without versions
    const componentIdsWithoutVersions: string[] = [];
    componentDirectoryMap.map((_dir, comp) => {
      componentIdsWithoutVersions.push(comp.id.toString({ ignoreVersion: true }));
      return undefined;
    });
    if (linkingOpts.bitLinkType === 'link' && !this.isBitRepoWorkspace(finalRootDir)) {
      await this.linkBitAspectIfNotExist(path.join(finalRootDir, 'node_modules'), componentIdsWithoutVersions);
    }

    if (linkingOpts.linkCoreAspects && !this.isBitRepoWorkspace(finalRootDir)) {
      const hasLocalInstallation = linkingOpts.bitLinkType === 'install';
      await this.linkNonExistingCoreAspects(
        path.join(finalRootDir, 'node_modules'),
        componentIdsWithoutVersions,
        hasLocalInstallation
      );
    }

    this.linkHarmony(componentDirectoryMap, finalRootDir);
    return componentDirectoryMap;
  }

  async linkBit(dir: string): Promise<void> {
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }
    const target = path.join(dir, this.aspectLoader.mainAspect.packageName);
    const isTargetExists = await fs.pathExists(target);
    // Do not override links created by other means
    if (isTargetExists) {
      return;
    }
    const src = this.aspectLoader.mainAspect.path;
    await fs.ensureDir(path.dirname(target));
    createSymlinkOrCopy(src, target);
  }

  async linkCoreAspects(dir: string) {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsIdsWithoutMain = coreAspectsIds.filter((id) => id !== this.aspectLoader.mainAspect.id);
    return coreAspectsIdsWithoutMain.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id));
    });
  }

  private async linkBitAspectIfNotExist(dir: string, componentIds: string[]): Promise<void> {
    // TODO: change to this.aspectLoader.mainAspect.id once default scope is resolved and the component dir map has the id with scope
    const mainAspectId = this.aspectLoader.mainAspect.id;
    const existing = componentIds.find((id) => {
      return id === mainAspectId;
    });

    if (existing) {
      return undefined;
    }
    return this.linkBit(dir);
  }

  private async linkNonExistingCoreAspects(dir: string, componentIds: string[], hasLocalInstallation = false) {
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

    return filtered.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id), hasLocalInstallation);
    });
  }

  private isBitRepoWorkspace(dir: string) {
    // A special condition to not link core aspects in bit workspace itself
    if (this.aspectLoader.mainAspect.path.startsWith(dir)) {
      return true;
    }
    return false;
  }

  private linkCoreAspect(dir: string, id: string, name: string, packageName: string, hasLocalInstallation = false) {
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }

    const mainAspectPath = path.join(dir, this.aspectLoader.mainAspect.packageName);
    let aspectDir = path.join(mainAspectPath, 'dist', name);
    const target = path.join(dir, packageName);
    const isTargetExists = fs.pathExistsSync(target);
    // Do not override links created by other means
    if (isTargetExists && !hasLocalInstallation) {
      return;
    }
    const isAspectDirExist = fs.pathExistsSync(aspectDir);
    if (!isAspectDirExist) {
      aspectDir = getAspectDir(id);
      createSymlinkOrCopy(aspectDir, target);
      return;
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(aspectDir);
      const aspectPath = path.resolve(path.join(module.path, '..', '..'));
      // in this case we want the symlinks to be relative links
      // Using the fs module to make sure it is relative to the target
      if (fs.existsSync(target)) {
        return;
      }
      fs.symlinkSync(aspectPath, target);
    } catch (err) {
      throw new CoreAspectLinkError(id, err);
    }
  }

  private linkHarmony(dirMap: ComponentMap<string>, rootDir: string) {
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
      return;
    }
    const isHarmonyDirExist = fs.pathExistsSync(harmonyDir);
    if (!isHarmonyDirExist) {
      const newDir = getHarmonyDirForDevEnv();
      createSymlinkOrCopy(newDir, target);
      return;
    }

    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(harmonyDir);
      const harmonyPath = path.resolve(path.join(module.path, '..', '..'));
      // in this case we want the symlinks to be relative links
      // Using the fs module to make sure it is relative to the target
      if (fs.existsSync(target)) {
        return;
      }
      fs.symlinkSync(harmonyPath, target);
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
