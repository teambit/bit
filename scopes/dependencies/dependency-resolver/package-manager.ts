import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { PeerDependencyRules, ProjectManifest } from '@pnpm/types';
import { ComponentID, ComponentMap } from '@teambit/component';
import { type DependenciesGraph } from '@teambit/legacy/dist/scope/models/version';
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

  excludeLinksFromLockfile?: boolean;

  installPeersFromEnvs?: boolean;

  dependencyFilterFn?: DepsFilterFn;

  overrides?: Record<string, string>;

  lockfileOnly?: boolean;

  /**
   * When false, the package manager will not write the node_modules directory
   */
  enableModulesDir?: boolean;

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

  pruneNodeModules?: boolean;

  hasRootComponents?: boolean;

  neverBuiltDependencies?: string[];

  preferOffline?: boolean;

  nmSelfReferences?: boolean;

  /**
   * e.g. when running `bit install` through the web or the IDE, not from the CLI.
   */
  optimizeReportForNonTerminal?: boolean;

  /**
   * Sets the frequency of updating the progress output in milliseconds.
   * E.g., if this is set to 1000, then the progress will be updated every second.
   */
  throttleProgress?: number;

  hideProgressPrefix?: boolean;

  hideLifecycleOutput?: boolean;

  /**
   * Do installation using lockfile only. Ignore the component manifests.
   */
  ignorePackageManifest?: boolean;

  /**
   * When enabled, installation by the package manager will be skipped
   * but all the options will be calculated and the rebuild function will be returned.
   * We use this option for a performance optimization in Ripple CI.
   */
  dryRun?: boolean;

  dedupeInjectedDeps?: boolean;

  /**
   * When this is set to true, pnpm will hoist workspace packages to node_modules/.pnpm/node_modules.
   * This is something we need in capsules.
   */
  hoistWorkspacePackages?: boolean;

  /**
   * Tells pnpm which packages should be hoisted to node_modules/.pnpm/node_modules.
   * By default, all packages are hoisted - however, if you know that only some flawed packages have phantom dependencies,
   * you can use this option to exclusively hoist the phantom dependencies (recommended).
   */
  hoistPatterns?: string[];

  /**
   * When true, dependencies from the workspace are hoisted to node_modules/.pnpm/node_modules
   * even if they are found in the root node_modules
   */
  hoistInjectedDependencies?: boolean;

  /**
   * Tells pnpm to automatically install peer dependencies. It is true by default.
   */
  autoInstallPeers?: boolean;

  /**
   * Tells the package manager to return the list of dependencies that has to be built.
   * This is used by Ripple CI.
   */
  returnListOfDepsRequiringBuild?: boolean;

  dependenciesGraph?: DependenciesGraph;
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

  findUsages?(depName: string, opts: { lockfileDir: string; depth?: number }): Promise<string>;

  calcDependenciesGraph?(options: CalcDepsGraphOptions): Promise<DependenciesGraph | undefined>;

  calcDependenciesGraphFromCapsule?(options: CalcDepsGraphFromCapsuleOptions): Promise<DependenciesGraph | undefined>;
}

export interface CalcDepsGraphFromCapsuleOptions {
  componentRelativeDir: string;
  componentIdByPkgName: ComponentIdByPkgName;
  rootDir: string;
}

export interface CalcDepsGraphOptions extends CalcDepsGraphFromCapsuleOptions {
  componentRootDir: string;
  pkgName: string;
}

export type ComponentIdByPkgName = Map<string, ComponentID>;
