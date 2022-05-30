import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { ComponentMap } from '@teambit/component';
import { Registries } from './registry';
import { DepsFilterFn } from './manifest';
import { WorkspacePolicy } from './policy';
import { NetworkConfig, ProxyConfig } from './dependency-resolver.main.runtime';

export { PeerDependencyIssuesByProjects };

export type PackageImportMethod = 'auto' | 'hardlink' | 'copy' | 'clone';

export type PackageManagerInstallOptions = {
  cacheRootDir?: string;
  /**
   * decide whether to dedup dependencies.
   */
  dedupe?: boolean;

  copyPeerToRuntimeOnRoot?: boolean;

  copyPeerToRuntimeOnComponents?: boolean;

  installPeersFromEnvs?: boolean;

  dependencyFilterFn?: DepsFilterFn;

  overrides?: Record<string, string>;

  nodeLinker?: 'hoisted' | 'isolated';

  packageManagerConfigRootDir?: string;

  packageImportMethod?: PackageImportMethod;

  rootComponents?: boolean;

  rootComponentsForCapsules?: boolean;

  useNesting?: boolean;

  keepExistingModulesDir?: boolean;

  sideEffectsCache?: boolean;

  engineStrict?: boolean;

  nodeVersion?: string;
};

export type PackageManagerGetPeerDependencyIssuesOptions = PackageManagerInstallOptions;

export type ResolvedPackageVersion = {
  packageName: string;
  version: string | null;
  isSemver: boolean;
  resolvedVia?: string;
};

export type PackageManagerResolveRemoteVersionOptions = {
  rootDir: string;
  cacheRootDir?: string;
  packageManagerConfigRootDir?: string;
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
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerInstallOptions
  ): Promise<void>;

  resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion>;

  getPeerDependencyIssues?(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerGetPeerDependencyIssuesOptions
  ): Promise<PeerDependencyIssuesByProjects>;

  getInjectedDirs?(rootDir: string, componentDir: string, packageName: string): Promise<string[]>;

  getRegistries?(): Promise<Registries>;

  getProxyConfig?(): Promise<ProxyConfig>;

  getNetworkConfig?(): Promise<NetworkConfig>;
}
