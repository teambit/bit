import R from 'ramda';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { DependenciesPolicy, DependencyResolverVariantConfig, DependencyResolverWorkspaceConfig } from './types';
import { DependenciesOverridesData } from '../../consumer/config/component-overrides';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { Environments } from '../environments';
import { Logger } from '../logger';
import { PackageManager } from './package-manager';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import ConsumerComponent from '../../consumer/component';
import { DependencyInstaller } from './dependency-installer';
import { PackageManagerNotFound } from './exceptions';
import { Component } from '../component';
import { DependencyGraph } from './dependency-graph';

export type PoliciesRegistry = SlotRegistry<DependenciesPolicy>;
export type PackageManagerSlot = SlotRegistry<PackageManager>;

export class DependencyResolverExtension {
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

  /**
   * get a component dependency installer.
   */
  getInstaller() {
    const packageManager = this.packageManagerSlot.get(this.config.packageManager);

    if (!packageManager) {
      throw new PackageManagerNotFound(this.config.packageManager);
    }

    return new DependencyInstaller(packageManager);
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
    const env = this.envs.getEnvFromExtensions(configuredExtensions);
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
    const currentExtension = configuredExtensions.findExtension(DependencyResolverExtension.id);
    const currentConfig = (currentExtension?.config as unknown) as DependencyResolverVariantConfig;
    if (currentConfig && currentConfig.policy) {
      policiesFromConfig = currentConfig.policy;
    }
    const result = mergePolices([policiesFromEnv, policiesFromHooks, policiesFromConfig]);
    return result;
  }

  static dependencies = [Environments, Logger];

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
    [envs]: [Environments],
    config: DependencyResolverWorkspaceConfig,
    [policiesRegistry, packageManagerSlot]: [PoliciesRegistry, PackageManagerSlot]
  ) {
    // const packageManager = new PackageManagerLegacy(config.packageManager, logger);
    const dependencyResolver = new DependencyResolverExtension(config, policiesRegistry, envs, packageManagerSlot);
    ConsumerComponent.registerOnComponentOverridesLoading(
      DependencyResolverExtension.id,
      async (configuredExtensions: ExtensionDataList) => {
        const policies = await dependencyResolver.mergeDependencies(configuredExtensions);
        return transformPoliciesToLegacyDepsOverrides(policies);
      }
    );

    return dependencyResolver;
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
