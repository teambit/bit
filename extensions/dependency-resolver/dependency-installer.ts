import path from 'path';
import fs from 'fs-extra';
import { ComponentMap } from '@teambit/component';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { createSymlinkOrCopy } from 'bit-bin/dist/utils';
import { LinkingOptions } from './dependency-resolver.main.runtime';
import { RootDirNotDefined } from './exceptions';

import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { DependenciesObjectDefinition } from './types';

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
      const globalBitFolder = this.getBitGlobalFolder();
      // TODO: take from aspect loader
      const packageJson = await fs.readJSON(path.join(globalBitFolder, 'package.json'));
      const version = packageJson.version;
      rootDepsObject = rootDepsObject || {};
      rootDepsObject.dependencies = rootDepsObject.dependencies || {};
      // TODO: take id from aspect loader
      rootDepsObject.dependencies['@teambit/bit'] = version;
    }
    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootDepsObject, componentDirectoryMap, calculatedOpts);
    if (linkingOpts.bitLinkType === 'link'){
      this.linkBit(path.join(finalRootDir, 'node_modules'), '@teambit/bit');
    }
    return componentDirectoryMap;
  }

  async linkBit(dir: string, id: string) {
    const src = path.join(dir, id);
    const target = this.getBitGlobalFolder();
    createSymlinkOrCopy(src, target);
  }

  // TODO: take from aspect loader
  private getBitGlobalFolder(): string {
    const bitPath = path.resolve(__dirname, '..', '..');
    return bitPath;
  }
}
