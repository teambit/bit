import { PathAbsolute } from '@teambit/legacy/dist/utils/path';

import { PackageManager, PackageManagerResolveRemoteVersionOptions, ResolvedPackageVersion } from './package-manager';

const DEFAULT_REMOTE_RESOLVE_VERSIONS = {
  fetchToCache: true,
  update: true,
};

export class DependencyVersionResolver {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    private cacheRootDir?: string | PathAbsolute
  ) {}

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign(
      {},
      DEFAULT_REMOTE_RESOLVE_VERSIONS,
      { cacheRootDir: this.cacheRootDir },
      options
    );
    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    const resolved = await this.packageManager.resolveRemoteVersion(packageName, calculatedOpts);
    return resolved;
  }
}
