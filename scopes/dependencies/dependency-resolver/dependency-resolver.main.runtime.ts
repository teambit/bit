import mapSeries from 'p-map-series';
import { parse } from 'comment-json';
import { MainRuntime } from '@teambit/cli';
import { getAllCoreAspectsIds } from '@teambit/bit';
import ComponentAspect, { Component, ComponentMap, ComponentMain, IComponent, ComponentID } from '@teambit/component';
import type { ConfigMain } from '@teambit/config';
import { join } from 'path';
import { get, pick, uniq } from 'lodash';
import { ConfigAspect } from '@teambit/config';
import { DependenciesEnv, EnvDefinition, EnvsAspect, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry, ExtensionManifest, Aspect, RuntimeManifest } from '@teambit/harmony';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import type { LoggerMain } from '@teambit/logger';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect } from '@teambit/logger';
import {
  CFG_PACKAGE_MANAGER_CACHE,
  CFG_REGISTRY_URL_KEY,
  CFG_USER_TOKEN_KEY,
  getCloudDomain,
} from '@teambit/legacy/dist/constants';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { DependencyResolver } from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { DetectorHook } from '@teambit/legacy/dist/consumer/component/dependencies/files-dependency-builder/detector-hook';
import { Http, ProxyConfig, NetworkConfig } from '@teambit/legacy/dist/scope/network/http';
import { onTagIdTransformer } from '@teambit/snapping';
import { Version as VersionModel } from '@teambit/legacy/dist/scope/models';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import fs from 'fs-extra';
import { BitId } from '@teambit/legacy-bit-id';
import { readCAFileSync } from '@pnpm/network.ca-file';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { PeerDependencyRules } from '@pnpm/types';
import semver, { SemVer } from 'semver';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import GlobalConfigAspect, { GlobalConfigMain } from '@teambit/global-config';
import { Registries, Registry } from './registry';
import { applyUpdates } from './apply-updates';
import { ROOT_NAME } from './dependencies/constants';
import { DependencyInstaller, PreInstallSubscriberList, PostInstallSubscriberList } from './dependency-installer';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { DependencyVersionResolver } from './dependency-version-resolver';
import { DependencyLinker, LinkingOptions } from './dependency-linker';
import { ComponentModelVersion, getAllPolicyPkgs, OutdatedPkg } from './get-all-policy-pkgs';
import { InvalidVersionWithPrefix, PackageManagerNotFound } from './exceptions';
import {
  CreateFromComponentsOptions,
  WorkspaceManifest,
  WorkspaceManifestFactory,
  ManifestDependenciesObject,
} from './manifest';
import {
  WorkspacePolicyConfigObject,
  VariantPolicyConfigObject,
  WorkspacePolicy,
  WorkspacePolicyFactory,
  VariantPolicy,
  WorkspacePolicyAddEntryOptions,
  WorkspacePolicyEntry,
  SerializedVariantPolicy,
} from './policy';
import {
  PackageImportMethod,
  PackageManager,
  PeerDependencyIssuesByProjects,
  PackageManagerGetPeerDependencyIssuesOptions,
} from './package-manager';

import {
  SerializedDependency,
  DependencyListFactory,
  DependencyFactory,
  ComponentDependencyFactory,
  COMPONENT_DEP_TYPE,
  DependencyList,
  ComponentDependency,
} from './dependencies';
import { DependenciesFragment, DevDependenciesFragment, PeerDependenciesFragment } from './show-fragments';
import { dependencyResolverSchema } from './dependency-resolver.graphql';
import { DependencyDetector } from './dependency-detector';
import { DependenciesService } from './dependencies.service';
import { EnvPolicy } from './policy/env-policy';

/**
 * @deprecated use BIT_CLOUD_REGISTRY instead
 */
export const BIT_DEV_REGISTRY = 'https://node.bit.dev/';
export const BIT_CLOUD_REGISTRY = `https://node.${getCloudDomain()}/`;
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

export { ProxyConfig, NetworkConfig } from '@teambit/legacy/dist/scope/network/http';

export interface DependencyResolverWorkspaceConfig {
  policy: WorkspacePolicyConfigObject;
  /**
   * choose the package manager for Bit to use. you can choose between 'npm', 'yarn', 'pnpm'
   * and 'librarian'. our recommendation is use 'librarian' which reduces package duplicates
   * and totally removes the need of a 'node_modules' directory in your project.
   */
  packageManager: string;

  /**
   * A proxy server for out going network requests by the package manager
   * Used for both http and https requests (unless the httpsProxy is defined)
   */
  proxy?: string;

  /**
   * A proxy server for outgoing https requests by the package manager (fallback to proxy server if not defined)
   * Use this in case you want different proxy for http and https requests.
   */
  httpsProxy?: string;

  /**
   * A path to a file containing one or multiple Certificate Authority signing certificates.
   * allows for multiple CA's, as well as for the CA information to be stored in a file on disk.
   */
  ca?: string;

  /**
   * Whether or not to do SSL key validation when making requests to the registry via https
   */
  strictSsl?: string;

  /**
   * A client certificate to pass when accessing the registry. Values should be in PEM format (Windows calls it "Base-64 encoded X.509 (.CER)") with newlines replaced by the string "\n". For example:
   * cert="-----BEGIN CERTIFICATE-----\nXXXX\nXXXX\n-----END CERTIFICATE-----"
   * It is not the path to a certificate file (and there is no "certfile" option).
   */
  cert?: string;

  /**
   * A client key to pass when accessing the registry. Values should be in PEM format with newlines replaced by the string "\n". For example:
   * key="-----BEGIN PRIVATE KEY-----\nXXXX\nXXXX\n-----END PRIVATE KEY-----"
   * It is not the path to a key file (and there is no "keyfile" option).
   */
  key?: string;

  /**
   * A comma-separated string of domain extensions that a proxy should not be used for.
   */
  noProxy?: string;

  /**
   * The IP address of the local interface to use when making connections to the npm registry.
   */
  localAddress?: string;

  /**
   * How many times to retry if Bit fails to fetch from the registry.
   */
  fetchRetries?: number;

  /*
   * The exponential factor for retry backoff.
   */
  fetchRetryFactor?: number;

  /*
   * The minimum (base) timeout for retrying requests.
   */
  fetchRetryMintimeout?: number;

  /*
   * The maximum fallback timeout to ensure the retry factor does not make requests too long.
   */
  fetchRetryMaxtimeout?: number;

  /*
   * The maximum amount of time (in milliseconds) to wait for HTTP requests to complete.
   */
  fetchTimeout?: number;

  /*
   * The maximum number of connections to use per origin (protocol/host/port combination).
   */
  maxSockets?: number;

  /*
   * Controls the maximum number of HTTP(S) requests to process simultaneously.
   */
  networkConcurrency?: number;

