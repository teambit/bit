import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import type { Config } from '@teambit/config';
import { ConfigAspect } from '@teambit/config';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { LoggerMain } from '@teambit/logger';
import { Logger, LoggerAspect } from '@teambit/logger';
import * as globalConfig from 'bit-bin/dist/api/consumer/lib/global-config';
import { CFG_PACKAGE_MANAGER_CACHE } from 'bit-bin/dist/constants';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { DependenciesOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';
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
import { sortObject } from 'bit-bin/dist/utils';
import fs from 'fs-extra';
import { BitId } from 'bit-bin/dist/bit-id';
import { ComponentID } from '@teambit/component';
import R, { forEachObjIndexed, flatten } from 'ramda';
import { SemVer } from 'semver';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { Registries, Registry } from './registry';
import { KEY_NAME_BY_LIFECYCLE_TYPE, LIFECYCLE_TYPE_BY_KEY_NAME, ROOT_NAME } from './constants';
import { DependencyGraph } from './dependency-graph';
import { BitLinkType, DependencyInstaller } from './dependency-installer';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { DependencyVersionResolver } from './dependency-version-resolver';
import { PackageManagerNotFound } from './exceptions';
import { CreateFromComponentsOptions, WorkspaceManifest } from './manifest/workspace-manifest';
import { PackageManager } from './package-manager';
import {
  DependenciesObjectDefinition,
  DependenciesPolicy,
  DependencyResolverVariantConfig,
  DependencyResolverWorkspaceConfig,
  DepObjectKeyName,
  PolicyDep,
  WorkspaceDependenciesPolicy,
} from './types';
import {
  SerializedDependency,
  DependencyListFactory,
  DependencyLifecycleType,
  DependencyFactory,
  ComponentDependencyFactory,
  COMPONENT_DEP_TYPE,
} from './dependencies';

export const BIT_DEV_REGISTRY = 'https://node.bit.dev/';
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

export type PoliciesRegistry = SlotRegistry<DependenciesPolicy>;
export type PackageManagerSlot = SlotRegistry<PackageManager>;
export type DependencyFactorySlot = SlotRegistry<DependencyFactory[]>;

export type MergeDependenciesFunc = (configuredExtensions: ExtensionDataList) => Promise<DependenciesPolicy>;

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

export type UpdatePolicyOptions = {
  updateExisting: boolean;
};

export type UpdatedPackage = {
  packageName: string;
  newVersion: string;
  newLifecycleType: DependencyLifecycleType;
  oldVersion: string;
  oldLifecycleType: DependencyLifecycleType;
};

export type UpdatePolicyResult = {
  addedPackages: PolicyDep[];
  existingPackages: PolicyDep[];
  updatedPackages: UpdatedPackage[];
};

const defaultLinkingOptions: LinkingOptions = {
  bitLinkType: 'link',
  linkCoreAspects: true,
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

  getDependencies(component: Component): DependencyGraph {
    // we should support multiple components here as an entry
    return new DependencyGraph(component);
  }

  getWorkspacePolicy(): WorkspaceDependenciesPolicy {
    return this.config.policy;
  }

  /**
   * Create a workspace manifest
   * The term workspace here is not the same as "bit workspace" but a workspace that represent a shared root
   * for installation of many components (sometime it might point to the workspace path)
   * in other case it can be for example the capsules root dir
   *
   * @param {string} [name=ROOT_NAME]
   * @param {SemVer} [version=new SemVer('1.0.0')]
   * @param {DependenciesObjectDefinition} dependencies
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
    rootDependencies: DependenciesObjectDefinition,
    rootDir: string,
    components: Component[],
    options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
    }
  ): Promise<WorkspaceManifest> {
    this.logger.setStatusLine('deduping dependencies for installation');
    const res = await WorkspaceManifest.createFromComponents(
      name,
      version,
      rootDependencies,
      rootDir,
      components,
      options,
      this.mergeDependencies.bind(this)
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

    // Override default registry to use bit registry in case npmjs is the default - bit registry will proxy it
    // We check also NPM_REGISTRY.startsWith because the uri might not have the trailing / we have in NPM_REGISTRY
    if (
      !registries.defaultRegistry.uri ||
      registries.defaultRegistry.uri === NPM_REGISTRY ||
      NPM_REGISTRY.startsWith(registries.defaultRegistry.uri)
    ) {
      const bitToken = registries.scopes.bit?.authHeaderValue;
      const bitRegistry = registries.scopes.bit?.uri || BIT_DEV_REGISTRY;
      // TODO: this will not handle cases where you have token for private npm registries stored on npmjs
      // it should be handled by somehow in such case (default is npmjs and there is token for default) by sending the token of npmjs to the registry
      // (for example by setting some special header in the request)
      // then in the registry server it should be use it when proxies
      const bitDefaultRegistry = new Registry(bitRegistry, true, bitToken);
      registries = registries.setDefaultRegistry(bitDefaultRegistry);
    }
    return registries;
  }

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  updateRootPolicy(newDeps: PolicyDep[], options?: UpdatePolicyOptions): WorkspaceDependenciesPolicy {
    const rootPolicy = this.config.policy ?? {};
    this.config.policy = rootPolicy;
    this.updatePolicy(this.config.policy, newDeps, options);
    this.configAspect.setExtension(DependencyResolverAspect.id, this.config, {
      overrideExisting: true,
      ignoreVersion: true,
    });
    return this.config.policy;
  }

  updatePolicy(
    existingPolicy: DependenciesPolicy,
    newDeps: PolicyDep[],
    options?: UpdatePolicyOptions
  ): UpdatePolicyResult {
    const defaultOptions: UpdatePolicyOptions = {
      updateExisting: false,
    };
    const calculatedOpts = Object.assign({}, defaultOptions, options);
    const addedPackages: PolicyDep[] = [];
    const existingPackages: PolicyDep[] = [];
    const updatedPackages: UpdatedPackage[] = [];
    newDeps.forEach((dep) => {
      const policyDep = this.findInPolicy(existingPolicy, dep.packageName);
      if (!policyDep) {
        addedPackages.push(dep);
        this.addDepToPolicy(existingPolicy, dep);
      } else {
        existingPackages.push(policyDep);
        if (calculatedOpts?.updateExisting) {
          const updatedPackage: UpdatedPackage = {
            packageName: dep.packageName,
            newVersion: dep.version,
            newLifecycleType: dep.lifecycleType,
            oldVersion: policyDep.version,
            oldLifecycleType: policyDep.lifecycleType,
          };
          updatedPackages.push(updatedPackage);
          const oldKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[policyDep.lifecycleType];
          delete existingPolicy[oldKeyName][dep.packageName];
          this.addDepToPolicy(existingPolicy, dep);
        }
      }
    });
    const result: UpdatePolicyResult = {
      addedPackages,
      existingPackages,
      updatedPackages,
    };
    return result;
  }

  async persistConfig(workspaceDir?: string) {
    return this.configAspect.workspaceConfig?.write({ dir: workspaceDir });
  }

  private addDepToPolicy(policy: DependenciesPolicy, dep: PolicyDep): void {
    const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[dep.lifecycleType];
    policy[keyName] = policy[keyName] || {};
    policy[keyName][dep.packageName] = dep.version;
    policy[keyName] = sortObject(policy[keyName]);
  }

  findInPolicy(policy: DependenciesPolicy, packageName: string): PolicyDep | undefined {
    let result;
    forEachObjIndexed((depObject, keyName: DepObjectKeyName) => {
      if (!result && depObject[packageName]) {
        result = {
          packageName,
          version: depObject[packageName],
          lifecycleType: LIFECYCLE_TYPE_BY_KEY_NAME[keyName],
        };
      }
    }, policy);
    return result;
  }

  /**
   * register new dependencies policies
   */
  registerDependenciesPolicies(policy: DependenciesPolicy): void {
    return this.policiesRegistry.register(policy);
  }

  /**
   * Merge the dependencies provided by:
   * 1. envs configured in the component - via dependencies method
   * 2. extensions that registered to the registerDependencyPolicy slot (and configured for the component)
   * 3. props defined by the user (they are the strongest one)
   * @param configuredExtensions
   */
  async mergeDependencies(configuredExtensions: ExtensionDataList): Promise<DependenciesPolicy> {
    let policiesFromEnv: DependenciesPolicy = {};
    let policiesFromHooks: DependenciesPolicy = {};
    let policiesFromConfig: DependenciesPolicy = {};
    const env = this.envs.getEnvFromExtensions(configuredExtensions).env;
    if (env.getDependencies && typeof env.getDependencies === 'function') {
      policiesFromEnv = await env.getDependencies();
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
        const currentPolicy = policyTupleToApply[1];
        policiesFromHooks = mergePolices([policiesFromHooks, currentPolicy]);
      }
    });
    const currentExtension = configuredExtensions.findExtension(DependencyResolverAspect.id);
    const currentConfig = (currentExtension?.config as unknown) as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = currentConfig.policy;
    }
    const result = mergePolices([policiesFromEnv, policiesFromHooks, policiesFromConfig]);
    return result;
  }

  updateDepsOnLegacyTag(component: LegacyComponent, idTransformer: onTagIdTransformer): LegacyComponent {
    const entry = component.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return component;
    }
    entry.data.dependencies.forEach((dep) => {
      if (dep.type === COMPONENT_DEP_TYPE) {
        const depId = BitId.parse(dep.componentId);
        const newDepId = idTransformer(depId);
        dep.componentId = (newDepId || depId).serialize();
        dep.id = (newDepId || depId).toString();
      }
    });
    return component;
  }

  updateDepsOnLegacyExport(version: VersionModel, idTransformer: onExportIdTransformer): VersionModel {
    const entry = version.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return version;
    }
    entry.data.dependencies.forEach((dep) => {
      if (dep.type === COMPONENT_DEP_TYPE) {
        const depId = BitId.parse(dep.componentId);
        const newDepId = idTransformer(depId);
        dep.componentId = (newDepId || depId).serialize();
        dep.id = (newDepId || depId).toString();
      }
    });
    return version;
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
    const factories = flatten(this.dependencyFactorySlot.values());
    const factoriesMap = factories.reduce((acc, factory) => {
      acc[factory.type] = factory;
      return acc;
    }, {});
    const listFactory = new DependencyListFactory(factoriesMap);
    const dependencyList = await listFactory.fromLegacyComponent(legacyComponent);
    return dependencyList.serialize();
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, LoggerAspect, ConfigAspect, AspectLoaderAspect, ComponentAspect];

  static slots = [
    Slot.withType<DependenciesPolicy>(),
    Slot.withType<PackageManager>(),
    Slot.withType<DependencyFactory>(),
  ];

  static defaultConfig: DependencyResolverWorkspaceConfig = {
    /**
     * default package manager.
     */
    packageManager: 'teambit.dependencies/pnpm',
    policy: {},
    packageManagerArgs: [],
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

    // TODO: solve this generics issue and remove the ts-ignore
    // @ts-ignore
    dependencyResolver.registerDependencyFactories([new ComponentDependencyFactory(componentAspect)]);

    DependencyResolver.getDepResolverAspectName = () => DependencyResolverAspect.id;
    LegacyComponent.registerOnComponentOverridesLoading(
      DependencyResolverAspect.id,
      async (configuredExtensions: ExtensionDataList) => {
        const policies = await dependencyResolver.mergeDependencies(configuredExtensions);
        return transformPoliciesToLegacyDepsOverrides(policies);
      }
    );
    DependencyResolver.registerWorkspacePolicyGetter(dependencyResolver.getWorkspacePolicy.bind(dependencyResolver));
    registerUpdateDependenciesOnTag(dependencyResolver.updateDepsOnLegacyTag.bind(dependencyResolver));
    registerUpdateDependenciesOnExport(dependencyResolver.updateDepsOnLegacyExport.bind(dependencyResolver));

    return dependencyResolver;
  }

  getEmptyDepsObject(): DependenciesObjectDefinition {
    return {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
  }
}

function mergePolices(policies: DependenciesPolicy[]) {
  const result: DependenciesPolicy = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
  };
  return R.reduce(R.mergeDeepRight, result, policies);
}

function transformPoliciesToLegacyDepsOverrides(policy: DependenciesPolicy): DependenciesOverridesData {
  // TODO: once we support DetailedDependencyPolicy in the object we should do here something
  // TODO: it might be that we will have to return it as is, and handle it in the legacy
  // TODO: since we don't have enough info about handle force here
  return policy;
}

DependencyResolverAspect.addRuntime(DependencyResolverMain);
