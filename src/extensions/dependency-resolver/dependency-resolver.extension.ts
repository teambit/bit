import { RawComponentState, DependenciesDefinition, DependencyResolverWorkspaceConfig, installOpts } from './types';
import { LoggerExt, Logger } from '../logger';
import { CLIExtension } from '../cli';
import PackageManager from './package-manager';
import { WorkspaceExt, Workspace } from '../workspace';
import InstallCmd from './install.cmd';
import { removeExistingLinksInNodeModules, symlinkCapsulesInNodeModules } from './utils';
// TODO: it's weird we take it from here.. think about it
import { Capsule } from '../isolator';

// TODO: add example of exposing a hook once its API is final by harmony
// export const Dependencies = Hooks.create();
// export const FileDependencies = Hooks.create();

export class DependencyResolverExtension {
  static id = '@teambit/dependency-resolver';
  static dependencies = [CLIExtension, WorkspaceExt, LoggerExt];
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
    [cli, workspace, logger]: [CLIExtension, Workspace, Logger],
    config: DependencyResolverWorkspaceConfig
    // TODO: add slots
  ) {
    const packageManager = new PackageManager(config.packageManager, logger);
    const DependencyResolver = new DependencyResolverExtension(config, workspace, packageManager);
    cli.register(new InstallCmd(DependencyResolver));
    return DependencyResolver;
  }

  constructor(
    /**
     * Dependency resolver  extension configuration.
     */
    readonly config: DependencyResolverWorkspaceConfig,

    /**
     * dependencies installer.
     */
    private workspace: Workspace,

    /**
     * package manager client.
     */
    private packageManager: PackageManager
  ) {}

  get packageManagerName(): string {
    return this.config.packageManager;
  }

  // TODO: might need to moved to workspace extension
  async workspaceInstall() {
    //      this.reporter.info('Installing component dependencies');
    //      this.reporter.setStatusText('Installing');
    const components = await this.workspace.list();
    // this.reporter.info('Isolating Components');
    const isolatedEnvs = await this.workspace.load(components.map(c => c.id.toString()));
    const packageManagerName = this.config.packageManager;
    // this.reporter.info('Installing workspace dependencies');
    await removeExistingLinksInNodeModules(isolatedEnvs);
    await this.packageManager.runInstallInFolder(process.cwd(), {
      packageManager: packageManagerName
    });
    await symlinkCapsulesInNodeModules(isolatedEnvs);
    // this.reporter.end();
    return isolatedEnvs;
  }

  async capsulesInstall(capsules: Capsule[], opts: installOpts = {}) {
    return this.packageManager.capsulesInstall(capsules, opts);
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
