import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import type { Config } from '@teambit/config';
import { get } from 'lodash';
import { ConfigAspect } from '@teambit/config';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { LoggerMain } from '@teambit/logger';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect } from '@teambit/logger';
import { CFG_PACKAGE_MANAGER_CACHE, CFG_USER_TOKEN_KEY } from '@teambit/legacy/dist/constants';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { DependencyResolver } from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { DetectorHook } from '@teambit/legacy/dist/consumer/component/dependencies/files-dependency-builder/detector-hook';
import { Http, ProxyConfig } from '@teambit/legacy/dist/scope/network/http';
import {
  registerUpdateDependenciesOnTag,
  onTagIdTransformer,
} from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import {
  registerUpdateDependenciesOnExport,
  OnExportIdTransformer,
} from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { Version as VersionModel } from '@teambit/legacy/dist/scope/models';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import fs from 'fs-extra';
import { BitId } from '@teambit/legacy-bit-id';
import { flatten } from 'ramda';
import { SemVer } from 'semver';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import GlobalConfigAspect, { GlobalConfigMain } from '@teambit/global-config';
import { Registries, Registry } from './registry';
import { ROOT_NAME } from './dependencies/constants';
import { DependencyInstaller, PreInstallSubscriberList, PostInstallSubscriberList } from './dependency-installer';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { DependencyVersionResolver } from './dependency-version-resolver';
import { DependencyLinker, LinkingOptions } from './dependency-linker';
import { PackageManagerNotFound } from './exceptions';
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
  VariantPolicyFactory,
  WorkspacePolicyAddEntryOptions,
  WorkspacePolicyEntry,
  SerializedVariantPolicy,
} from './policy';
import { PackageManager } from './package-manager';

import {
  SerializedDependency,
  DependencyListFactory,
  DependencyFactory,
  ComponentDependencyFactory,
  COMPONENT_DEP_TYPE,
  DependencyList,
} from './dependencies';
import { DependenciesFragment, DevDependenciesFragment, PeerDependenciesFragment } from './show-fragments';
import { dependencyResolverSchema } from './dependency-resolver.graphql';
import { DependencyDetector } from './dependency-detector';

export const BIT_DEV_REGISTRY = 'https://node.bit.dev/';
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

export { ProxyConfig } from '@teambit/legacy/dist/scope/network/http';

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
   * If true, then Bit will add the "--strict-peer-dependencies" option when invoking package managers.
   * This causes "bit install" to fail if there are unsatisfied peer dependencies, which is
   * an invalid state that can cause build failures or incompatible dependency versions.
   * (For historical reasons, JavaScript package managers generally do not treat this invalid
   * state as an error.)
   *
   * The default value is false to avoid legacy compatibility issues.
   * It is strongly recommended to set strictPeerDependencies=true.
   */
  strictPeerDependencies: boolean;
  /**
   * map of extra arguments to pass to the configured package manager upon the installation
   * of dependencies.
   */
  packageManagerArgs: string[];

  /**
   * regex to determine whether a file is a file meant for development purposes.
   */
  devFilePatterns: string[];
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

export type GetVersionResolverOptions = {
  cacheRootDirectory?: string;
};

