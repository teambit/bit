import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import type { Config } from '@teambit/config';
import { get } from 'lodash';
import { ConfigAspect } from '@teambit/config';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { LoggerMain } from '@teambit/logger';
import { Logger, LoggerAspect } from '@teambit/logger';
import * as globalConfig from 'bit-bin/dist/api/consumer/lib/global-config';
import { CFG_PACKAGE_MANAGER_CACHE } from 'bit-bin/dist/constants';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import {
  registerUpdateDependenciesOnTag,
  onTagIdTransformer,
} from 'bit-bin/dist/scope/component-ops/tag-model-component';
import {
  registerUpdateDependenciesOnExport,
  OnExportIdTransformer,
} from 'bit-bin/dist/scope/component-ops/export-scope-components';
import { Version as VersionModel } from 'bit-bin/dist/scope/models';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import fs from 'fs-extra';
import { BitId } from 'bit-bin/dist/bit-id';
import { flatten } from 'ramda';
import { SemVer } from 'semver';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { Registries, Registry } from './registry';
import { ROOT_NAME } from './dependencies/constants';
import { BitLinkType, DependencyInstaller } from './dependency-installer';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { DependencyVersionResolver } from './dependency-version-resolver';
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

export const BIT_DEV_REGISTRY = 'https://node.bit.dev/';
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

export interface DependencyResolverWorkspaceConfig {
  policy: WorkspacePolicyConfigObject;
  /**
   * choose the package manager for Bit to use. you can choose between 'npm', 'yarn', 'pnpm'
   * and 'librarian'. our recommendation is use 'librarian' which reduces package duplicates
   * and totally removes the need of a 'node_modules' directory in your project.
   */
  packageManager: string;
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

export type PoliciesRegistry = SlotRegistry<VariantPolicyConfigObject>;
export type PackageManagerSlot = SlotRegistry<PackageManager>;
export type DependencyFactorySlot = SlotRegistry<DependencyFactory[]>;

export type MergeDependenciesFunc = (configuredExtensions: ExtensionDataList) => Promise<VariantPolicyConfigObject>;

export type BitExtendedLinkType = 'none' | BitLinkType;

export type LinkingOptions = {
  /**
   * How to create the link from the root dir node modules to @teambit/bit -
   * none - don't create it at all
   * link - use symlink to the global installation dir
   * install - use package manager to install it
   */
  bitLinkType?: BitExtendedLinkType;
  /**
   * Whether to create links in the root dir node modules to all core aspects
   */
  linkCoreAspects?: boolean;
};

export type GetInstallerOptions = {
  rootDir?: string;
  packageManager?: string;
  cacheRootDirectory?: string;
  linkingOptions?: LinkingOptions;
};

export type GetVersionResolverOptions = {
  cacheRootDirectory?: string;
};

const defaultLinkingOptions: LinkingOptions = {
  bitLinkType: 'link',
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
    private policiesRegistry: PoliciesRegistry,

    /**
     * envs extension.
     */
    private envs: EnvsMain,

    private logger: Logger,

    private configAspect: Config,

    private aspectLoader: AspectLoaderMain,

    private packageManagerSlot: PackageManagerSlot,

    private dependencyFactorySlot: DependencyFactorySlot
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

  getWorkspacePolicy(): WorkspacePolicy {
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
    const cacheRootDir = options.cacheRootDirectory || globalConfig.getSync(CFG_PACKAGE_MANAGER_CACHE);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.config.packageManager);
    }

    if (cacheRootDir && !fs.pathExistsSync(cacheRootDir)) {
      this.logger.debug(`creating package manager cache dir at ${cacheRootDir}`);
      fs.ensureDirSync(cacheRootDir);
    }
    const linkingOptions = Object.assign({}, defaultLinkingOptions, options?.linkingOptions || {});
    // TODO: we should somehow pass the cache root dir to the package manager constructor
    return new DependencyInstaller(packageManager, this.aspectLoader, options.rootDir, cacheRootDir, linkingOptions);
  }

  getPackageManagerName() {
    return this.config.packageManager;
  }

  getVersionResolver(options: GetVersionResolverOptions = {}) {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    const cacheRootDir = options.cacheRootDirectory || globalConfig.getSync(CFG_PACKAGE_MANAGER_CACHE);

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

  async getRegistries(): Promise<Registries> {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);
    let registries;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    // TODO: support getting from default package manager
    if (packageManager?.getRegistries && typeof packageManager?.getRegistries === 'function') {
      registries = await packageManager?.getRegistries();
    } else {
      const systemPm = this.getSystemPackageManager();
      if (!systemPm.getRegistries) throw new Error('system package manager must implement `getRegistries()`');
      registries = await systemPm.getRegistries();
    }

    const bitScope = registries.scopes.bit;
    const bitAuthHeaderValue = bitScope?.authHeaderValue;
    const bitRegistry = bitScope?.uri || BIT_DEV_REGISTRY;
    const bitOriginalAuthType = bitScope?.originalAuthType;
    const bitOriginalAuthValue = bitScope?.originalAuthValue;
    const alwaysAuth = bitAuthHeaderValue !== undefined;
    const bitDefaultRegistry = new Registry(
      bitRegistry,
      alwaysAuth,
      bitAuthHeaderValue,
      bitOriginalAuthType,
      bitOriginalAuthValue
    );

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
    const workspacePolicy = this.getWorkspacePolicy();
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
    const env = this.envs.getEnvFromExtensions(configuredExtensions).env;
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

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, LoggerAspect, ConfigAspect, AspectLoaderAspect, ComponentAspect];

  static slots = [
    Slot.withType<VariantPolicyConfigObject>(),
    Slot.withType<PackageManager>(),
    Slot.withType<RegExp>(),
    Slot.withType<DependencyFactory>(),
  ];

  static defaultConfig: DependencyResolverWorkspaceConfig = {
    /**
     * default package manager.
     */
    packageManager: 'teambit.dependencies/pnpm',
    policy: {},
    packageManagerArgs: [],
    devFilePatterns: ['*.spec.ts'],
    strictPeerDependencies: true,
  };

  static async provider(
    [envs, loggerExt, configMain, aspectLoader, componentAspect]: [
      EnvsMain,
      LoggerMain,
      Config,
      AspectLoaderMain,
      ComponentMain
    ],
    config: DependencyResolverWorkspaceConfig,
    [policiesRegistry, packageManagerSlot, dependencyFactorySlot]: [
      PoliciesRegistry,
      PackageManagerSlot,
      DependencyFactorySlot
    ]
  ) {
    // const packageManager = new PackageManagerLegacy(config.packageManager, logger);
    const logger = loggerExt.createLogger(DependencyResolverAspect.id);
    const dependencyResolver = new DependencyResolverMain(
      config,
      policiesRegistry,
      envs,
      logger,
      configMain,
      aspectLoader,
      packageManagerSlot,
      dependencyFactorySlot
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
