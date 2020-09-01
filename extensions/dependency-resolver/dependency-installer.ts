import path from 'path';
import fs from 'fs-extra';
import { ComponentMap } from '@teambit/component';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinkingOptions } from './dependency-resolver.main.runtime';
import { MainAspectNotInstallable, MainAspectNotLinkable, RootDirNotDefined } from './exceptions';

import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { DependenciesObjectDefinition } from './types';
import { MainAspect } from '@teambit/aspect-loader';

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

    private mainAspect: MainAspect,

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
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign({}, DEFAULT_INSTALL_OPTIONS, { cacheRootDir: this.cacheRootDir }, options);
    if (linkingOpts.bitLinkType === 'install'){
      if (!this.mainAspect.version || !this.mainAspect.packageName){
        throw new MainAspectNotInstallable();
      }
      const globalBitFolder = this.getBitGlobalFolder();
      const version = this.mainAspect.version;
      const name = this.mainAspect.packageName;
      rootDepsObject = rootDepsObject || {};
      rootDepsObject.dependencies = rootDepsObject.dependencies || {};
      rootDepsObject.dependencies[name] = version;
    }

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootDepsObject, componentDirectoryMap, calculatedOpts);
    if (linkingOpts.bitLinkType === 'link'){
      this.linkBit(path.join(finalRootDir, 'node_modules'));
    }
    return componentDirectoryMap;
  }

  async linkBit(dir: string) {
    if (!this.mainAspect.packageName){
      throw new MainAspectNotLinkable();
    }
    const target = path.join(dir, this.mainAspect.packageName);
    const src = this.mainAspect.path;
    fs.ensureDir(path.dirname(target));
    createSymlinkOrCopy(src, target);
  }

  // TODO: take from aspect loader
  private getBitGlobalFolder(): string {
    const bitPath = path.resolve(__dirname, '..', '..');
    return bitPath;
  }
}
