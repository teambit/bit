import { RawComponentState, DependenciesDefinition, DependencyResolverWorkspaceConfig, installOpts } from './types';
import { LoggerExt, Logger } from '../logger';
import PackageManager from './package-manager';
// TODO: it's weird we take it from here.. think about it../workspace/utils
import { Capsule } from '../isolator';

// TODO: add example of exposing a hook once its API is final by harmony
// export const Dependencies = Hooks.create();
// export const FileDependencies = Hooks.create();

export class DependencyResolverExtension {
  static id = '@teambit/dependency-resolver';
  static dependencies = [LoggerExt];
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
    [logger]: [Logger],
    config: DependencyResolverWorkspaceConfig
    // TODO: add slots
  ) {
    const packageManager = new PackageManager(config.packageManager, logger);
    const DependencyResolver = new DependencyResolverExtension(config, packageManager);
    return DependencyResolver;
  }

  constructor(
    /**
     * Dependency resolver  extension configuration.
     */
    readonly config: DependencyResolverWorkspaceConfig,

    /**
     * package manager client.
     */
    private packageManager: PackageManager
  ) {}

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  async capsulesInstall(capsules: Capsule[], opts: installOpts = { packageManager: this.packageManagerName }) {
    return this.packageManager.capsulesInstall(capsules, opts);
  }

  async folderInstall(folder: string, opts: installOpts = { packageManager: this.packageManagerName }) {
    return this.packageManager.runInstallInFolder(folder, opts);
  }

  /**
   * Will return the final dependencies of the component after all calculation
   * @param rawComponent
   * @param dependencyResolverWorkspaceConfig
   */
  // TODO: remove this rule upon implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDependencies(
    // TODO: remove this rule upon implementation
    // eslint-disable-next-line
    rawComponent: RawComponentState,
    // TODO: remove this rule upon implementation
    // eslint-disable-next-line
    dependencyResolverWorkspaceConfig: DependencyResolverWorkspaceConfig
  ): DependenciesDefinition {
    // TODO: remove this rule upon implementation
    // @ts-ignore eslint-disable-next-line
    return undefined;
  }
}
