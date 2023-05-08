import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { PeerDependencyRules, ProjectManifest } from '@pnpm/types';
import { ComponentMap } from '@teambit/component';
import { Registries } from './registry';
import { DepsFilterFn } from './manifest';
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

  peerDependencyRules?: PeerDependencyRules;

  includeOptionalDeps?: boolean;

  updateAll?: boolean;

  hidePackageManagerOutput?: boolean;
};

export type PackageManagerGetPeerDependencyIssuesOptions = PackageManagerInstallOptions;

export type ResolvedPackageVersion = {
  packageName: string;
  version: string | null;
  wantedRange?: string;
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

export interface InstallationContext {
  rootDir: string;
  manifests: Record<string, ProjectManifest>;
  componentDirectoryMap: ComponentMap<string>;
}

export interface PackageManager {
  /**
   * Name of the package manager
   */
  name: string;
  /**
   * install dependencies
   * @param componentDirectoryMap
   */
  install(
    context: InstallationContext,
    options: PackageManagerInstallOptions
  ): Promise<{ dependenciesChanged: boolean }>;

  pruneModules?(rootDir: string): Promise<void>;

  resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion>;

  getPeerDependencyIssues?(
    rootDir: string,
    manifests: Record<string, ProjectManifest>,
    options: PackageManagerGetPeerDependencyIssuesOptions
  ): Promise<PeerDependencyIssuesByProjects>;

  getInjectedDirs?(rootDir: string, componentDir: string, packageName: string): Promise<string[]>;

  getRegistries?(): Promise<Registries>;

  getProxyConfig?(): Promise<ProxyConfig>;

  getNetworkConfig?(): Promise<NetworkConfig>;

  /**
   * Specify if the package manager can be run with deduping on existing worksapce (which already contains root dependencies)
   * again, with a different context.
   * If the package manager is not capable of doing so, we want to disable the deduping.
   */
  supportsDedupingOnExistingRoot?: () => boolean;

  /**
   * Returns "dependencies" entries for ".bit_roots".
   * These entries tell the package manager from where to the local components should be installed.
   */
  getWorkspaceDepsOfBitRoots(manifests: ProjectManifest[]): Record<string, string>;
}