  /*
   * Set the prefix to use when adding dependency to workspace.jsonc via bit install
   * to lock version to exact version you can use empty string (default)
   */
  savePrefix?: string;

  /*
   * in case you want to disable this proxy set this config to false
   *
   */
  installFromBitDevRegistry?: boolean;

  /*
   * map of extra arguments to pass to the configured package manager upon the installation
   * of dependencies.
   */
  packageManagerArgs?: string[];

  /*
   * This field allows to instruct the package manager to override any dependency in the dependency graph.
   * This is useful to enforce all your packages to use a single version of a dependency, backport a fix,
   * or replace a dependency with a fork.
   */
  overrides?: Record<string, string>;

  /**
   * This is similar to overrides, but will only affect installation in capsules.
   * In case overrides is configured and this not, the regular overrides will affect capsules as well.
   * in case both configured, capsulesOverrides will be used for capsules, and overrides will affect the workspace.
   */
  capsulesOverrides?: Record<string, string>;

  /*
   * Defines what linker should be used for installing Node.js packages.
   * Supported values are hoisted and isolated.
   */
  nodeLinker?: 'hoisted' | 'isolated';

  /*
   * Controls the way packages are imported from the store.
   */
  packageImportMethod?: PackageImportMethod;

  /*
   * Use and cache the results of (pre/post)install hooks.
   */
  sideEffectsCache?: boolean;

  /*
   * The list of components that should be installed in isolation from the workspace.
   * The component's package names should be used in this list, not their component IDs.
   */
  rootComponents?: boolean;

  /*
   * The node version to use when checking a package's engines setting.
   */
  nodeVersion?: string;

  /*
   * Refuse to install any package that claims to not be compatible with the current Node.js version.
   */
  engineStrict?: boolean;

  /*
   * Rules to mute specific peer dependeny warnings.
   */
  peerDependencyRules?: PeerDependencyRules;

  /*
   * This setting is "true" by default and tells bit to link core aspects to the node_modules of the workspace.
   * It only makes sense to set this to "false" in a workspace in which core aspects are actually developed.
   */
  linkCoreAspects?: boolean;
}

export interface DependencyResolverVariantConfig {
  policy: VariantPolicyConfigObject;
}

export type RootPolicyRegistry = SlotRegistry<WorkspacePolicy>;
export type PoliciesRegistry = SlotRegistry<VariantPolicyConfigObject>;
export type PackageManagerSlot = SlotRegistry<PackageManager>;
export type DependencyFactorySlot = SlotRegistry<DependencyFactory[]>;
export type PreInstallSlot = SlotRegistry<PreInstallSubscriberList>;
export type PostInstallSlot = SlotRegistry<PostInstallSubscriberList>;

export type MergeDependenciesFunc = (configuredExtensions: ExtensionDataList) => Promise<VariantPolicyConfigObject>;

export type GetInstallerOptions = {
  rootDir?: string;
  packageManager?: string;
  cacheRootDirectory?: string;
};

export type GetLinkerOptions = {
  rootDir?: string;
  linkingOptions?: LinkingOptions;
};

export type GetDependenciesOptions = {
  includeHidden?: boolean;
};

export type GetVersionResolverOptions = {
  cacheRootDirectory?: string;
};

type OnExportIdTransformer = (id: BitId) => BitId;

const defaultLinkingOptions: LinkingOptions = {
  linkTeambitBit: true,
  linkCoreAspects: true,
};

const defaultCreateFromComponentsOptions: CreateFromComponentsOptions = {
  filterComponentsFromManifests: true,
  createManifestForComponentsWithoutDependencies: true,
};

export class DependencyResolverMain {
  constructor(
    /**
     * Dependency resolver  extension configuration.
     */
    readonly config: DependencyResolverWorkspaceConfig,

    /**
     * Registry for changes by other extensions.
     */
    private rootPolicyRegistry: RootPolicyRegistry,

    /**
     * Registry for changes by other extensions.
     */
    private policiesRegistry: PoliciesRegistry,

    /**
     * envs extension.
     */
    private envs: EnvsMain,

    private logger: Logger,

    private configAspect: ConfigMain,

    private aspectLoader: AspectLoaderMain,

    private globalConfig: GlobalConfigMain,

    /**
     * component aspect.
     */
    readonly componentAspect: ComponentMain,

    private packageManagerSlot: PackageManagerSlot,

    private dependencyFactorySlot: DependencyFactorySlot,

    private preInstallSlot: PreInstallSlot,

    private postInstallSlot: PostInstallSlot
  ) {}

  /**
   * This function is a temporary workaround for installation in capsules with pnpm.
   * Currently pnpm breaks the root node_modules inside the capsule because it removes deps from it.
   * Install runs several times in the same capsule and pnpm removes deps from the previous runs.
   *
   * This workaround unfortunately also breaks pnpm on angular projects. Because dedupe doesn't work properly.
   * To fix this issue we'll either have to switch to root components or try to change pnpm code.
   *
   * Here is the PR where initially dedupe was turned off for pnpm: https://github.com/teambit/bit/pull/5410
   */
  supportsDedupingOnExistingRoot(): boolean {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    return packageManager?.supportsDedupingOnExistingRoot?.() === true && !this.hasRootComponents();
  }

  hasRootComponents(): boolean {
    return Boolean(this.config.rootComponents);
  }

  linkCoreAspects(): boolean {
    return this.config.linkCoreAspects ?? DependencyResolverMain.defaultConfig.linkCoreAspects;
  }

  /**
   * register a new package manager to the dependency resolver.
   */
  registerPackageManager(packageManager: PackageManager) {
    this.packageManagerSlot.register(packageManager);
  }

  registerDependencyFactories(factories: DependencyFactory[]) {
    this.dependencyFactorySlot.register(factories);
  }

  registerPreInstallSubscribers(subscribers: PreInstallSubscriberList) {
    this.preInstallSlot.register(subscribers);
  }

  registerPostInstallSubscribers(subscribers: PreInstallSubscriberList) {
    this.postInstallSlot.register(subscribers);
  }

  getSavePrefix(): string {
    return this.config.savePrefix || '';
  }

  getVersionWithSavePrefix(version: string, overridePrefix?: string): string {
    const prefix = overridePrefix || this.getSavePrefix();
    const versionWithPrefix = `${prefix}${version}`;
    if (!semver.validRange(versionWithPrefix)) {
      throw new InvalidVersionWithPrefix(versionWithPrefix);
    }
    return versionWithPrefix;
  }

  async getPolicy(component: Component): Promise<VariantPolicy> {
    const entry = component.state.aspects.get(DependencyResolverAspect.id);
    if (!entry) {
      return VariantPolicy.getEmpty();
    }
    const serializedPolicy: SerializedVariantPolicy = get(entry, ['data', 'policy'], []);
    return VariantPolicy.parse(serializedPolicy);
  }

