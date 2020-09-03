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
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinkingOptions } from './dependency-resolver.main.runtime';
import { MainAspectNotInstallable, MainAspectNotLinkable, RootDirNotDefined } from './exceptions';

import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { DependenciesObjectDefinition } from './types';

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
    rootDepsObject: DependenciesObjectDefinition,
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
      const name = mainAspect.packageName;
      rootDepsObject = rootDepsObject || {};
      rootDepsObject.dependencies = rootDepsObject.dependencies || {};
      rootDepsObject.dependencies[name] = version;
    }

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootDepsObject, componentDirectoryMap, calculatedOpts);
    const componentIds = Array.from(componentDirectoryMap.keys());
    if (linkingOpts.bitLinkType === 'link' && !this.isBitRepoWorkspace(finalRootDir)) {
      await this.linkBitAspectIfNotExist(path.join(finalRootDir, 'node_modules'), componentIds);
    }
    if (linkingOpts.linkCoreAspects && !this.isBitRepoWorkspace(finalRootDir)) {
      await this.linkNonExistingCoreAspects(path.join(finalRootDir, 'node_modules'), componentIds);
    }
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
    fs.ensureDir(path.dirname(target));
    createSymlinkOrCopy(src, target);
  }

  async linkCoreAspects(dir: string) {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsIdsWithoutMain = coreAspectsIds.filter((id) => id !== this.aspectLoader.mainAspect.id);
    const linkCoreAspectsP = coreAspectsIdsWithoutMain.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id));
    });
    return Promise.all(linkCoreAspectsP);
  }

  private async linkBitAspectIfNotExist(dir: string, componentIds: string[]): Promise<void> {
    // TODO: change to this.aspectLoader.mainAspect.id once default scope is resolved and the component dir map has the id with scope
    const bitName = this.aspectLoader.mainAspect.name;
    const existing = componentIds.find((id) => {
      return id === bitName;
    });
    if (existing) {
      return undefined;
    }
    return this.linkBit(dir);
  }

  private async linkNonExistingCoreAspects(dir: string, componentIds: string[]) {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const filtered = coreAspectsIds.filter((aspectId) => {
      // Remove bit aspect
      if (aspectId === this.aspectLoader.mainAspect.id) {
        return false;
      }
      // TODO: use the aspect id once default scope is resolved and the component dir map has the id with scope
      const name = getCoreAspectName(aspectId);
      const existing = componentIds.find((componentId) => {
        return componentId === name;
      });
      if (existing) {
        return false;
      }
      return true;
    });
    const linkCoreAspectsP = filtered.map((id) => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id));
    });
    return Promise.all(linkCoreAspectsP);
  }

  private isBitRepoWorkspace(dir: string) {
    // A special condition to not link core aspects in bit workspace itself
    if (this.aspectLoader.mainAspect.path.startsWith(dir)) {
      return true;
    }
    return false;
  }

  private async linkCoreAspect(dir: string, id: string, name: string, packageName: string) {
    if (!this.aspectLoader.mainAspect.packageName) {
      throw new MainAspectNotLinkable();
    }
    const mainAspectPath = path.join(dir, this.aspectLoader.mainAspect.packageName);
    let aspectDir = path.join(mainAspectPath, name);
    const target = path.join(dir, packageName);
    const isTargetExists = await fs.pathExists(target);
    // Do not override links created by other means
    if (isTargetExists) {
      return;
    }
    const isAspectDirExist = await fs.pathExists(aspectDir);
    if (!isAspectDirExist) {
      aspectDir = getAspectDir(id);
    }

    createSymlinkOrCopy(aspectDir, target);
  }
}
