import R from 'ramda';
import { SlotRegistry, Slot } from '@teambit/harmony';
import {
  DependenciesPolicy,
  DependencyResolverVariantConfig,
  DependencyResolverWorkspaceConfig,
  installOpts
} from './types';
import { DependenciesOverridesData } from '../../consumer/config/component-overrides';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { Environments } from '../environments';
import { Logger } from '../logger';
import PackageManager from './package-manager';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { Capsule } from '../isolator';
import ConsumerComponent from '../../consumer/component';

export type PoliciesRegistry = SlotRegistry<DependenciesPolicy>;

export class DependencyResolverExtension {
  static id = '@teambit/dependency-resolver';
  static dependencies = [Environments, Logger];
  static slots = [Slot.withType<DependenciesPolicy>()];
  static defaultConfig: DependencyResolverWorkspaceConfig = {
    /**
     * default package manager.
     */
    packageManager: 'npm',
    policy: {},
    packageManagerArgs: [],
    strictPeerDependencies: true
  };
  static async provider(
    [envs, logger]: [Environments, Logger],
    config: DependencyResolverWorkspaceConfig,
    [policiesRegistry]: [PoliciesRegistry]
  ) {
    const packageManager = new PackageManager(config.packageManager, logger);
    const dependencyResolver = new DependencyResolverExtension(config, packageManager, policiesRegistry, envs);
    ConsumerComponent.registerOnComponentOverridesLoading(
      DependencyResolverExtension.id,
      async (configuredExtensions: ExtensionDataList) => {
        const policies = await dependencyResolver.mergeDependencies(configuredExtensions);
        return transformPoliciesToLegacyDepsOverrides(policies);
      }
    );

    return dependencyResolver;
  }

  constructor(
    /**
     * Dependency resolver  extension configuration.
     */
    readonly config: DependencyResolverWorkspaceConfig,

    /**
     * package manager client.
     */
    private packageManager: PackageManager,

    /**
     * Registry for changes by other extensions.
     */
    private policiesRegistry: PoliciesRegistry,

    /**
     * envs extension.
     */
    private envs: Environments
  ) {}

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  /**
   * register new dependencies policies
   */
  registerDependenciesPolicies(policy: DependenciesPolicy): void {
    return this.policiesRegistry.register(policy);
  }

  async capsulesInstall(capsules: Capsule[], opts: installOpts = { packageManager: this.packageManagerName }) {
    return this.packageManager.capsulesInstall(capsules, opts);
  }

  async folderInstall(folder: string, opts: installOpts = { packageManager: this.packageManagerName }) {
    return this.packageManager.runInstallInFolder(folder, opts);
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
    if (env?.dependencies && typeof env.dependencies === 'function') {
      policiesFromEnv = await env.dependencies();
    }
    const configuredIds = configuredExtensions.ids;
    configuredIds.forEach(extId => {
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
}

function mergePolices(policies: DependenciesPolicy[]) {
  const result: DependenciesPolicy = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {}
  };
  return R.reduce(R.mergeDeepRight, result, policies);
}

function transformPoliciesToLegacyDepsOverrides(policy: DependenciesPolicy): DependenciesOverridesData {
  // TODO: once we support DetailedDependencyPolicy in the object we should do here something
  // TODO: it might be that we will have to return it as is, and handle it in the legacy
  // TODO: since we don't have enough info about handle force here
  return policy;
}