  /**
   * This function called on component load in order to calculate the dependencies based on the legacy (consumer) component
   * and write them to the dependencyResolver data.
   * Do not use this function for other purpose.
   * If you want to get the component dependencies call getDependencies (which will give you the dependencies from the data itself)
   * TODO: once we switch deps resolver <> workspace relation we should make it private
   * TODO: once we switch deps resolver <> workspace relation we should remove the resolveId func here
   * @param component
   */
  async extractDepsFromLegacy(component: Component, policy?: VariantPolicy): Promise<DependencyList> {
    const componentPolicy = policy || (await this.getPolicy(component));
    const legacyComponent: LegacyComponent = component.state._consumer;
    const listFactory = this.getDependencyListFactory();
    const dependencyList = await listFactory.fromLegacyComponent(legacyComponent);
    dependencyList.forEach((dep) => {
      const found = componentPolicy.find(dep.id);
      // if no policy found, the dependency was auto-resolved from the source code
      dep.source = found?.source || 'auto';
      dep.hidden = found?.hidden;
    });
    return dependencyList;
  }

  private getDependencyListFactory(): DependencyListFactory {
    const factories = this.dependencyFactorySlot.values().flat();
    const factoriesMap = factories.reduce((acc, factory) => {
      acc[factory.type] = factory;
      return acc;
    }, {});
    const listFactory = new DependencyListFactory(factoriesMap);
    return listFactory;
  }

  /**
   * Main function to get the dependency list of a given component
   * @param component
   */
  async getDependencies(
    component: IComponent,
    { includeHidden = false }: GetDependenciesOptions = {}
  ): Promise<DependencyList> {
    const entry = component.get(DependencyResolverAspect.id);
    if (!entry) {
      return DependencyList.fromArray([]);
    }
    const serializedDependencies: SerializedDependency[] = entry?.data?.dependencies || [];
    const depList = await this.getDependenciesFromSerializedDependencies(serializedDependencies);
    if (includeHidden) return depList;
    return depList.filterHidden();
  }

  /**
   * returns only the dependencies that are bit-components.
   */
  async getComponentDependencies(component: IComponent): Promise<ComponentDependency[]> {
    const dependencyList = await this.getDependencies(component);
    return dependencyList.getComponentDependencies();
  }

  private async getDependenciesFromSerializedDependencies(
    dependencies: SerializedDependency[]
  ): Promise<DependencyList> {
    if (!dependencies.length) {
      return DependencyList.fromArray([]);
    }
    const listFactory = this.getDependencyListFactory();
    const deps = await listFactory.fromSerializedDependencies(dependencies);
    return deps;
  }

  /**
   * Getting the merged workspace policy (from dep resolver config and others like root package.json)
   * @returns
   */
  getWorkspacePolicy(): WorkspacePolicy {
    const policyFromConfig = this.getWorkspacePolicyFromConfig();
    const externalPolicies = this.rootPolicyRegistry.toArray().map(([, policy]) => policy);
    return this.mergeWorkspacePolices([policyFromConfig, ...externalPolicies]);
  }

  /**
   * Getting the workspace policy as defined in the workspace.jsonc in the dependencyResolver aspect
   * This will not take into account packages that defined in the package.json of the root for example
   * in most cases you should use getWorkspacePolicy
   * @returns
   */
  getWorkspacePolicyFromConfig(): WorkspacePolicy {
    const factory = new WorkspacePolicyFactory();
    return factory.fromConfigObject(this.config.policy);
  }

  getWorkspacePolicyFromPackageJson(packageJson: Record<string, any>): WorkspacePolicy {
    const factory = new WorkspacePolicyFactory();
    return factory.fromPackageJson(packageJson);
  }

  mergeWorkspacePolices(polices: WorkspacePolicy[]): WorkspacePolicy {
    return WorkspacePolicy.mergePolices(polices);
  }

  /**
   * Create a workspace manifest
   * The term workspace here is not the same as "bit workspace" but a workspace that represent a shared root
   * for installation of many components (sometime it might point to the workspace path)
   * in other case it can be for example the capsules root dir
   *
   * @param {string} [name=ROOT_NAME]
   * @param {SemVer} [version=new SemVer('1.0.0')]
   * @param {ManifestDependenciesObject} dependencies
   * @param {string} rootDir
   * @param {Component[]} components
   * @param {CreateFromComponentsOptions} [options={
   *       filterComponentsFromManifests: true,
   *       createManifestForComponentsWithoutDependencies: true,
   *     }]
   * @returns {WorkspaceManifest}
   * @memberof DependencyResolverMain
   */
  async getWorkspaceManifest(
    name: string = ROOT_NAME,
    version: SemVer = new SemVer('1.0.0'),
    rootPolicy: WorkspacePolicy,
    rootDir: string,
    components: Component[],
    options: CreateFromComponentsOptions = defaultCreateFromComponentsOptions
  ): Promise<WorkspaceManifest> {
    this.logger.setStatusLine('deduping dependencies for installation');
    const concreteOpts = {
      ...defaultCreateFromComponentsOptions,
      ...options,
    };
    const workspaceManifestFactory = new WorkspaceManifestFactory(this, this.aspectLoader);
    const res = await workspaceManifestFactory.createFromComponents(
      name,
      version,
      rootPolicy,
      rootDir,
      components,
      concreteOpts
    );
    this.logger.consoleSuccess();
    return res;
  }

  /**
   * get the package name of a component.
   */
  getPackageName(component: Component) {
    return componentIdToPackageName(component.state._consumer);
  }

  /*
   * Returns the location where the component is installed with its peer dependencies
   * This is used in cases you want to actually run the components and make sure all the dependencies (especially peers) are resolved correctly
   */
  getRuntimeModulePath(component: Component) {
    const modulePath = this.getModulePath(component);
    if (!this.hasRootComponents()) {
      return modulePath;
    }
    const pkgName = this.getPackageName(component);
    return join(modulePath, 'node_modules', pkgName);
  }

  /**
   * returns the package path in the /node_modules/ folder
   * In case you call this in order to run the code from the path, please refer to the `getRuntimeModulePath` API
   */
  getModulePath(component: Component) {
    const pkgName = this.getPackageName(component);
    const relativePath = join('node_modules', pkgName);
    return relativePath;
  }

  /**
   * get a component dependency installer.
   */
  getInstaller(options: GetInstallerOptions = {}) {
    const packageManagerName = options.packageManager || this.config.packageManager;
    const packageManager = this.packageManagerSlot.get(packageManagerName);
    const cacheRootDir = options.cacheRootDirectory || this.globalConfig.getSync(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.config.packageManager);
    }