const defaultLinkingOptions: LinkingOptions = {
  legacyLink: true,
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

    private configAspect: Config,

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

  async getPolicy(component: Component): Promise<VariantPolicy> {
    const entry = component.state.aspects.get(DependencyResolverAspect.id);
    const factory = new VariantPolicyFactory();
    if (!entry) {
      return factory.getEmpty();
    }
    const serializedPolicy: SerializedVariantPolicy = get(entry, ['data', 'policy'], []);
    return factory.parse(serializedPolicy);
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
  async extractDepsFromLegacy(component: Component): Promise<SerializedDependency[]> {
    const legacyComponent: LegacyComponent = component.state._consumer;
    const listFactory = this.getDependencyListFactory();
    const dependencyList = await listFactory.fromLegacyComponent(legacyComponent);
    return dependencyList.serialize();
  }

  private getDependencyListFactory(): DependencyListFactory {
    const factories = flatten(this.dependencyFactorySlot.values());
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
  async getDependencies(component: Component): Promise<DependencyList> {
    const entry = component.state.aspects.get(DependencyResolverAspect.id);
    if (!entry) {
      return DependencyList.fromArray([]);
    }
    const serializedDependencies: SerializedDependency[] = get(entry, ['data', 'dependencies'], []);
    return this.getDependenciesFromSerializedDependencies(serializedDependencies);
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
    const concreteOpts = { ...defaultCreateFromComponentsOptions, ...options };
    const workspaceManifestFactory = new WorkspaceManifestFactory(this);
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
      options.rootDir,
      cacheRootDir,
      preInstallSubscribers,
      postInstallSubscribers
    );
  }

  private getPreInstallSubscribers(): PreInstallSubscriberList {
    return flatten(this.preInstallSlot.values());
  }

  private getPostInstallSubscribers(): PostInstallSubscriberList {
    return flatten(this.postInstallSlot.values());
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

  getVersionResolver(options: GetVersionResolverOptions = {}) {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    const cacheRootDir = options.cacheRootDirectory || this.globalConfig.getSync(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.config.packageManager);
    }

    if (cacheRootDir && !fs.pathExistsSync(cacheRootDir)) {
      this.logger.debug(`creating package manager cache dir at ${cacheRootDir}`);
      fs.ensureDirSync(cacheRootDir);
    }
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyVersionResolver(packageManager, cacheRootDir);
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
      ca: this.config.ca,
      cert: this.config.cert,
      httpProxy: this.config.proxy,
      httpsProxy: this.config.httpsProxy || this.config.proxy,
      key: this.config.key,
      noProxy: this.config.noProxy,
      strictSSL: this.config.strictSsl?.toLowerCase() === 'true',
    };
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

  private async getProxyConfigFromGlobalConfig(): Promise<ProxyConfig> {
    return Http.getProxyConfig();
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
      const bitGlobalConfigToken = this.globalConfig.getSync(CFG_USER_TOKEN_KEY);

      const bitRegistry = bitScope?.uri || BIT_DEV_REGISTRY;

      let bitAuthHeaderValue = bitScope?.authHeaderValue;
      let bitOriginalAuthType = bitScope?.originalAuthType;
      let bitOriginalAuthValue = bitScope?.originalAuthValue;

      // In case there is no auth configuration in the npmrc, but there is token in bit config, take it from the config
      if ((!bitScope || !bitScope.authHeaderValue) && bitGlobalConfigToken) {
        bitOriginalAuthType = 'authToken';
        bitAuthHeaderValue = `Bearer ${bitGlobalConfigToken}`;
        bitOriginalAuthValue = bitGlobalConfigToken;
      }

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

    // Override default registry to use bit registry in case npmjs is the default - bit registry will proxy it
    // We check also NPM_REGISTRY.startsWith because the uri might not have the trailing / we have in NPM_REGISTRY
    if (
      !registries.defaultRegistry.uri ||
      registries.defaultRegistry.uri === NPM_REGISTRY ||
      NPM_REGISTRY.startsWith(registries.defaultRegistry.uri)
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

    return registries;
  }

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  addToRootPolicy(entries: WorkspacePolicyEntry[], options?: WorkspacePolicyAddEntryOptions): WorkspacePolicy {
    const workspacePolicy = this.getWorkspacePolicyFromConfig();
    entries.forEach((entry) => workspacePolicy.add(entry, options));
    const workspacePolicyObject = workspacePolicy.toConfigObject();
    this.config.policy = workspacePolicyObject;
    this.configAspect.setExtension(DependencyResolverAspect.id, this.config, {
      overrideExisting: true,
      ignoreVersion: true,
    });
    return workspacePolicy;
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

  /**
   * Merge the dependencies provided by:
   * 1. envs configured in the component - via dependencies method
   * 2. extensions that registered to the registerDependencyPolicy slot (and configured for the component)
   * 3. props defined by the user (they are the strongest one)
   * @param configuredExtensions
   */
  async mergeVariantPolicies(configuredExtensions: ExtensionDataList): Promise<VariantPolicy> {
    const variantPolicyFactory = new VariantPolicyFactory();
    let policiesFromEnv: VariantPolicy = variantPolicyFactory.getEmpty();
    let policiesFromSlots: VariantPolicy = variantPolicyFactory.getEmpty();
    let policiesFromConfig: VariantPolicy = variantPolicyFactory.getEmpty();
    const env = this.envs.calculateEnvFromExtensions(configuredExtensions).env;
    if (env.getDependencies && typeof env.getDependencies === 'function') {
      const policiesFromEnvConfig = await env.getDependencies();
      if (policiesFromEnvConfig) {
        policiesFromEnv = variantPolicyFactory.fromConfigObject(policiesFromEnvConfig);
      }
    }
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
        const currentPolicy = variantPolicyFactory.fromConfigObject(policyTupleToApply[1]);
        policiesFromSlots = VariantPolicy.mergePolices([policiesFromSlots, currentPolicy]);
      }
    });
    const currentExtension = configuredExtensions.findExtension(DependencyResolverAspect.id);
    const currentConfig = (currentExtension?.config as unknown) as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = variantPolicyFactory.fromConfigObject(currentConfig.policy);
    }
    const result = VariantPolicy.mergePolices([policiesFromEnv, policiesFromSlots, policiesFromConfig]);
    return result;
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

  static defaultConfig: DependencyResolverWorkspaceConfig = {
    /**
     * default package manager.
     */
    packageManager: 'teambit.dependencies/pnpm',
    policy: {},
    packageManagerArgs: [],
    devFilePatterns: ['**/*.spec.ts'],
    strictPeerDependencies: true,
  };

  static async provider(
    [envs, loggerExt, configMain, aspectLoader, componentAspect, graphql, globalConfig]: [
      EnvsMain,
      LoggerMain,
      Config,
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
      async (configuredExtensions: ExtensionDataList) => {
        const policy = await dependencyResolver.mergeVariantPolicies(configuredExtensions);
        return policy.toLegacyDepsOverrides();
      }
    );
    DependencyResolver.registerWorkspacePolicyGetter(() => {
      const workspacePolicy = dependencyResolver.getWorkspacePolicy();
      return workspacePolicy.toManifest();
    });
    registerUpdateDependenciesOnTag(dependencyResolver.updateDepsOnLegacyTag.bind(dependencyResolver));
    registerUpdateDependenciesOnExport(dependencyResolver.updateDepsOnLegacyExport.bind(dependencyResolver));

    graphql.register(dependencyResolverSchema(dependencyResolver));

    return dependencyResolver;
  }

  getEmptyDepsObject(): ManifestDependenciesObject {
    return {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
  }
}

DependencyResolverAspect.addRuntime(DependencyResolverMain);
