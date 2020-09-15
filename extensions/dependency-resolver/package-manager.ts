import { ComponentMap } from '@teambit/component';

import { DependenciesObjectDefinition } from './types';

export type PackageManagerInstallOptions = {
  cacheRootDir?: string;
  /**
   * decide whether to dedup dependencies.
   */
  dedupe?: boolean;

  copyPeerToRuntimeOnRoot?: boolean;

  copyPeerToRuntimeOnComponents?: boolean;
};

export type ResolvedPackageVersion = {
  packageName: string;
  version: string | null;
  isSemver: boolean;
  resolvedVia?: string;
};

export type PackageManagerResolveRemoteVersionOptions = {
  rootDir: string;
  cacheRootDir?: string;
  // fetchToCache?: boolean;
  // update?: boolean;
};

export interface PackageManager {
  /**
   * install dependencies
   * @param componentDirectoryMap
   */
  install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    options?: PackageManagerInstallOptions
  ): Promise<void>;

  resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion>;
}