    if (cacheRootDir && !fs.pathExistsSync(cacheRootDir)) {
      this.logger.debug(`creating package manager cache dir at ${cacheRootDir}`);
      fs.ensureDirSync(cacheRootDir);
    }
    const preInstallSubscribers = this.getPreInstallSubscribers();
    const postInstallSubscribers = this.getPostInstallSubscribers();
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyInstaller(
      packageManager,
      this.aspectLoader,
      this.logger,
      this,
      options.rootDir,
      cacheRootDir,
      preInstallSubscribers,
      postInstallSubscribers,
      this.config.nodeLinker,
      this.config.packageImportMethod,
      this.config.sideEffectsCache,
      this.config.nodeVersion,
      this.config.engineStrict,
      this.config.peerDependencyRules
    );
  }

  private getPreInstallSubscribers(): PreInstallSubscriberList {
    return this.preInstallSlot.values().flat();
  }

  private getPostInstallSubscribers(): PostInstallSubscriberList {
    return this.postInstallSlot.values().flat();
  }

  /**
   * get a component dependency linker.
   */
  getLinker(options: GetLinkerOptions = {}) {
    const linkingOptions = Object.assign({}, defaultLinkingOptions, options?.linkingOptions || {});
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyLinker(
      this,
      this.aspectLoader,
      this.componentAspect,
      this.envs,
      this.logger,
      options.rootDir,
      linkingOptions
    );
  }

  getPackageManagerName() {
    return this.config.packageManager;
  }

  async getVersionResolver(options: GetVersionResolverOptions = {}) {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    const cacheRootDir = options.cacheRootDirectory || this.globalConfig.getSync(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.config.packageManager);
    }

    if (cacheRootDir && !fs.pathExistsSync(cacheRootDir)) {
      this.logger.debug(`creating package manager cache dir at ${cacheRootDir}`);
      fs.ensureDirSync(cacheRootDir);
    }
    const { networkConcurrency } = await this.getNetworkConfig();
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyVersionResolver(packageManager, cacheRootDir, networkConcurrency);
  }

  /**
   * these ids should not be in the dependencyResolver policy normally.
   * one exception is bit itself, which needs teambit.harmony/harmony in the dependencies.
   *
   * returns component-ids string without a version.
   */
  getCompIdsThatShouldNotBeInPolicy(): string[] {
    return [...getAllCoreAspectsIds(), 'teambit.harmony/harmony'];
  }

  /**
   * return the system configured package manager. by default pnpm.
   */
  getSystemPackageManager(): PackageManager {
    const defaultPm = 'teambit.dependencies/pnpm';
    const packageManager = this.packageManagerSlot.get(defaultPm);
    if (!packageManager) throw new Error(`default package manager: ${defaultPm} was not found`);
    return packageManager;
  }

  async getProxyConfig(): Promise<ProxyConfig> {
    const proxyConfigFromDepResolverConfig = this.getProxyConfigFromDepResolverConfig();
    let httpProxy = proxyConfigFromDepResolverConfig.httpProxy;
    let httpsProxy = proxyConfigFromDepResolverConfig.httpsProxy;

    // Take config from the aspect config if defined
    if (httpProxy || httpsProxy) {
      this.logger.debug(
        `proxy config taken from the dep resolver config. proxy: ${httpProxy} httpsProxy: ${httpsProxy}`
      );
      return proxyConfigFromDepResolverConfig;
    }

    // Take config from the package manager (npmrc) config if defined
    const proxyConfigFromPackageManager = await this.getProxyConfigFromPackageManager();
    if (proxyConfigFromPackageManager?.httpProxy || proxyConfigFromPackageManager?.httpsProxy) {
      this.logger.debug(
        `proxy config taken from the package manager config (npmrc). proxy: ${proxyConfigFromPackageManager.httpProxy} httpsProxy: ${proxyConfigFromPackageManager.httpsProxy}`
      );
      return proxyConfigFromPackageManager;
    }

    // Take config from global bit config
    const proxyConfigFromGlobalConfig = await this.getProxyConfigFromGlobalConfig();
    httpProxy = proxyConfigFromGlobalConfig.httpProxy;
    httpsProxy = proxyConfigFromGlobalConfig.httpsProxy;
    if (httpProxy || httpsProxy) {
      this.logger.debug(`proxy config taken from the global bit config. proxy: ${httpProxy} httpsProxy: ${httpsProxy}`);
      return proxyConfigFromGlobalConfig;
    }
    return {};
  }

  private getProxyConfigFromDepResolverConfig(): ProxyConfig {
    return {
      httpProxy: this.config.proxy,
      httpsProxy: this.config.httpsProxy || this.config.proxy,
      noProxy: this.config.noProxy,
    };
  }

  async getNetworkConfig(): Promise<NetworkConfig> {
    const networkConfig = {
      ...(await this.getNetworkConfigFromGlobalConfig()),
      ...(await this.getNetworkConfigFromPackageManager()),
      ...this.getNetworkConfigFromDepResolverConfig(),
    };
    this.logger.debug(
      `the next network configuration is used in dependency-resolver: ${JSON.stringify(
        {
          ...networkConfig,
          key: networkConfig.key ? 'set' : 'not set', // this is sensitive information, we should not log it
        },
        null,
        2
      )}`
    );
    return networkConfig;
  }

  private async getNetworkConfigFromGlobalConfig(): Promise<NetworkConfig> {
    const globalNetworkConfig = await Http.getNetworkConfig();
    if (!globalNetworkConfig.ca && globalNetworkConfig.cafile) {
      globalNetworkConfig.ca = readCAFileSync(globalNetworkConfig.cafile);
    }
    return globalNetworkConfig;
  }

  private getNetworkConfigFromDepResolverConfig(): NetworkConfig {
    const config: NetworkConfig = pick(this.config, [
      'fetchTimeout',
      'fetchRetries',
      'fetchRetryFactor',
      'fetchRetryMintimeout',
      'fetchRetryMaxtimeout',
      'maxSockets',
      'networkConcurrency',
      'key',
      'cert',
      'ca',
      'cafile',
    ]);
    if (this.config.strictSsl != null) {
      config.strictSSL =
        typeof this.config.strictSsl === 'string'
          ? this.config.strictSsl.toLowerCase() === 'true'
          : this.config.strictSsl;
    }
    return config;
  }

  private async getNetworkConfigFromPackageManager(): Promise<NetworkConfig> {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    let networkConfigFromPackageManager: NetworkConfig = {};
    if (typeof packageManager?.getNetworkConfig === 'function') {
      networkConfigFromPackageManager = await packageManager?.getNetworkConfig();
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getNetworkConfig) throw new Error('system package manager must implement `getNetworkConfig()`');
      networkConfigFromPackageManager = await systemPm.getNetworkConfig();
    }
    return networkConfigFromPackageManager;
  }

  private async getProxyConfigFromPackageManager(): Promise<ProxyConfig> {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    let proxyConfigFromPackageManager: ProxyConfig = {};
    if (packageManager?.getProxyConfig && typeof packageManager?.getProxyConfig === 'function') {
      proxyConfigFromPackageManager = await packageManager?.getProxyConfig();
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getProxyConfig) throw new Error('system package manager must implement `getProxyConfig()`');
      proxyConfigFromPackageManager = await systemPm.getProxyConfig();
    }
    return proxyConfigFromPackageManager;
  }

  private getProxyConfigFromGlobalConfig(): Promise<ProxyConfig> {
    return Http.getProxyConfig();
  }

  /**
   * Return the peer dependencies and their ranges that may be installed
   * without causing unmet peer dependency issues in some of the dependencies.
   */
  async getMissingPeerDependencies(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerGetPeerDependencyIssuesOptions
  ): Promise<Record<string, string>> {
    this.logger.setStatusLine('finding missing peer dependencies');
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    let peerDependencyIssues!: PeerDependencyIssuesByProjects;
    const installer = this.getInstaller();
    const manifests = await installer.getComponentManifests({
      ...options,
      componentDirectoryMap,
      rootPolicy,
      rootDir,
    });
    if (packageManager?.getPeerDependencyIssues && typeof packageManager?.getPeerDependencyIssues === 'function') {
      peerDependencyIssues = await packageManager?.getPeerDependencyIssues(rootDir, manifests, options);
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getPeerDependencyIssues)
        throw new Error('system package manager must implement `getPeerDependencyIssues()`');
      peerDependencyIssues = await systemPm?.getPeerDependencyIssues(rootDir, manifests, options);
    }
    this.logger.consoleSuccess();
    return peerDependencyIssues['.']?.intersections;
  }

  async getRegistries(): Promise<Registries> {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    let registries;
    if (packageManager?.getRegistries && typeof packageManager?.getRegistries === 'function') {
      registries = await packageManager?.getRegistries();
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getRegistries) throw new Error('system package manager must implement `getRegistries()`');
      registries = await systemPm.getRegistries();
    }

    const bitScope = registries.scopes.bit;

    const getDefaultBitRegistry = (): Registry => {
      const bitGlobalConfigRegistry = this.globalConfig.getSync(CFG_REGISTRY_URL_KEY);
      const bitRegistry = bitGlobalConfigRegistry || bitScope?.uri || BIT_DEV_REGISTRY;

      const { bitOriginalAuthType, bitAuthHeaderValue, bitOriginalAuthValue } = this.getBitAuthConfig(bitScope);

      const alwaysAuth = bitAuthHeaderValue !== undefined;
      const bitDefaultRegistry = new Registry(
        bitRegistry,
        alwaysAuth,
        bitAuthHeaderValue,
        bitOriginalAuthType,
        bitOriginalAuthValue
      );
      return bitDefaultRegistry;
    };

    const bitDefaultRegistry = getDefaultBitRegistry();

    const installFromBitDevRegistry = this.config.installFromBitDevRegistry ?? true;

    // Override default registry to use bit registry in case npmjs is the default - bit registry will proxy it
    // We check also NPM_REGISTRY.startsWith because the uri might not have the trailing / we have in NPM_REGISTRY
    if (
      installFromBitDevRegistry &&
      (!registries.defaultRegistry.uri ||
        registries.defaultRegistry.uri === NPM_REGISTRY ||
        NPM_REGISTRY.startsWith(registries.defaultRegistry.uri))
    ) {
      // TODO: this will not handle cases where you have token for private npm registries stored on npmjs
      // it should be handled by somehow in such case (default is npmjs and there is token for default) by sending the token of npmjs to the registry
      // (for example by setting some special header in the request)
      // then in the registry server it should be use it when proxies
      registries = registries.setDefaultRegistry(bitDefaultRegistry);
    }
    // Make sure @bit scope is register with alwaysAuth
    if (!bitScope || (bitScope && !bitScope.alwaysAuth)) {
      registries = registries.updateScopedRegistry('bit', bitDefaultRegistry);
    }

    registries = this.addAuthToScopedBitRegistries(registries, bitScope);
    return registries;
  }

  /**
   * This will mutate any registry which point to BIT_DEV_REGISTRY to have the auth config from the @bit scoped registry or from the user.token in bit's config
   */
  private addAuthToScopedBitRegistries(registries: Registries, bitScopeRegistry: Registry): Registries {
    const { bitOriginalAuthType, bitAuthHeaderValue, bitOriginalAuthValue } = this.getBitAuthConfig(bitScopeRegistry);
    const alwaysAuth = bitAuthHeaderValue !== undefined;
    let updatedRegistries = registries;
    Object.entries(registries.scopes).map(([name, registry]) => {
      if (!registry.authHeaderValue && BIT_DEV_REGISTRY.includes(registry.uri)) {
        const registryWithAuth = new Registry(
          registry.uri,
          alwaysAuth,
          bitAuthHeaderValue,
          bitOriginalAuthType,
          bitOriginalAuthValue
        );
        updatedRegistries = updatedRegistries.updateScopedRegistry(name, registryWithAuth);
      }
      return updatedRegistries;
    });
    return updatedRegistries;
  }

  private getBitAuthConfig(
    bitScopeRegistry: Registry
  ): Partial<{ bitOriginalAuthType: string; bitAuthHeaderValue: string; bitOriginalAuthValue: string }> {
    const bitGlobalConfigToken = this.globalConfig.getSync(CFG_USER_TOKEN_KEY);
    let bitAuthHeaderValue = bitScopeRegistry?.authHeaderValue;
    let bitOriginalAuthType = bitScopeRegistry?.originalAuthType;
    let bitOriginalAuthValue = bitScopeRegistry?.originalAuthValue;

    // In case there is no auth configuration in the npmrc, but there is token in bit config, take it from the config
    if ((!bitScopeRegistry || !bitScopeRegistry.authHeaderValue) && bitGlobalConfigToken) {
      bitOriginalAuthType = 'authToken';
      bitAuthHeaderValue = `Bearer ${bitGlobalConfigToken}`;
      bitOriginalAuthValue = bitGlobalConfigToken;
    }

    return {
      bitOriginalAuthType,
      bitAuthHeaderValue,
      bitOriginalAuthValue,
    };
  }

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  addToRootPolicy(entries: WorkspacePolicyEntry[], options?: WorkspacePolicyAddEntryOptions): WorkspacePolicy {
    const workspacePolicy = this.getWorkspacePolicyFromConfig();
    entries.forEach((entry) => workspacePolicy.add(entry, options));
    this.updateConfigPolicy(workspacePolicy);
    return workspacePolicy;
  }

  removeFromRootPolicy(dependencyIds: string[]) {
    const workspacePolicy = this.getWorkspacePolicyFromConfig();
    const workspacePolicyUpdated = workspacePolicy.remove(dependencyIds);
    this.updateConfigPolicy(workspacePolicyUpdated);
  }

  private updateConfigPolicy(workspacePolicy: WorkspacePolicy) {
    const workspacePolicyObject = workspacePolicy.toConfigObject();
    this.config.policy = workspacePolicyObject;
    this.configAspect.setExtension(DependencyResolverAspect.id, this.config, {
      overrideExisting: true,
      ignoreVersion: true,
    });
  }

  async persistConfig(workspaceDir?: string) {
    return this.configAspect.workspaceConfig?.write({ dir: workspaceDir });
  }

  /**
   * register new dependencies policies
   */
  registerDependenciesPolicies(policy: VariantPolicyConfigObject): void {
    return this.policiesRegistry.register(policy);
  }

  /**
   * register new dependencies policies
   */
  registerRootPolicy(policy: WorkspacePolicy): void {
    return this.rootPolicyRegistry.register(policy);
  }

  async getComponentEnvPolicyFromExtension(configuredExtensions: ExtensionDataList): Promise<EnvPolicy> {
    const env = this.envs.calculateEnvFromExtensions(configuredExtensions);
    const fromFile = await this.getEnvPolicyFromFile(env.id);
    if (fromFile) return fromFile;
    return this.getComponentEnvPolicyFromEnv(env.env);
  }

  async getEnvPolicyFromEnvId(id: ComponentID, legacyFiles?: SourceFile[]): Promise<EnvPolicy | undefined> {
    return this.getEnvPolicyFromEnvLegacyId(id._legacy, legacyFiles);
  }

  async getEnvPolicyFromEnvLegacyId(id: BitId, legacyFiles?: SourceFile[]): Promise<EnvPolicy | undefined> {
    const fromFile = await this.getEnvPolicyFromFile(id.toString(), legacyFiles);
    if (fromFile) return fromFile;
    const envDef = await this.envs.getEnvDefinitionByLegacyId(id);
    if (!envDef) return undefined;
    const env = envDef.env;
    return this.getComponentEnvPolicyFromEnv(env);
  }

  async getComponentEnvPolicy(component: Component): Promise<EnvPolicy> {
    // const envComponent = await this.envs.getEnvComponent(component);
    const fromFile = await this.getEnvPolicyFromFile(this.envs.getEnvId(component));
    if (fromFile) return fromFile;
    const env = this.envs.getEnv(component).env;
    return this.getComponentEnvPolicyFromEnv(env);
  }

  private async getEnvPolicyFromFile(envId: string, legacyFiles?: SourceFile[]): Promise<EnvPolicy | undefined> {
    const isCoreEnv = this.envs.isCoreEnv(envId);
    if (isCoreEnv) return undefined;
    let envJson;
    if (legacyFiles) {
      envJson = legacyFiles.find((file) => {
        return file.relative === 'env.jsonc' || file.relative === 'env.json';
      });
    } else {
      const envComponent = await this.envs.getEnvComponentByEnvId(envId, envId);
      envJson = envComponent.filesystem.files.find((file) => {
        return file.relative === 'env.jsonc' || file.relative === 'env.json';
      });
    }
    if (!envJson) return undefined;

    const object = parse(envJson.contents.toString('utf8'));
    const policy = object?.policy;
    if (!policy) return undefined;
    const allPoliciesFromEnv = EnvPolicy.fromConfigObject(policy);
    return allPoliciesFromEnv;
  }

  async getComponentEnvPolicyFromEnv(env: DependenciesEnv): Promise<EnvPolicy> {
    if (env.getDependencies && typeof env.getDependencies === 'function') {
      const policiesFromEnvConfig = await env.getDependencies();
      if (policiesFromEnvConfig) {
        const allPoliciesFromEnv = EnvPolicy.fromConfigObject(policiesFromEnvConfig);
        return allPoliciesFromEnv;
      }
    }
    return EnvPolicy.getEmpty();
  }

  async getComponentEnvPolicyFromEnvDefinition(envDef: EnvDefinition): Promise<EnvPolicy> {
    const fromFile = await this.getEnvPolicyFromFile(envDef.id);
    if (fromFile) return fromFile;
    return this.getComponentEnvPolicyFromEnv(envDef.env);
  }

  /**
   *
   * dependencies that will bundled as part of the env template and will configured as externals for the component bundle
   * these dependencies will be available in the preview on the window.
   * these dependencies will have only one instance on the page.
   * for dev server these dependencies will be aliased.
   * TODO: this should probably moved to the preview aspect. the main issue is that is used for dev server which can't bring the preview aspect.
   * @param env
   */
  async getPreviewHostDependenciesFromEnv(env: DependenciesEnv): Promise<string[]> {
    let hostDeps: string[] = [];
    if (env.getAdditionalHostDependencies && typeof env.getAdditionalHostDependencies === 'function') {
      hostDeps = await env.getAdditionalHostDependencies();
    }
    return uniq(hostDeps);
  }

  /**
   * Merge the dependencies provided by:
   * 1. envs configured in the component - via dependencies method
   * 2. extensions that registered to the registerDependencyPolicy slot (and configured for the component)
   * 3. props defined by the user (they are the strongest one)
   * @param configuredExtensions
   */
  async mergeVariantPolicies(
    configuredExtensions: ExtensionDataList,
    id: BitId,
    legacyFiles?: SourceFile[]
  ): Promise<VariantPolicy> {
    let policiesFromSlots: VariantPolicy = VariantPolicy.getEmpty();
    let policiesFromConfig: VariantPolicy = VariantPolicy.getEmpty();
    const policiesFromEnv: VariantPolicy = await this.getComponentEnvPolicyFromExtension(configuredExtensions);
    const configuredIds = configuredExtensions.ids;
    const policiesTuples = this.policiesRegistry.toArray();
    configuredIds.forEach((extId) => {
      // TODO: change this way of search, once we have workspace as dep-resolver dependency
      // we can use something like:
      // const resolvedId = this.workspace.resolveComponentId(extId)
      // const currentPolicy = this.policiesRegistry.get(resolvedId.toString());
      // Only get props from configured extensions on this specific component
      const policyTupleToApply = policiesTuples.find(([policyRegistrar]) => {
        return policyRegistrar === extId || policyRegistrar.includes(extId);
      });

      if (policyTupleToApply && policyTupleToApply[1]) {
        const currentPolicy = VariantPolicy.fromConfigObject(policyTupleToApply[1], 'slots');
        policiesFromSlots = VariantPolicy.mergePolices([policiesFromSlots, currentPolicy]);
      }
    });
    const currentExtension = configuredExtensions.findExtension(DependencyResolverAspect.id);
    const currentConfig = currentExtension?.config as unknown as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = VariantPolicy.fromConfigObject(currentConfig.policy, 'config');
    }
    const policiesFromEnvForItself =
      (await this.getPoliciesFromEnvForItself(id, legacyFiles)) ?? VariantPolicy.getEmpty();

    const result = VariantPolicy.mergePolices([
      policiesFromEnv,
      policiesFromEnvForItself,
      policiesFromSlots,
      policiesFromConfig,
    ]);
    return result;
  }

  /**
   * These are the policies that the env itself defines for itself.
   * So policies installed only locally for the env, not to any components that use the env.
   */
  async getPoliciesFromEnvForItself(id: BitId, legacyFiles?: SourceFile[]): Promise<VariantPolicy | undefined> {
    const envPolicy = await this.getEnvPolicyFromEnvLegacyId(id, legacyFiles);
    return envPolicy?.selfPolicy;
  }

  updateDepsOnLegacyTag(component: LegacyComponent, idTransformer: onTagIdTransformer): LegacyComponent {
    const entry = component.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return component;
    }
    const dependencies = get(entry, ['data', 'dependencies'], []);
    dependencies.forEach((dep) => {
      if (dep.__type === COMPONENT_DEP_TYPE) {
        const depId = new BitId(dep.componentId);
        const newDepId = idTransformer(depId);
        dep.componentId = (newDepId || depId).serialize();
        dep.id = (newDepId || depId).toString();
        dep.version = (newDepId || depId).version;
      }
    });
    return component;
  }

  updateDepsOnLegacyExport(version: VersionModel, idTransformer: OnExportIdTransformer): VersionModel {
    const entry = version.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return version;
    }
    const dependencies = get(entry, ['data', 'dependencies'], []);
    dependencies.forEach((dep) => {
      if (dep.__type === COMPONENT_DEP_TYPE) {
        const depId = new BitId(dep.componentId);
        const newDepId = idTransformer(depId);
        dep.componentId = (newDepId || depId).serialize();
        dep.id = (newDepId || depId).toString();
      }
    });
    return version;
  }

  /**
   * Register a new dependency detector. Detectors allow to extend Bit's dependency detection
   * mechanism to support new file extensions and types.
   */
  registerDetector(detector: DependencyDetector) {
    DetectorHook.hooks.push(detector);
    return this;
  }

  /**
   * This function registered to the onLoadRequireableExtensionSlot of the aspect-loader
   * Update the aspect / manifest deps versions in the runtimes (recursively)
   * This function mutate the manifest directly as otherwise it becomes very complicated
   * TODO: think if this funciton should be here as it about dependencies, or on the aspect loader
   * (as it's aware of the internal structure of aspects)
   * Maybe only register the dep resolution part to the aspect loader
   * at the moment it here for simplify the process
   * @param requireableExtension
   * @param manifest
   * @returns
   */
  async onLoadRequireableExtensionSubscriber(
    requireableExtension: RequireableComponent,
    manifest: ExtensionManifest | Aspect
  ): Promise<ExtensionManifest | Aspect> {
    const parentComponent = requireableExtension.component;
    return this.resolveRequireableExtensionManifestDepsVersionsRecursively(parentComponent, manifest);
  }

  /**
   * Update the aspect / manifest deps versions in the runtimes (recursively)
   * @param parentComponent
   * @param manifest
   */
  private async resolveRequireableExtensionManifestDepsVersionsRecursively(
    // Allow getting here string for lazy load the component
    // we only want to load the component in case there are deps to resolve
    parentComponent: Component | string,
    manifest: ExtensionManifest | Aspect
    // TODO: add visited = new Map() for performence improve
  ): Promise<ExtensionManifest | Aspect> {
    // Not resolve it immediately for performance sake
    let resolvedParentComponent: Component | undefined;
    let resolvedParentDeps: DependencyList;
    const updateDirectDepsVersions = (deps: Array<ExtensionManifest | Aspect>): Promise<void[]> => {
      return mapSeries(deps, async (dep) => {
        // Nothing to update (this shouldn't happen ever)
        if (!dep.id) return;
        // In case of core aspect, do not update the version, as it's loaded to harmony without version
        if (this.aspectLoader.isCoreAspect(dep.id)) return;
        // Lazily get the parent component
        if (typeof parentComponent === 'string') {
          const parentComponentId = await this.componentAspect.getHost().resolveComponentId(parentComponent);
          resolvedParentComponent = await this.componentAspect.getHost().get(parentComponentId);
        } else {
          // it's of type component;
          resolvedParentComponent = parentComponent;
        }
        if (!resolvedParentComponent) {
          this.logger.error(
            `could not resolve the component ${parentComponent} during manifest deps resolution. it shouldn't happen`
          );
          return;
        }
        // Lazily get the dependencies
        resolvedParentDeps = resolvedParentDeps || (await this.getDependencies(resolvedParentComponent));
        const resolvedDep = resolvedParentDeps.findDependency(dep.id, { ignoreVersion: true });
        dep.id = resolvedDep?.id ?? dep.id;
        await this.resolveRequireableExtensionManifestDepsVersionsRecursively(dep.id, dep);
      });
    };
    if (manifest.dependencies) {
      manifest.dependencies = manifest.dependencies.map((dep) => this.aspectLoader.cloneManifest(dep));
      await updateDirectDepsVersions(manifest.dependencies);
    }
    // @ts-ignore
    if (manifest?._runtimes) {
      // @ts-ignore
      await mapSeries(manifest?._runtimes, async (runtime: RuntimeManifest) => {
        if (runtime.dependencies) {
          runtime.dependencies = runtime.dependencies.map((dep) => this.aspectLoader.cloneManifest(dep));
          await updateDirectDepsVersions(runtime.dependencies);
        }
      });
    }

    return manifest;
  }

  /**
   * Return a list of outdated policy dependencies.
   */
  async getOutdatedPkgsFromPolicies({
    rootDir,
    variantPoliciesByPatterns,
    componentPoliciesById,
    components,
  }: {
    rootDir: string;
    variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
    componentPoliciesById: Record<string, any>;
    components: Component[];
  }): Promise<OutdatedPkg[]> {
    const componentModelVersions: ComponentModelVersion[] = (
      await Promise.all(
        components.map(async (component) => {
          const depList = await this.getDependencies(component);
          return depList
            .filter(
              (dep) =>
                typeof dep.getPackageName === 'function' &&
                // If the dependency is referenced not via a valid range it means that it wasn't yet published to the registry
                semver.validRange(dep.version) != null &&
                !dep['isExtension'] && // eslint-disable-line
                dep.lifecycle !== 'peer'
            )
            .map((dep) => ({
              name: dep.getPackageName!(), // eslint-disable-line
              version: dep.version,
              componentId: component.id.toString(),
              lifecycleType: dep.lifecycle,
            }));
        })
      )
    ).flat();
    const allPkgs = getAllPolicyPkgs({
      rootPolicy: this.getWorkspacePolicyFromConfig(),
      variantPoliciesByPatterns,
      componentPoliciesById,
      componentModelVersions,
    });
    return this.getOutdatedPkgs(rootDir, allPkgs);
  }

  /**
   * Accepts a list of package dependency policies and returns a list of outdated policies extended with their "latestRange"
   */
  async getOutdatedPkgs<T>(
    rootDir: string,
    pkgs: Array<{ name: string; currentRange: string } & T>
  ): Promise<Array<{ name: string; currentRange: string; latestRange: string } & T>> {
    this.logger.setStatusLine('checking the latest versions of dependencies');
    const resolver = await this.getVersionResolver();
    const resolve = async (spec: string) =>
      (
        await resolver.resolveRemoteVersion(spec, {
          rootDir,
        })
      ).version;
    const outdatedPkgs = (
      await Promise.all(
        pkgs.map(async (pkg) => {
          const latestVersion = await resolve(`${pkg.name}@latest`);
          return {
            ...pkg,
            latestRange: latestVersion ? repeatPrefix(pkg.currentRange, latestVersion) : null,
          } as any;
        })
      )
    ).filter(({ latestRange, currentRange }) => latestRange != null && latestRange !== currentRange);
    this.logger.consoleSuccess();
    return outdatedPkgs;
  }

  /**
   * Update the specified packages to their latest versions in all policies;
   * root polcies, variant pocilicies, and component configuration policies (component.json).
   */
  applyUpdates(
    outdatedPkgs: Array<Omit<OutdatedPkg, 'currentRange'>>,
    options: {
      variantPoliciesByPatterns: Record<string, any>;
      componentPoliciesById: Record<string, any>;
    }
  ): {
    updatedVariants: string[];
    updatedComponents: string[];
  } {
    const { updatedVariants, updatedComponents, updatedWorkspacePolicyEntries } = applyUpdates(outdatedPkgs, {
      variantPoliciesByPatterns: options.variantPoliciesByPatterns,
      componentPoliciesById: options.componentPoliciesById,
    });
    this.addToRootPolicy(updatedWorkspacePolicyEntries, {
      updateExisting: true,
    });
    return {
      updatedVariants,
      updatedComponents,
    };
  }

  static runtime = MainRuntime;
  static dependencies = [
    EnvsAspect,
    LoggerAspect,
    ConfigAspect,
    AspectLoaderAspect,
    ComponentAspect,
    GraphqlAspect,
    GlobalConfigAspect,
  ];

  static slots = [
    Slot.withType<WorkspacePolicy>(),
    Slot.withType<VariantPolicyConfigObject>(),
    Slot.withType<PackageManager>(),
    Slot.withType<RegExp>(),
    Slot.withType<DependencyFactory>(),
    Slot.withType<PreInstallSubscriberList>(),
    Slot.withType<PostInstallSubscriberList>(),
    Slot.withType<DependencyDetector>(),
  ];

  static defaultConfig: DependencyResolverWorkspaceConfig &
    Required<Pick<DependencyResolverWorkspaceConfig, 'linkCoreAspects'>> = {
    /**
     * default package manager.
     */
    packageManager: 'teambit.dependencies/pnpm',
    policy: {},
    linkCoreAspects: true,
  };

  static async provider(
    [envs, loggerExt, configMain, aspectLoader, componentAspect, graphql, globalConfig]: [
      EnvsMain,
      LoggerMain,
      ConfigMain,
      AspectLoaderMain,
      ComponentMain,
      GraphqlMain,
      GlobalConfigMain
    ],
    config: DependencyResolverWorkspaceConfig,
    [
      rootPolicyRegistry,
      policiesRegistry,
      packageManagerSlot,
      dependencyFactorySlot,
      preInstallSlot,
      postInstallSlot,
    ]: [
      RootPolicyRegistry,
      PoliciesRegistry,
      PackageManagerSlot,
      DependencyFactorySlot,
      PreInstallSlot,
      PostInstallSlot
    ]
  ) {
    // const packageManager = new PackageManagerLegacy(config.packageManager, logger);
    const logger = loggerExt.createLogger(DependencyResolverAspect.id);
    const dependencyResolver = new DependencyResolverMain(
      config,
      rootPolicyRegistry,
      policiesRegistry,
      envs,
      logger,
      configMain,
      aspectLoader,
      globalConfig,
      componentAspect,
      packageManagerSlot,
      dependencyFactorySlot,
      preInstallSlot,
      postInstallSlot
    );

    componentAspect.registerShowFragments([
      new DependenciesFragment(dependencyResolver),
      new DevDependenciesFragment(dependencyResolver),
      new PeerDependenciesFragment(dependencyResolver),
    ]);
    // TODO: solve this generics issue and remove the ts-ignore
    // @ts-ignore
    dependencyResolver.registerDependencyFactories([new ComponentDependencyFactory(componentAspect)]);

    DependencyResolver.getDepResolverAspectName = () => DependencyResolverAspect.id;

    LegacyComponent.registerOnComponentOverridesLoading(
      DependencyResolverAspect.id,
      async (configuredExtensions: ExtensionDataList, id: BitId, legacyFiles: SourceFile[]) => {
        const policy = await dependencyResolver.mergeVariantPolicies(configuredExtensions, id, legacyFiles);
        return policy.toLegacyDepsOverrides();
      }
    );
    DependencyResolver.registerWorkspacePolicyGetter(() => {
      const workspacePolicy = dependencyResolver.getWorkspacePolicy();
      return workspacePolicy.toManifest();
    });
    DependencyResolver.registerOnComponentAutoDetectOverridesGetter(
      async (configuredExtensions: ExtensionDataList, id: BitId, legacyFiles: SourceFile[]) => {
        const policy = await dependencyResolver.mergeVariantPolicies(configuredExtensions, id, legacyFiles);
        return policy.toLegacyAutoDetectOverrides();
      }
    );

    DependencyResolver.registerHarmonyEnvPeersPolicyForEnvItselfGetter(async (id: BitId, files: SourceFile[]) => {
      const envPolicy = await dependencyResolver.getEnvPolicyFromEnvLegacyId(id, files);
      if (!envPolicy) return undefined;
      return envPolicy.selfPolicy.toVersionManifest();
    });
    aspectLoader.registerOnLoadRequireableExtensionSlot(
      dependencyResolver.onLoadRequireableExtensionSubscriber.bind(dependencyResolver)
    );

    graphql.register(dependencyResolverSchema(dependencyResolver));
    envs.registerService(new DependenciesService());

    return dependencyResolver;
  }

  getEmptyDepsObject(): ManifestDependenciesObject {
    return {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
  }

  /**
   * Returns a list of target locations where that given component was hard linked to.
   *
   * @param rootDir - The root directory of the workspace
   * @param componentDir - Relative path to the component's directory
   * @param packageName - The injected component's packageName
   */
  async getInjectedDirs(rootDir: string, componentDir: string, packageName: string): Promise<string[]> {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    if (typeof packageManager?.getInjectedDirs === 'function') {
      return packageManager.getInjectedDirs(rootDir, componentDir, packageName);
    }
    return [];
  }
}

DependencyResolverAspect.addRuntime(DependencyResolverMain);

function repeatPrefix(originalSpec: string, newVersion: string): string {
  switch (originalSpec[0]) {
    case '~':
    case '^':
      return `${originalSpec[0]}${newVersion}`;
    default:
      return newVersion;
  }
}
