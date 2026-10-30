import pLimit from 'p-limit';

import type {
  PackageManager,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
} from './package-manager';

const DEFAULT_REMOTE_RESOLVE_VERSIONS = {
  fetchToCache: true,
  update: true,
};

export class DependencyVersionResolver {
  private limitRequests: pLimit.Limit;

  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    networkConcurrency?: number
  ) {
    this.limitRequests = pLimit(networkConcurrency ?? 16);
  }

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign({}, DEFAULT_REMOTE_RESOLVE_VERSIONS, options);
    const resolved = this.limitRequests(() => this.packageManager.resolveRemoteVersion(packageName, calculatedOpts));
    return resolved;
  }
}
