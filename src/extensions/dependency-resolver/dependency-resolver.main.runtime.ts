import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { SemVer } from 'semver';
import R from 'ramda';
import fs from 'fs-extra';
import { SlotRegistry, Slot } from '@teambit/harmony';
import {
  DependenciesPolicy,
  DependencyResolverVariantConfig,
  DependencyResolverWorkspaceConfig,
  DependenciesObjectDefinition,
  WorkspaceDependenciesPolicy,
} from './types';
import { DependenciesOverridesData } from '../../consumer/config/component-overrides';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { Environments } from '../environments';
import { LoggerExtension, Logger } from '../logger';
import { PackageManager } from './package-manager';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import ConsumerComponent from '../../consumer/component';
import { DependencyInstaller } from './dependency-installer';
import { PackageManagerNotFound } from './exceptions';
import { Component } from '../component';
import { DependencyGraph } from './dependency-graph';
import { WorkspaceManifest, CreateFromComponentsOptions } from './manifest/workspace-manifest';
import { ROOT_NAME } from './constants';
import { CFG_PACKAGE_MANAGER_CACHE } from '../../constants';
import * as globalConfig from '../../api/consumer/lib/global-config';
import { DependencyResolver } from '../../consumer/component/dependencies/dependency-resolver';

export type PoliciesRegistry = SlotRegistry<DependenciesPolicy>;
export type PackageManagerSlot = SlotRegistry<PackageManager>;

export type MergeDependenciesFunc = (configuredExtensions: ExtensionDataList) => Promise<DependenciesPolicy>;

export type GetInstallerOptions = {
  cacheRootDirectory?: string;
};

export class DependencyResolverMain {
  static id = '@teambit/dependency-resolver';

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
    private envs: Environments,

    private logger: Logger,

    private packageManagerSlot: PackageManagerSlot
  ) {}

  /**
   * register a new package manager to the dependency resolver.
   */
  registerPackageManager(packageManager: PackageManager) {
    this.packageManagerSlot.register(packageManager);
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
    return new DependencyInstaller(packageManager, cacheRootDir);
  }

  get packageManagerName(): string {
    return this.config.packageManager;
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
    const env = this.envs.getEnvFromExtensions(configuredExtensions)?.env;
    if (env?.getDependencies && typeof env.getDependencies === 'function') {
      policiesFromEnv = await env.getDependencies();
    }
    const configuredIds = configuredExtensions.ids;
    configuredIds.forEach((extId) => {
      // Only get props from configured extensions on this specific component
      const currentPolicy = this.policiesRegistry.get(extId);
      if (currentPolicy) {
        policiesFromHooks = mergePolices([policiesFromHooks, currentPolicy]);
      }
    });
    const currentExtension = configuredExtensions.findExtension(DependencyResolverMain.id);
    const currentConfig = (currentExtension?.config as unknown) as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = currentConfig.policy;
    }
    const result = mergePolices([policiesFromEnv, policiesFromHooks, policiesFromConfig]);
    return result;
  }

  static runtime = MainRuntime;
  static dependencies = [Environments, LoggerExtension];

  static slots = [Slot.withType<DependenciesPolicy>(), Slot.withType<PackageManager>()];

  static defaultConfig: DependencyResolverWorkspaceConfig = {
    /**
     * default package manager.
     */
    packageManager: '@teambit/npm',
    policy: {},
    packageManagerArgs: [],
    strictPeerDependencies: true,
  };

  static async provider(
    [envs, loggerExt]: [Environments, LoggerExtension],
    config: DependencyResolverWorkspaceConfig,
    [policiesRegistry, packageManagerSlot]: [PoliciesRegistry, PackageManagerSlot]
  ) {
    // const packageManager = new PackageManagerLegacy(config.packageManager, logger);
    const logger = loggerExt.createLogger(DependencyResolverMain.id);
    const dependencyResolver = new DependencyResolverMain(config, policiesRegistry, envs, logger, packageManagerSlot);
    ConsumerComponent.registerOnComponentOverridesLoading(
      DependencyResolverMain.id,
      async (configuredExtensions: ExtensionDataList) => {
        const policies = await dependencyResolver.mergeDependencies(configuredExtensions);
        return transformPoliciesToLegacyDepsOverrides(policies);
      }
    );
    DependencyResolver.registerWorkspacePolicyGetter(dependencyResolver.getWorkspacePolicy.bind(dependencyResolver));

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
