import { DependencyResolverAspect } from './dependency-resolver.aspect';

export { UpdatedComponent } from './apply-updates';
export { RawComponentState, ComponentsManifestsMap, RegistriesMap } from './types';
export {
  WorkspaceManifest,
  ComponentManifest,
  CreateFromComponentsOptions,
  ManifestDependenciesObject,
} from './manifest';
export { Registries, Registry } from './registry';
export {
  InstallationContext,
  PackageImportMethod,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
} from './package-manager';
export type {
  DependencyResolverMain,
  DependencyResolverWorkspaceConfig,
  DependencyResolverVariantConfig,
  BIT_CLOUD_REGISTRY,
  MergedOutdatedPkg,
} from './dependency-resolver.main.runtime';
export {
  BIT_DEV_REGISTRY,
  NPM_REGISTRY,
  ProxyConfig as PackageManagerProxyConfig,
  NetworkConfig as PackageManagerNetworkConfig,
} from './dependency-resolver.main.runtime';
export {
  DependencyLifecycleType,
  WorkspaceDependencyLifecycleType,
  DependencyList,
  DependencyFactory,
  SerializedDependency,
  Dependency,
  BaseDependency,
  SemverVersion,
  DependenciesManifest,
  ComponentDependency,
  KEY_NAME_BY_LIFECYCLE_TYPE,
} from './dependencies';
export {
  WorkspacePolicyEntry,
  WorkspacePolicy,
  WorkspacePolicyConfigObject,
  VariantPolicyConfigObject,
  Policy,
  PolicySemver,
  PolicyConfigKeys,
  PolicyConfigKeysNames,
  PolicyEntry,
  VariantPolicy,
  SerializedVariantPolicy,
  WorkspacePolicyConfigKeysNames,
  EnvPolicyConfigObject,
  EnvPolicy,
} from './policy';
export {
  CoreAspectLinkResult,
  LinkDetail,
  LinkResults,
  LinkingOptions,
  DependencyLinker,
  DepsLinkedToEnvResult,
  NestedNMDepsLinksResult,
  LinkToDirResult,
} from './dependency-linker';
export { GetComponentManifestsOptions, InstallOptions, InstallArgs, DependencyInstaller } from './dependency-installer';
export { DependencyDetector, FileContext } from './dependency-detector';
export { DependencySource, VariantPolicyEntry } from './policy/variant-policy/variant-policy';
export { OutdatedPkg } from './get-all-policy-pkgs';
export { extendWithComponentsFromDir } from './extend-with-components-from-dir';
export { isRange } from './manifest/deduping/hoist-dependencies';
export { DependencyEnv } from './dependency-env';
export { DependencyResolverAspect as default, DependencyResolverAspect };
