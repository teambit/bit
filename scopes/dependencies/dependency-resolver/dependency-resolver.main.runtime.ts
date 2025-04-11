import multimatch from 'multimatch';
import { isSnap } from '@teambit/component-version';
import mapSeries from 'p-map-series';
import { DEPS_GRAPH, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';
import { MainRuntime } from '@teambit/cli';
import { getRootComponentDir } from '@teambit/workspace.root-components';
import { ComponentAspect, Component, ComponentMap, ComponentMain, IComponent } from '@teambit/component';
import type { ConfigMain } from '@teambit/config';
import { join, relative } from 'path';
import { compact, get, pick, uniq, omit, cloneDeep } from 'lodash';
import { ConfigAspect } from '@teambit/config';
import { EnvsAspect } from '@teambit/envs';
import type { DependenciesEnv, EnvDefinition, EnvJsonc, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry, ExtensionManifest, Aspect, RuntimeManifest } from '@teambit/harmony';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import type { LoggerMain } from '@teambit/logger';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect } from '@teambit/logger';
import {
  CFG_PACKAGE_MANAGER_CACHE,
  CFG_REGISTRY_URL_KEY,
  CFG_USER_TOKEN_KEY,
  CFG_ISOLATED_SCOPE_CAPSULES,
  DEFAULT_HARMONY_PACKAGE_MANAGER,
  getCloudDomain,
} from '@teambit/legacy.constants';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { DetectorHook } from '@teambit/dependencies';
import { Http, ProxyConfig, NetworkConfig } from '@teambit/scope.network';
import { onTagIdTransformer } from '@teambit/snapping';
import {
  ConsumerComponent as LegacyComponent,
  Dependency as LegacyDependency,
} from '@teambit/legacy.consumer-component';
import fs from 'fs-extra';
import { ComponentID } from '@teambit/component-id';
import { readCAFileSync } from '@pnpm/network.ca-file';
import { SourceFile } from '@teambit/component.sources';
import { ProjectManifest, DependencyManifest } from '@pnpm/types';
import semver, { SemVer } from 'semver';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import { Registries, Registry } from '@teambit/pkg.entities.registry';
import { applyUpdates, UpdatedComponent } from './apply-updates';
import { ROOT_NAME } from './dependencies/constants';
import {
  DependencyInstaller,
  PreInstallSubscriberList,
  PostInstallSubscriberList,
  DepInstallerContext,
} from './dependency-installer';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { DependencyVersionResolver } from './dependency-version-resolver';
import { DepLinkerContext, DependencyLinker, LinkingOptions } from './dependency-linker';
import { DependencyResolverWorkspaceConfig, NodeLinker } from './dependency-resolver-workspace-config';
import { ComponentModelVersion, getAllPolicyPkgs, OutdatedPkg, CurrentPkgSource } from './get-all-policy-pkgs';
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
import { ConfigStoreAspect, ConfigStoreMain } from '@teambit/config-store';

export const BIT_CLOUD_REGISTRY = `https://node-registry.${getCloudDomain()}/`;
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

export { ProxyConfig, NetworkConfig } from '@teambit/scope.network';

export interface DependencyResolverComponentData {
  packageName: string;
  policy: SerializedVariantPolicy;
  dependencies: SerializedDependency[];
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
type AddPackagesToLink = () => string[];
type AddPackagesToLinkSlot = SlotRegistry<AddPackagesToLink>;

export type MergeDependenciesFunc = (configuredExtensions: ExtensionDataList) => Promise<VariantPolicyConfigObject>;

export type GetInstallerOptions = {
  rootDir?: string;
  packageManager?: string;
  cacheRootDirectory?: string;
  installingContext?: DepInstallerContext;
  nodeLinker?: NodeLinker;
};

export type GetLinkerOptions = {
  rootDir?: string;
  linkingOptions?: LinkingOptions;
  linkingContext?: DepLinkerContext;
};

export type GetDependenciesOptions = {
  includeHidden?: boolean;
};

export type GetVersionResolverOptions = {
  cacheRootDirectory?: string;
};

const defaultLinkingOptions: LinkingOptions = {
  linkTeambitBit: true,
  linkCoreAspects: true,
};

const defaultCreateFromComponentsOptions: CreateFromComponentsOptions = {
  filterComponentsFromManifests: true,
  createManifestForComponentsWithoutDependencies: true,
};

export class DependencyResolverMain {
  /**
   * cache the workspace policy to improve performance. when workspace.jsonc is changed, this gets cleared.
   * @see workspace.triggerOnWorkspaceConfigChange
   */
  private _workspacePolicy: WorkspacePolicy | undefined;
  private _additionalPackagesToLink?: string[];
  constructor(
    /**
     * Dependency resolver  extension configuration.
     */
    public config: DependencyResolverWorkspaceConfig,

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

    private configStore: ConfigStoreMain,

    /**
     * component aspect.
     */
    readonly componentAspect: ComponentMain,

    private packageManagerSlot: PackageManagerSlot,

    private dependencyFactorySlot: DependencyFactorySlot,

    private preInstallSlot: PreInstallSlot,

    private postInstallSlot: PostInstallSlot,

    private addPackagesToLinkSlot: AddPackagesToLinkSlot,
  ) {}

  /**
   * Save list of envs that doesn't contains env.jsonc file
   * this is used to show warning / instuctions to the user
   */
  public envsWithoutManifest = new Set<string>();

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
    const packageManager = this.getPackageManager();
    return packageManager?.supportsDedupingOnExistingRoot?.() === true && !this.isolatedCapsules();
  }

