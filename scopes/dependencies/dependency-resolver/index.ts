import { DependencyResolverAspect } from './dependency-resolver.aspect';

export type { UpdatedComponent } from './apply-updates';
export type { RawComponentState, ComponentsManifestsMap, RegistriesMap } from './types';
export { WorkspaceManifest, ComponentManifest } from './manifest';
export type { CreateFromComponentsOptions, ManifestDependenciesObject } from './manifest';
export type {
  InstallationContext,
  PackageImportMethod,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
  CalcDepsGraphOptions,
  ComponentIdByPkgName,
} from './package-manager';
export type { DependencyResolverWorkspaceConfig, NodeLinker } from './dependency-resolver-workspace-config';
export type {
  DependencyResolverMain,
  DependencyResolverVariantConfig,
  MergedOutdatedPkg,
} from './dependency-resolver.main.runtime';
export { NPM_REGISTRY, BIT_CLOUD_REGISTRY } from './dependency-resolver.main.runtime';
export type {
  ProxyConfig as PackageManagerProxyConfig,
  NetworkConfig as PackageManagerNetworkConfig,
} from './dependency-resolver.main.runtime';
export { DependencyList, BaseDependency, ComponentDependency, KEY_NAME_BY_LIFECYCLE_TYPE, COMPONENT_DEP_TYPE } from './dependencies';
export type {
  DependencyLifecycleType,
  WorkspaceDependencyLifecycleType,
  DependencyFactory,
  SerializedDependency,
  Dependency,
  SemverVersion,
  DependenciesManifest,
} from './dependencies';
export { WorkspacePolicy, VariantPolicy, EnvPolicy } from './policy';
export type {
  WorkspacePolicyEntry,
  WorkspacePolicyConfigObject,
  VariantPolicyConfigObject,
  Policy,
  PolicySemver,
  PolicyConfigKeys,
  PolicyConfigKeysNames,
  PolicyEntry,
  SerializedVariantPolicy,
  WorkspacePolicyConfigKeysNames,
  EnvPolicyConfigObject,
  VariantPolicyConfigArr,
} from './policy';
export { DependencyLinker } from './dependency-linker';
export type {
  CoreAspectLinkResult,
  LinkDetail,
  LinkResults,
  LinkingOptions,
  DepsLinkedToEnvResult,
  NestedNMDepsLinksResult,
  LinkToDirResult,
} from './dependency-linker';
export { DependencyInstaller } from './dependency-installer';
export type { GetComponentManifestsOptions, InstallOptions, InstallArgs } from './dependency-installer';
export type { DependencyDetector, FileContext } from './dependency-detector';
export type { DependencySource, VariantPolicyEntry } from './policy/variant-policy/variant-policy';
export type { OutdatedPkg, CurrentPkg } from './get-all-policy-pkgs';
export { extendWithComponentsFromDir } from './extend-with-components-from-dir';
export { isRange } from './manifest/deduping/hoist-dependencies';
export type { DependencyEnv } from './dependency-env';
export { DependencyResolverAspect as default, DependencyResolverAspect };
