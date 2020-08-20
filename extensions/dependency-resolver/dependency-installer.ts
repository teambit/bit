import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { ComponentMap } from '@teambit/component';
import { DependenciesObjectDefinition } from './types';
import { PathAbsolute } from 'bit-bin/dist/utils/path';

const DEFAULT_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
};

export class DependencyInstaller {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    private cacheRootDir?: string | PathAbsolute
  ) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerInstallOptions = DEFAULT_INSTALL_OPTIONS
  ) {
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign({}, DEFAULT_INSTALL_OPTIONS, { cacheRootDir: this.cacheRootDir }, options);
    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(rootDir, rootDepsObject, componentDirectoryMap, calculatedOpts);
    return componentDirectoryMap;
  }
}