  setConfig(config: DependencyResolverWorkspaceConfig) {
    this.config = config;
  }

  hasRootComponents(): boolean {
    return Boolean(this.config.rootComponents);
  }

  isolatedCapsules(): boolean {
    const globalConfig = this.configStore.getConfig(CFG_ISOLATED_SCOPE_CAPSULES);
    // @ts-ignore
    const defaultVal = globalConfig !== undefined ? globalConfig === true || globalConfig === 'true' : true;
    const res = this.config.isolatedCapsules ?? defaultVal;
    return res;
  }

  harmonyVersionInRootPolicy(): string | undefined {
    const rootPolicy = this.getWorkspacePolicyFromConfig();
    return rootPolicy.entries.find(({ dependencyId }) => dependencyId === '@teambit/harmony')?.value?.version;
  }

  nodeLinker(packageManagerName?: string): NodeLinker {
    if (this.config.nodeLinker) return this.config.nodeLinker;
    const pmName = packageManagerName || this.config.packageManager;
    if (pmName === 'teambit.dependencies/yarn') return 'hoisted';
    return 'isolated';
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

  registerAddPackagesToLink(fn: AddPackagesToLink) {
    this.addPackagesToLinkSlot.register(fn);
  }

  getSavePrefix(): string {
    return this.config.savePrefix || '^';
  }

  getVersionWithSavePrefix({
    version,
    overridePrefix,
    wantedRange,
  }: {
    version: string;
    overridePrefix?: string;
    wantedRange?: string;
  }): string {
    // A prerelease version is always added as an exact version.
    // A package installed by its exact version is also added as an exact version.
    if (semver.parse(version)?.prerelease.length || wantedRange === version) {
      return version;
    }
    if (wantedRange && ['~', '^'].includes(wantedRange[0])) {
      return wantedRange;
    }
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
      let found = componentPolicy.find(dep.id);
      if (!found) {
        const packageName = dep?.getPackageName?.();
        found = packageName ? componentPolicy.find(packageName) : undefined;
      }
      // if no policy found, the dependency was auto-resolved from the source code
      dep.source = found?.source || 'auto';
      dep.hidden = found?.hidden;
      dep.optional = found?.optional;
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
  getDependencies(component: IComponent, { includeHidden = false }: GetDependenciesOptions = {}): DependencyList {
    const entry = component.get(DependencyResolverAspect.id);
    if (!entry) {
      return DependencyList.fromArray([]);
    }
    const serializedDependencies: SerializedDependency[] = entry?.data?.dependencies || [];
    const depList = this.getDependenciesFromSerializedDependencies(serializedDependencies);
    if (includeHidden) return depList;
    return depList.filterHidden();
  }

  getDependenciesFromLegacyComponent(
    component: LegacyComponent,
    { includeHidden = false }: GetDependenciesOptions = {}
  ) {
    const entry = component.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return DependencyList.fromArray([]);
    }
    const serializedDependencies: SerializedDependency[] = entry?.data?.dependencies || [];
    const depList = this.getDependenciesFromSerializedDependencies(serializedDependencies);
    if (includeHidden) return depList;
    return depList.filterHidden();
  }

  /**
   * returns only the dependencies that are bit-components.
   */
  getComponentDependencies(component: IComponent): ComponentDependency[] {
    const dependencyList = this.getDependencies(component);
    return dependencyList.getComponentDependencies();
  }

  getDependenciesFromSerializedDependencies(dependencies: SerializedDependency[]): DependencyList {
    if (!dependencies.length) {
      return DependencyList.fromArray([]);
    }
    const listFactory = this.getDependencyListFactory();
    const deps = listFactory.fromSerializedDependencies(dependencies);
    return deps;
  }

  /**
   * Getting the merged workspace policy (from dep resolver config and others like root package.json)
   */
  getWorkspacePolicy(): WorkspacePolicy {
    if (!this._workspacePolicy) {
      const policyFromConfig = this.getWorkspacePolicyFromConfig();
      const externalPolicies = this.rootPolicyRegistry.toArray().map(([, policy]) => policy);
      this._workspacePolicy = this.mergeWorkspacePolices([policyFromConfig, ...externalPolicies]);
    }
    return this._workspacePolicy;
  }

  getWorkspacePolicyManifest() {
    const workspacePolicy = this.getWorkspacePolicy();
    return workspacePolicy.toManifest();
  }

  clearCache() {
    this._workspacePolicy = undefined;
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

  getWorkspacePolicyFromConfigObject(obj: WorkspacePolicyConfigObject): WorkspacePolicy {
    const factory = new WorkspacePolicyFactory();
    return factory.fromConfigObject(obj);
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
    options: CreateFromComponentsOptions = defaultCreateFromComponentsOptions,
    context: DepInstallerContext = {}
  ): Promise<WorkspaceManifest> {
    const statusMessage = context?.inCapsule
      ? `(capsule) deduping dependencies for installation in root dir ${rootDir}`
      : 'deduping dependencies for installation';
    if (!context?.inCapsule) {
      this.logger.setStatusLine(statusMessage);
    }
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
    if (!context?.inCapsule) {
      this.logger.consoleSuccess();
    }
    return res;
  }

  /**
   * get the package name of a component.
   */
  getPackageName(component: Component): string {
    return this.getDepResolverData(component)?.packageName ?? this.calcPackageName(component);
  }

  createComponentIdByPkgNameMap(components: Component[]): Map<string, ComponentID> {
    const componentIdByPkgName = new Map<string, ComponentID>();
    for (const component of components) {
      componentIdByPkgName.set(this.getPackageName(component), component.id);
    }
    return componentIdByPkgName;
  }

  getDepResolverData(component: Component): DependencyResolverComponentData | undefined {
    return component.state.aspects.get(DependencyResolverAspect.id)?.data as DependencyResolverComponentData;
  }

  calcPackageName(component: Component): string {
    return componentIdToPackageName(component.state._consumer);
  }

  /*
   * Returns the location where the component is installed with its peer dependencies
   * This is used in cases you want to actually run the components and make sure all the dependencies (especially peers) are resolved correctly
   */
  getRuntimeModulePath(
    component: Component,
    options: {
      workspacePath: string;
      rootComponentsPath: string;
      isInWorkspace?: boolean;
    }
  ) {
    if (!this.hasRootComponents()) {
      const modulePath = this.getModulePath(component);
      return modulePath;
    }
    const pkgName = this.getPackageName(component);
    const rootComponentsRelativePath = relative(options.workspacePath, options.rootComponentsPath);
    const getRelativeRootComponentDir = getRootComponentDir.bind(null, rootComponentsRelativePath ?? '');
    const selfRootDir = getRelativeRootComponentDir(
      options.isInWorkspace ? component.id.toStringWithoutVersion() : component.id.toString()
    );
    // In case the component is it's own root we want to load it from it's own root folder
    if (fs.pathExistsSync(selfRootDir)) {
      const innerDir = join(selfRootDir, 'node_modules', pkgName);
      if (fs.pathExistsSync(innerDir)) return innerDir;
      // sometime for the env itself we don't have the env package in the env root dir, because it was hoisted
      // in that case we return the dir from the root node_modules
      return this.getModulePath(component);
    }
    const dirInEnvRoot = join(this.getComponentDirInBitRoots(component, options), 'node_modules', pkgName);
    if (fs.pathExistsSync(dirInEnvRoot)) return dirInEnvRoot;
    return this.getModulePath(component);
  }

  getComponentDirInBitRoots(
    component: Component,
    options: {
      workspacePath: string;
      rootComponentsPath: string;
    }
  ) {
    const envId = this.envs.getEnvId(component);
    const rootComponentsRelativePath = relative(options.workspacePath, options.rootComponentsPath);
    return getRootComponentDir(rootComponentsRelativePath ?? '', envId);
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

  async addDependenciesGraph(
    component: Component,
    componentRelativeDir: string,
    options: {
      rootDir: string;
      rootComponentsPath?: string;
      componentIdByPkgName: Map<string, ComponentID>;
    }
  ): Promise<void> {
    try {
      component.state._consumer.dependenciesGraph = await this.getPackageManager()?.calcDependenciesGraph?.({
        rootDir: options.rootDir,
        componentRootDir: options.rootComponentsPath
          ? this.getComponentDirInBitRoots(component, {
              workspacePath: options.rootDir,
              rootComponentsPath: options.rootComponentsPath,
            })
          : undefined,
        pkgName: this.getPackageName(component),
        componentRelativeDir,
        componentIdByPkgName: options.componentIdByPkgName,
      });
    } catch (err) {
      // If the dependencies graph feature is disabled, we ignore the error
      if (isFeatureEnabled(DEPS_GRAPH)) {
        throw err;
      }
    }
  }

  /**
   * get a component dependency installer.
   */
  getInstaller(options: GetInstallerOptions = {}) {
    const packageManagerName = options.packageManager || this.packageManagerName;
    const packageManager = this.packageManagerSlot.get(packageManagerName);
    const cacheRootDir = options.cacheRootDirectory || this.configStore.getConfig(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.packageManagerName);
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
      options.nodeLinker || this.nodeLinker(packageManagerName),
      this.config.packageImportMethod,
      this.config.sideEffectsCache,
      this.config.nodeVersion,
      this.config.engineStrict,
      this.config.peerDependencyRules,
      this.config.neverBuiltDependencies,
      this.config.preferOffline,
      options.installingContext
    );
  }

  private getPreInstallSubscribers(): PreInstallSubscriberList {
    return this.preInstallSlot.values().flat();
  }

  private getPostInstallSubscribers(): PostInstallSubscriberList {
    return this.postInstallSlot.values().flat();
  }

  private getAdditionalPackagesToLink(): string[] {
    if (!this._additionalPackagesToLink) {
      const additionalPackagesToLinkFn = this.addPackagesToLinkSlot.values().flat();
      this._additionalPackagesToLink = additionalPackagesToLinkFn.map((fn) => fn()).flat();
    }

    return this._additionalPackagesToLink;
  }

  /**
   * get a component dependency linker.
   */
  getLinker(options: GetLinkerOptions = {}) {
    const additionalPackagesToLink = this.getAdditionalPackagesToLink();
    const linkingOptions = Object.assign({ additionalPackagesToLink },
      defaultLinkingOptions, options?.linkingOptions || {});
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyLinker(
      this,
      this.aspectLoader,
      this.componentAspect,
      this.envs,
      this.logger,
      options.rootDir,
      linkingOptions,
      options.linkingContext
    );
  }

  /**
   * This function returns the package manager if it exists, otherwise it returns undefined.
   * @returns The `getPackageManager()` function returns a `PackageManager` object or `undefined`.
   */
  getPackageManager(): PackageManager | undefined {
    const packageManager = this.packageManagerSlot.get(this.packageManagerName);
    return packageManager;
  }

  async getVersionResolver(options: GetVersionResolverOptions = {}) {
    const packageManager = this.getPackageManager();
    const cacheRootDir = options.cacheRootDirectory || this.configStore.getConfig(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.packageManagerName);
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
    return [...this.aspectLoader.getCoreAspectIds(), 'teambit.harmony/harmony'];
  }

  /**
   * return the system configured package manager. by default pnpm.
   */
  getSystemPackageManager(): PackageManager {
    const packageManager = this.packageManagerSlot.get(DEFAULT_HARMONY_PACKAGE_MANAGER);
    if (!packageManager) throw new Error(`default package manager: ${DEFAULT_HARMONY_PACKAGE_MANAGER} was not found`);
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
    const packageManager = this.getPackageManager();
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
    const packageManager = this.getPackageManager();
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
    const packageManager = this.getPackageManager();
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
    const packageManager = this.getPackageManager();
    let registries;
    if (packageManager?.getRegistries && typeof packageManager?.getRegistries === 'function') {
      registries = await packageManager?.getRegistries();
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getRegistries) throw new Error('system package manager must implement `getRegistries()`');
      registries = await systemPm.getRegistries();
    }

    const getDefaultBitRegistry = (): Registry => {
      const bitGlobalConfigRegistry = this.configStore.getConfig(CFG_REGISTRY_URL_KEY);
      const bitRegistry = bitGlobalConfigRegistry || BIT_CLOUD_REGISTRY;

      const { bitOriginalAuthType, bitAuthHeaderValue, bitOriginalAuthValue } = this.getBitAuthConfig();

      const alwaysAuth = !!bitAuthHeaderValue;
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

    registries = this.addAuthToScopedBitRegistries(registries);
    return registries;
  }

  /**
   * This will mutate any registry which point to BIT_DEV_REGISTRY to have the auth config from the @bit scoped registry or from the user.token in bit's config
   */
  private addAuthToScopedBitRegistries(registries: Registries): Registries {
    const { bitOriginalAuthType, bitAuthHeaderValue, bitOriginalAuthValue } = this.getBitAuthConfig();
    const alwaysAuth = bitAuthHeaderValue !== undefined;
    let updatedRegistries = registries;
    Object.entries(registries.scopes).map(([name, registry]) => {
      if (!registry.authHeaderValue && BIT_CLOUD_REGISTRY.includes(registry.uri)) {
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

  private getBitAuthConfig(): Partial<{
    bitOriginalAuthType: string;
    bitAuthHeaderValue: string;
    bitOriginalAuthValue: string;
  }> {
    const bitGlobalConfigToken = this.configStore.getConfig(CFG_USER_TOKEN_KEY);
    const res = {
      bitOriginalAuthType: '',
      bitAuthHeaderValue: '',
      bitOriginalAuthValue: '',
    };

    // In case there is no auth configuration in the npmrc, but there is token in bit config, take it from the config
    if (bitGlobalConfigToken) {
      res.bitOriginalAuthType = 'authToken';
      res.bitAuthHeaderValue = `Bearer ${bitGlobalConfigToken}`;
      res.bitOriginalAuthValue = bitGlobalConfigToken;
    }

    return res;
  }

  get packageManagerName(): string {
    return this.config.packageManager ?? DEFAULT_HARMONY_PACKAGE_MANAGER;
  }

  addToRootPolicy(entries: WorkspacePolicyEntry[], options?: WorkspacePolicyAddEntryOptions): WorkspacePolicy {
    const workspacePolicy = this.getWorkspacePolicyFromConfig();
    entries.forEach((entry) => workspacePolicy.add(entry, options));
    this.updateConfigPolicy(workspacePolicy);
    return workspacePolicy;
  }

  removeFromRootPolicy(dependencyIds: string[]): boolean {
    const workspacePolicy = this.getWorkspacePolicyFromConfig();
    const workspacePolicyUpdated = workspacePolicy.remove(dependencyIds);
    const isRemoved = workspacePolicyUpdated.entries.length !== workspacePolicy.entries.length;
    if (isRemoved) this.updateConfigPolicy(workspacePolicyUpdated);
    return isRemoved;
  }

  private updateConfigPolicy(workspacePolicy: WorkspacePolicy) {
    const workspacePolicyObject = workspacePolicy.toConfigObject();
    this.config.policy = workspacePolicyObject;
    this.configAspect.setExtension(DependencyResolverAspect.id, this.config, {
      overrideExisting: true,
      ignoreVersion: true,
    });
  }

  async persistConfig(reasonForChange?: string) {
    await this.configAspect.workspaceConfig?.write({ reasonForChange });
    this.clearCache();
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

  // async getComponentEnvPolicyFromExtension(configuredExtensions: ExtensionDataList): Promise<EnvPolicy> {
  //   const env = this.envs.calculateEnvFromExtensions(configuredExtensions);
  //   const fromFile = await this.getEnvPolicyFromFile(env.id);
  //   if (fromFile) return fromFile;
  //   return this.getComponentEnvPolicyFromEnv(env.env);
  // }

  async getComponentEnvPolicyFromExtension(configuredExtensions: ExtensionDataList): Promise<EnvPolicy> {
    const envId = await this.envs.calculateEnvIdFromExtensions(configuredExtensions);
    if (this.envs.isCoreEnv(envId)) {
      const env = await this.envs.calculateEnvFromExtensions(configuredExtensions);
      return this.getComponentEnvPolicyFromEnv(env.env, { envId });
    }

    const fromFile = await this.getEnvPolicyFromFile(envId);
    if (fromFile) return fromFile;
    const env = await this.envs.calculateEnvFromExtensions(configuredExtensions);
    return this.getComponentEnvPolicyFromEnv(env.env, { envId });
  }

  async getEnvPolicyFromEnvId(
    id: ComponentID,
    legacyFiles?: SourceFile[],
    envExtendsDeps?: LegacyDependency[]
  ): Promise<EnvPolicy | undefined> {
    const fromFile = await this.getEnvPolicyFromFile(id.toString(), legacyFiles, envExtendsDeps);
    if (fromFile) return fromFile;
    const envDef = this.envs.getEnvDefinitionById(id);
    if (!envDef) return undefined;
    const env = envDef.env;
    return this.getComponentEnvPolicyFromEnv(env, {
      envId: id.toStringWithoutVersion(),
    });
  }

  /**
   * @deprecated use getEnvPolicyFromEnvId instead (it's the same)
   */
  async getEnvPolicyFromEnvLegacyId(id: ComponentID, legacyFiles?: SourceFile[]): Promise<EnvPolicy | undefined> {
    return this.getEnvPolicyFromEnvId(id, legacyFiles);
  }

  async getComponentEnvPolicy(component: Component): Promise<EnvPolicy> {
    // const envComponent = await this.envs.getEnvComponent(component);
    const envId = await this.envs.calculateEnvId(component);
    const envIdWithoutVersion = envId.toStringWithoutVersion();
    if (this.envs.isCoreEnv(envIdWithoutVersion)) {
      const env = this.envs.getEnv(component).env;
      return this.getComponentEnvPolicyFromEnv(env, { envId: envIdWithoutVersion });
    }
    const fromFile = await this.getEnvPolicyFromFile(envId.toString());
    if (fromFile) return fromFile;

    this.envsWithoutManifest.add(envId.toString());
    const env = this.envs.getEnv(component).env;
    return this.getComponentEnvPolicyFromEnv(env, { envId: envIdWithoutVersion });
  }

  async getEnvManifest(
    envComponent?: Component,
    legacyFiles?: SourceFile[],
    envExtendsDeps?: LegacyDependency[]
  ): Promise<EnvPolicy | undefined> {
    let envManifest;
    if (envComponent) {
      envManifest = (await this.envs.getOrCalculateEnvManifest(envComponent, legacyFiles, envExtendsDeps)) as any;
    }
    if (!envManifest && legacyFiles) {
      envManifest = await this.envs.calculateEnvManifest(undefined, legacyFiles, envExtendsDeps);
    }
    const policy = envManifest?.policy;
    if (!policy) return undefined;
    const allPoliciesFromEnv = EnvPolicy.fromConfigObject(policy, {
      includeLegacyPeersInSelfPolicy: envComponent && this.envs.isCoreEnv(envComponent.id.toStringWithoutVersion()),
    });
    return allPoliciesFromEnv;
  }

  /**
   * Merge policy from parent and child env.jsonc files
   * The rule is that for each type of dependency (dev, runtime, peer) we check each item.
   * if a dep with a name exists on the child we will take the entire object from the child (including the version,
   * supported range, force etc')
   * if a dep exists with a version value "-" we will remove it from the policy
   */
  mergeEnvManifestPolicy(parent: EnvJsonc, child: EnvJsonc): object {
    const policy = {};
    ['peers', 'dev', 'runtime'].forEach((key) => {
      policy[key] = cloneDeep(parent.policy?.[key] || []);
      const childEntries = cloneDeep(child.policy?.[key] || []);

      policy[key] = policy[key].filter((entry) => {
        const foundChildEntry = childEntries.find((childEntry) => {
          return childEntry.name === entry.name;
        });
        return !foundChildEntry;
      });
      policy[key] = policy[key].concat(childEntries);
      policy[key] = policy[key].filter((entry) => {
        return entry.version !== '-';
      });
    });
    return { policy };
  }

  private async getEnvPolicyFromFile(
    envId: string,
    legacyFiles?: SourceFile[],
    envExtendsDeps?: LegacyDependency[]
  ): Promise<EnvPolicy | undefined> {
    const isCoreEnv = this.envs.isCoreEnv(envId);
    if (isCoreEnv) return undefined;
    if (legacyFiles) {
      const envJsonc = legacyFiles.find((file) => file.basename === 'env.jsonc');
      if (envJsonc) {
        return this.getEnvManifest(undefined, legacyFiles, envExtendsDeps);
      }
      return undefined;
    }
    const envComponent = await this.envs.getEnvComponentByEnvId(envId, envId);
    return this.getEnvManifest(envComponent);
  }

  async getComponentEnvPolicyFromEnv(env: DependenciesEnv, options: { envId: string }): Promise<EnvPolicy> {
    if (env.getDependencies && typeof env.getDependencies === 'function') {
      const policiesFromEnvConfig = await env.getDependencies();
      if (policiesFromEnvConfig) {
        const idWithoutVersion = options.envId.split('@')[0];
        const allPoliciesFromEnv = EnvPolicy.fromConfigObject(policiesFromEnvConfig, {
          includeLegacyPeersInSelfPolicy: this.envs.isCoreEnv(idWithoutVersion),
        });
        return allPoliciesFromEnv;
      }
    }
    return EnvPolicy.getEmpty();
  }

  async getComponentEnvPolicyFromEnvDefinition(envDef: EnvDefinition): Promise<EnvPolicy> {
    const fromFile = await this.getEnvPolicyFromFile(envDef.id);
    if (fromFile) return fromFile;
    return this.getComponentEnvPolicyFromEnv(envDef.env, { envId: envDef.id });
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
    id: ComponentID,
    legacyFiles?: SourceFile[],
    envExtendsDeps?: LegacyDependency[]
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
        const currentPolicy = VariantPolicy.fromConfigObject(policyTupleToApply[1], { source: 'slots' });
        policiesFromSlots = VariantPolicy.mergePolices([policiesFromSlots, currentPolicy]);
      }
    });
    const currentExtension = configuredExtensions.findExtension(DependencyResolverAspect.id);
    const currentConfig = currentExtension?.config as unknown as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = VariantPolicy.fromConfigObject(currentConfig.policy, { source: 'config' });
    }
    const policiesFromEnvForItself =
      (await this.getPoliciesFromEnvForItself(id, legacyFiles, envExtendsDeps)) ?? VariantPolicy.getEmpty();

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
  async getPoliciesFromEnvForItself(
    id: ComponentID,
    legacyFiles?: SourceFile[],
    envExtendsDeps?: LegacyDependency[]
  ): Promise<VariantPolicy | undefined> {
    const envPolicy = await this.getEnvPolicyFromEnvId(id, legacyFiles, envExtendsDeps);
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
        // @todo: it's unclear why "dep.componentId" randomly becomes a ComponentID instance.
        // this check is added because on Ripple in some scenarios it was throwing:
        // "ComponentID.fromObject expect to get an object, got an instance of ComponentID" (locally it didn't happen)
        const depId =
          dep.componentId instanceof ComponentID ? dep.componentId : ComponentID.fromObject(dep.componentId);
        const newDepId = idTransformer(depId);
        dep.componentId = (newDepId || depId).serialize();
        dep.id = (newDepId || depId).toString();
        dep.version = (newDepId || depId).version;
      }
    });
    return component;
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
   * This function called on component load in order to calculate the custom
   * dependency detectors from an env, which is got by extension data list.
   * Do not use this function for other purposes.
   */
  async calcComponentEnvDepDetectors(extensions: ExtensionDataList) {
    const envDef = await this.envs.calculateEnvFromExtensions(extensions);
    const depEnv = envDef.env as DependenciesEnv;
    if (typeof depEnv?.getDepDetectors === 'function') {
      return depEnv.getDepDetectors();
    }
    return null;
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

  validateAspectData(data: DependencyResolverComponentData) {
    const errorPrefix = `failed validating ${DependencyResolverAspect.id} aspect-data.`;
    let errorMsg: undefined | string;
    data.dependencies?.forEach((dep) => {
      const isVersionValid = Boolean(semver.valid(dep.version) || semver.validRange(dep.version));
      if (isVersionValid) return;
      if (dep.__type === COMPONENT_DEP_TYPE && isSnap(dep.version)) return;
      errorMsg = `${errorPrefix} the dependency version "${dep.version}" of ${dep.id} is not a valid semver version or range`;
    });
    data.policy?.forEach((policy) => {
      const policyVersion = policy.value.version;
      const allowedSpecialChars = ['+', '-'];
      if (policyVersion === '*') {
        // this is only valid for packages, not for components.
        const isComp = data.dependencies.find(d => d.__type === COMPONENT_DEP_TYPE
          && d.packageName === policy.dependencyId);
        if (!isComp) return;
        errorMsg = `${errorPrefix} the policy version "${policyVersion}" of ${policy.dependencyId} is not valid for components, only for packages.
as an alternative, you can use "+" to keep the same version installed in the workspace`;
      }
      const isVersionValid = Boolean(
        semver.valid(policyVersion) ||
          semver.validRange(policyVersion) ||
          allowedSpecialChars.includes(policyVersion)
      );
      if (isVersionValid) return;
      errorMsg = `${errorPrefix} the policy version "${policyVersion}" of ${policy.dependencyId} is not a valid semver version or range`;
    });

    if (errorMsg) {
      return { errorMsg, minBitVersion: '1.9.107' };
    }
  }

  /**
   * Return a list of outdated policy dependencies.
   */
  async getOutdatedPkgsFromPolicies({
    rootDir,
    variantPoliciesByPatterns,
    componentPolicies,
    components,
    patterns,
    forceVersionBump,
  }: {
    rootDir: string;
    variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
    componentPolicies: Array<{ componentId: ComponentID; policy: any }>;
    components: Component[];
    patterns?: string[];
    forceVersionBump?: 'major' | 'minor' | 'patch' | 'compatible';
  }): Promise<MergedOutdatedPkg[] | null> {
    const localComponentPkgNames = new Set(components.map((component) => this.getPackageName(component)));
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
                dep.lifecycle !== 'peer' &&
                !localComponentPkgNames.has(dep.getPackageName())
            )
            .map((dep) => ({
              name: dep.getPackageName!(), // eslint-disable-line
              version: dep.version,
              isAuto: dep.source === 'auto',
              componentId: component.id,
              lifecycleType: dep.lifecycle,
            }));
        })
      )
    ).flat();
    let allPkgs = getAllPolicyPkgs({
      rootPolicy: this.getWorkspacePolicyFromConfig(),
      variantPoliciesByPatterns,
      componentPolicies,
      componentModelVersions,
    });
    if (patterns?.length) {
      const selectedPkgNames = new Set(
        multimatch(
          allPkgs.map(({ name }) => name),
          patterns
        )
      );
      allPkgs = allPkgs.filter(({ name }) => selectedPkgNames.has(name));
      if (!allPkgs.length) {
        return null;
      }
    }
    const outdatedPkgs = await this.getOutdatedPkgs({ rootDir, forceVersionBump }, allPkgs);
    return mergeOutdatedPkgs(outdatedPkgs);
  }

  /**
   * Fetching the package manifest from the full package document.
   * By default, we always request the abbreviated package document,
   * which is much smaller in size but doesn't include all the fields published in the package's package.json file.
   */
  async fetchFullPackageManifest(packageName: string): Promise<DependencyManifest | undefined> {
    const pm = this.getSystemPackageManager();
    const { manifest } = await pm.resolveRemoteVersion(packageName, {
      cacheRootDir: this.configStore.getConfig(CFG_PACKAGE_MANAGER_CACHE),
      fullMetadata: true,
      // We can set anything here. The rootDir option is ignored, when resolving npm-hosted packages.
      rootDir: process.cwd(),
    });
    return manifest;
  }

  /**
   * Accepts a list of package dependency policies and returns a list of outdated policies extended with their "latestRange"
   */
  async getOutdatedPkgs<T>(
    {
      rootDir,
      forceVersionBump,
    }: {
      rootDir: string;
      forceVersionBump?: 'major' | 'minor' | 'patch' | 'compatible';
    },
    pkgs: Array<
      { name: string; currentRange: string; source: 'variants' | 'component' | 'rootPolicy' | 'component-model' } & T
    >
  ): Promise<Array<{ name: string; currentRange: string; latestRange: string } & T>> {
    this.logger.setStatusLine('checking the latest versions of dependencies');
    const resolver = await this.getVersionResolver();
    const tryResolve = async (spec: string) => {
      try {
        return (
          await resolver.resolveRemoteVersion(spec, {
            rootDir,
          })
        ).version;
      } catch {
        // If latest cannot be found for the package, then just ignore it
        return null;
      }
    };
    const outdatedPkgs = compact(
      await Promise.all(
        pkgs.map(async (pkg) => {
          const latestVersion = await tryResolve(
            `${pkg.name}@${newVersionRange(pkg.currentRange, { pkgSource: pkg.source, forceVersionBump })}`
          );
          if (!latestVersion) return null;
          const currentVersion = semver.valid(pkg.currentRange.replace(/[\^~]/, ''));
          // If the current version is newer than the latest, then no need to update the dependency
          if (currentVersion && (semver.gt(currentVersion, latestVersion) || currentVersion === latestVersion))
            return null;
          return {
            ...pkg,
            latestRange:
              pkg.source === 'component-model' && this.config.savePrefix != null
                ? `${this.config.savePrefix}${latestVersion}`
                : repeatPrefix(pkg.currentRange, latestVersion),
          } as any;
        })
      )
    );
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
    }
  ): {
    updatedVariants: string[];
    updatedComponents: UpdatedComponent[];
  } {
    const { updatedVariants, updatedComponents, updatedWorkspacePolicyEntries } = applyUpdates(outdatedPkgs, {
      variantPoliciesByPatterns: options.variantPoliciesByPatterns,
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
    ConfigStoreAspect,
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
    Slot.withType<AddPackagesToLinkSlot>(),
  ];

  static defaultConfig: DependencyResolverWorkspaceConfig &
    Required<Pick<DependencyResolverWorkspaceConfig, 'linkCoreAspects'>> = {
    policy: {},
    linkCoreAspects: true,
  };

  static async provider(
    [envs, loggerExt, configMain, aspectLoader, componentAspect, graphql, configStore]: [
      EnvsMain,
      LoggerMain,
      ConfigMain,
      AspectLoaderMain,
      ComponentMain,
      GraphqlMain,
      ConfigStoreMain,
    ],
    config: DependencyResolverWorkspaceConfig,
    [
      rootPolicyRegistry,
      policiesRegistry,
      packageManagerSlot,
      dependencyFactorySlot,
      preInstallSlot,
      postInstallSlot,
      addPackagesToLinkSlot,
    ]: [
      RootPolicyRegistry,
      PoliciesRegistry,
      PackageManagerSlot,
      DependencyFactorySlot,
      PreInstallSlot,
      PostInstallSlot,
      AddPackagesToLinkSlot,
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
      configStore,
      componentAspect,
      packageManagerSlot,
      dependencyFactorySlot,
      preInstallSlot,
      postInstallSlot,
      addPackagesToLinkSlot,
    );

    const envJsoncDetector = envs.getEnvJsoncDetector();
    dependencyResolver.registerDetector(envJsoncDetector);

    componentAspect.registerShowFragments([
      new DependenciesFragment(dependencyResolver),
      new DevDependenciesFragment(dependencyResolver),
      new PeerDependenciesFragment(dependencyResolver),
    ]);
    // TODO: solve this generics issue and remove the ts-ignore
    // @ts-ignore
    dependencyResolver.registerDependencyFactories([new ComponentDependencyFactory(componentAspect)]);

    LegacyComponent.registerOnComponentOverridesLoading(
      DependencyResolverAspect.id,
      async (
        configuredExtensions: ExtensionDataList,
        id: ComponentID,
        legacyFiles: SourceFile[],
        envExtendsDeps?: LegacyDependency[]
      ) => {
        const policy = await dependencyResolver.mergeVariantPolicies(
          configuredExtensions,
          id,
          legacyFiles,
          envExtendsDeps
        );
        return policy.toLegacyDepsOverrides();
      }
    );
    if (aspectLoader)
      aspectLoader.registerOnLoadRequireableExtensionSlot(
        dependencyResolver.onLoadRequireableExtensionSubscriber.bind(dependencyResolver)
      );

    graphql.register(() => dependencyResolverSchema(dependencyResolver));
    envs.registerService(new DependenciesService());
    envs.registerEnvJsoncMergeCustomizer(dependencyResolver.mergeEnvManifestPolicy.bind(dependencyResolver));

    // this is needed because during tag process, the data.dependencies can be loaded and the componentId can become
    // an instance of ComponentID class. it needs to be serialized before saved into objects.
    const serializeDepResolverDataBeforePersist = (extDataList: ExtensionDataList) => {
      const entry = extDataList.findCoreExtension(DependencyResolverAspect.id);
      if (!entry) return;
      const dependencies = get(entry, ['data', 'dependencies'], []);
      dependencies.forEach((dep) => {
        if (dep.__type === COMPONENT_DEP_TYPE) {
          dep.componentId = dep.componentId instanceof ComponentID ? dep.componentId.serialize() : dep.componentId;
        }
      });
    };
    ExtensionDataList.toModelObjectsHook.push(serializeDepResolverDataBeforePersist);
    PackageJsonTransformer.registerPackageJsonTransformer(async (component, packageJsonObject) => {
      const deps = dependencyResolver.getDependencies(component);
      const { optionalDependencies, peerDependenciesMeta } = deps.toDependenciesManifest();
      packageJsonObject.optionalDependencies = optionalDependencies;
      packageJsonObject.peerDependenciesMeta = peerDependenciesMeta;
      const entry = component.get(DependencyResolverAspect.id);
      if (entry?.config.peer) {
        if (!packageJsonObject.bit) {
          packageJsonObject.bit = {};
        }
        packageJsonObject.bit.peer = true;
        if (entry.config.defaultPeerRange) {
          packageJsonObject.bit.defaultPeerRange = entry.config.defaultPeerRange;
        }
      }
      return packageJsonObject;
    });

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
    const packageManager = this.getPackageManager();
    if (typeof packageManager?.getInjectedDirs === 'function') {
      return packageManager.getInjectedDirs(rootDir, componentDir, packageName);
    }
    return [];
  }

  getWorkspaceDepsOfBitRoots(manifests: ProjectManifest[]): Record<string, string> {
    const packageManager = this.getPackageManager();
    if (!packageManager) {
      throw new PackageManagerNotFound(this.packageManagerName);
    }
    return packageManager.getWorkspaceDepsOfBitRoots(manifests);
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

function newVersionRange(
  currentRange: string,
  opts: { pkgSource: CurrentPkgSource; forceVersionBump?: 'major' | 'minor' | 'patch' | 'compatible' }
) {
  if (opts.forceVersionBump == null || opts.forceVersionBump === 'major') return 'latest';
  const currentVersion = semver.valid(currentRange.replace(/[\^~]/, ''));
  if (opts.forceVersionBump === 'compatible') {
    if ((opts.pkgSource === 'component' || opts.pkgSource === 'component-model') && currentVersion === currentRange) {
      return `^${currentVersion}`;
    }
    return currentRange;
  }
  if (!currentVersion) return null;
  const [major, minor] = currentVersion.split('.');
  switch (opts.forceVersionBump) {
    case 'patch':
      return `>=${currentVersion} <${major}.${+minor + 1}.0`;
    case 'minor':
      return `>=${currentVersion} <${+major + 1}.0.0`;
    default:
      return null;
  }
}

export interface MergedOutdatedPkg extends OutdatedPkg {
  dependentComponents?: ComponentID[];
  hasDifferentRanges?: boolean;
}

function mergeOutdatedPkgs(outdatedPkgs: OutdatedPkg[]): MergedOutdatedPkg[] {
  const mergedOutdatedPkgs: Record<
    string,
    MergedOutdatedPkg & Required<Pick<MergedOutdatedPkg, 'dependentComponents'>>
  > = {};
  const outdatedPkgsNotFromComponentModel: OutdatedPkg[] = [];
  for (const outdatedPkg of outdatedPkgs) {
    if (outdatedPkg.source === 'component-model' && outdatedPkg.componentId) {
      if (!mergedOutdatedPkgs[outdatedPkg.name]) {
        mergedOutdatedPkgs[outdatedPkg.name] = {
          ...omit(outdatedPkg, ['componentId']),
          source: 'rootPolicy',
          dependentComponents: [outdatedPkg.componentId],
        };
      } else {
        if (mergedOutdatedPkgs[outdatedPkg.name].currentRange !== outdatedPkg.currentRange) {
          mergedOutdatedPkgs[outdatedPkg.name].hasDifferentRanges = true;
        }
        mergedOutdatedPkgs[outdatedPkg.name].currentRange = tryPickLowestRange(
          mergedOutdatedPkgs[outdatedPkg.name].currentRange,
          outdatedPkg.currentRange
        );
        mergedOutdatedPkgs[outdatedPkg.name].dependentComponents.push(outdatedPkg.componentId);
        if (outdatedPkg.targetField === 'dependencies') {
          mergedOutdatedPkgs[outdatedPkg.name].targetField = outdatedPkg.targetField;
        }
      }
    } else {
      outdatedPkgsNotFromComponentModel.push(outdatedPkg);
    }
  }
  return [...Object.values(mergedOutdatedPkgs), ...outdatedPkgsNotFromComponentModel];
}

function tryPickLowestRange(range1: string, range2: string) {
  if (range1 === '*' || range2 === '*') return '*';
  try {
    return semver.lt(rangeToVersion(range1), rangeToVersion(range2)) ? range1 : range2;
  } catch {
    return '*';
  }
}

function rangeToVersion(range: string) {
  if (range.startsWith('~') || range.startsWith('^')) {
    return range.substring(1);
  }
  return range;
}
