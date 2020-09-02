import path from 'path';
import fs from 'fs-extra';
import { ComponentMap } from '@teambit/component';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinkingOptions } from './dependency-resolver.main.runtime';
import { MainAspectNotInstallable, MainAspectNotLinkable, RootDirNotDefined } from './exceptions';

import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { DependenciesObjectDefinition } from './types';
import { MainAspect, AspectLoaderMain, getCoreAspectName, getCoreAspectPackageName, getAspectDir } from '@teambit/aspect-loader';

const DEFAULT_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
  copyPeerToRuntimeOnRoot: true,
  copyPeerToRuntimeOnComponents: false,
};

const DEFAULT_LINKING_OPTIONS: LinkingOptions = {
  bitLinkType: 'link',
  linkCoreAspects: true
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
    if (linkingOpts.bitLinkType === 'install'){
      if (!mainAspect.version || !mainAspect.packageName){
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
    if (linkingOpts.bitLinkType === 'link' && !this.isBitRepoWorkspace(finalRootDir)){
      await this.linkBit(path.join(finalRootDir, 'node_modules'));
    }
    if (linkingOpts.linkCoreAspects && !this.isBitRepoWorkspace(finalRootDir)){
      await this.linkCoreAspects(path.join(finalRootDir, 'node_modules'));
    }
    return componentDirectoryMap;
  }

  private isBitRepoWorkspace(dir: string){
    // A special condition to not link core aspects in bit workspace itself
    if (this.aspectLoader.mainAspect.path.startsWith(dir)){
      return true;
    }
    return false;
  }

  async linkBit(dir: string) {
    if (!this.aspectLoader.mainAspect.packageName){
      throw new MainAspectNotLinkable();
    }
    const target = path.join(dir, this.aspectLoader.mainAspect.packageName);
    const src = this.aspectLoader.mainAspect.path;
    fs.ensureDir(path.dirname(target));
    createSymlinkOrCopy(src, target);
  }

  async linkCoreAspects(dir: string){
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsIdsWithoutMain = coreAspectsIds.filter(id => id !== this.aspectLoader.mainAspect.id);
    const linkCoreAspectsP = coreAspectsIdsWithoutMain.map(id => {
      return this.linkCoreAspect(dir, id, getCoreAspectName(id), getCoreAspectPackageName(id));
    });
    return Promise.all(linkCoreAspectsP);
  }

  private async linkCoreAspect(dir: string, id: string, name: string, packageName: string){
    if (!this.aspectLoader.mainAspect.packageName){
      throw new MainAspectNotLinkable();
    }
    const mainAspectPath = path.join(dir, this.aspectLoader.mainAspect.packageName);
    let aspectDir = path.join(mainAspectPath, name);
    const isExist = await fs.pathExists(aspectDir);
    const target = path.join(dir, packageName);
    // We get here usually when running bit from the cloned repo rather then the global install of bit
    if (!isExist){
      aspectDir = getAspectDir(id);
    }

    return createSymlinkOrCopy(aspectDir, target);
  }
}
