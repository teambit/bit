import mapSeries from 'p-map-series';
import path from 'path';
import fs from 'fs-extra';
import { MainAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { ComponentMap } from '@teambit/component';
import { WorkspaceManifest, CreateFromComponentsOptions, DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from '@teambit/legacy/dist/utils/path';
import { PeerDependencyRules, ProjectManifest } from '@pnpm/types';
import { fromPairs } from 'lodash';
import { MainAspectNotInstallable, RootDirNotDefined } from './exceptions';
import { PackageManager, PackageManagerInstallOptions, PackageImportMethod } from './package-manager';
import { WorkspacePolicy } from './policy';

const DEFAULT_PM_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
  copyPeerToRuntimeOnRoot: true,
  copyPeerToRuntimeOnComponents: false,
  installPeersFromEnvs: false,
};

const DEFAULT_INSTALL_OPTIONS: InstallOptions = {
  installTeambitBit: false,
};

export type InstallArgs = {
  rootDir: string | undefined;
  rootPolicy: WorkspacePolicy;
  componentDirectoryMap: ComponentMap<string>;
  options: InstallOptions;
  packageManagerOptions: PackageManagerInstallOptions;
};

export type InstallOptions = {
  installTeambitBit: boolean;
  packageManagerConfigRootDir?: string;
};

export type PreInstallSubscriber = (installer: DependencyInstaller, installArgs: InstallArgs) => Promise<void>;
export type PreInstallSubscriberList = Array<PreInstallSubscriber>;

export type PostInstallSubscriber = (installer: DependencyInstaller, installArgs: InstallArgs) => Promise<void>;
export type PostInstallSubscriberList = Array<PostInstallSubscriber>;

export class DependencyInstaller {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    private aspectLoader: AspectLoaderMain,

    private logger: Logger,

    private dependencyResolver: DependencyResolverMain,

    private rootDir?: string | PathAbsolute,

    private cacheRootDir?: string | PathAbsolute,

    private preInstallSubscriberList?: PreInstallSubscriberList,

    private postInstallSubscriberList?: PostInstallSubscriberList,

    private nodeLinker?: 'hoisted' | 'isolated',

    private packageImportMethod?: PackageImportMethod,

    private sideEffectsCache?: boolean,

    private nodeVersion?: string,

    private engineStrict?: boolean,

    private peerDependencyRules?: PeerDependencyRules
  ) {}

  async install(
    rootDir: string | undefined,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: InstallOptions = DEFAULT_INSTALL_OPTIONS,
    packageManagerOptions: PackageManagerInstallOptions = DEFAULT_PM_INSTALL_OPTIONS
  ) {
    const finalRootDir = rootDir ?? this.rootDir;
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    const { workspaceManifest, componentsManifests } = await this.getComponentManifests(
      componentDirectoryMap,
      rootPolicy,
      finalRootDir,
      packageManagerOptions,
      packageManagerOptions.copyPeerToRuntimeOnComponents
    );
    return this.installComponents(
      finalRootDir,
      workspaceManifest,
      componentsManifests,
      rootPolicy,
      componentDirectoryMap,
      options,
      packageManagerOptions
    );
  }

  async installComponents(
    rootDir: string | undefined,
    workspaceManifest: WorkspaceManifest,
    componentsManifests: Record<string, ProjectManifest>,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: InstallOptions = DEFAULT_INSTALL_OPTIONS,
    packageManagerOptions: PackageManagerInstallOptions = DEFAULT_PM_INSTALL_OPTIONS
  ) {
    const args = {
      componentDirectoryMap,
      options,
      packageManagerOptions,
      rootDir,
      rootPolicy,
    };
    await this.runPrePostSubscribers(this.preInstallSubscriberList, 'pre', args);
    const mainAspect: MainAspect = this.aspectLoader.mainAspect;
    const finalRootDir = rootDir || this.rootDir;
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    // Make sure to take other default if passed options with only one option
    const calculatedPmOpts = {
      ...DEFAULT_PM_INSTALL_OPTIONS,
      cacheRootDir: this.cacheRootDir,
      nodeLinker: this.nodeLinker,
      packageImportMethod: this.packageImportMethod,
      sideEffectsCache: this.sideEffectsCache,
      nodeVersion: this.nodeVersion,
      engineStrict: this.engineStrict,
      packageManagerConfigRootDir: options.packageManagerConfigRootDir,
      peerDependencyRules: this.peerDependencyRules,
      ...packageManagerOptions,
    };
    if (options.installTeambitBit) {
      if (!mainAspect.version || !mainAspect.packageName) {
        throw new MainAspectNotInstallable();
      }
      const version = mainAspect.version;
      rootPolicy.add({
        dependencyId: mainAspect.packageName,
        lifecycleType: 'runtime',
        value: {
          version,
        },
      });
    }

    if (!packageManagerOptions.rootComponents && !packageManagerOptions.keepExistingModulesDir) {
      // Remove node modules dir for all components dirs, since it might contain left overs from previous install.
      //
      // This is not needed when "rootComponents" are used, as in that case the package manager handles the node_modules
      // and it never leaves node_modules in a broken state.
      // Removing node_modules in that case would delete useful state information that is used by Yarn or pnpm.
      await this.cleanCompsNodeModules(componentDirectoryMap);
    }

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(
      finalRootDir,
      componentsManifests,
      workspaceManifest,
      componentDirectoryMap,
      calculatedPmOpts
    );
    await this.runPrePostSubscribers(this.postInstallSubscriberList, 'post', args);
    return componentDirectoryMap;
  }

  public async getComponentManifests(
    componentDirectoryMap: ComponentMap<string>,
    rootPolicy: WorkspacePolicy,
    rootDir: string,
    installOptions: Pick<PackageManagerInstallOptions, 'dedupe' | 'dependencyFilterFn'>,
    copyPeerToRuntime = false
  ) {
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe: installOptions.dedupe,
      dependencyFilterFn: installOptions.dependencyFilterFn,
    };
    const workspaceManifest = await this.dependencyResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootPolicy,
      rootDir,
      componentDirectoryMap.components,
      options
    );
    const componentsManifests: Record<string, ProjectManifest> = componentDirectoryMap
      .toArray()
      .reduce((acc, [component, dir]) => {
        const packageName = this.dependencyResolver.getPackageName(component);
        const manifest = workspaceManifest.componentsManifestsMap.get(packageName);
        if (manifest) {
          acc[dir] = manifest.toJson({ copyPeerToRuntime });
          acc[dir].defaultPeerDependencies = fromPairs(
            manifest.envPolicy.peersAutoDetectPolicy.entries.map(({ name, version }) => [name, version])
          );
        }
        return acc;
      }, {});
    return {
      workspaceManifest,
      componentsManifests,
    };
  }

  private async cleanCompsNodeModules(componentDirectoryMap: ComponentMap<string>) {
    const promises = componentDirectoryMap.toArray().map(([, dir]) => {
      const nmDir = path.join(dir, 'node_modules');
      return fs.remove(nmDir);
    });
    return Promise.all(promises);
  }

  private async runPrePostSubscribers(
    subscribers: PreInstallSubscriberList | PostInstallSubscriberList = [],
    type: 'pre' | 'post',
    args: InstallArgs
  ): Promise<void> {
    let message = 'running pre install subscribers';
    if (type === 'post') {
      message = 'running post install subscribers';
    }
    this.logger.setStatusLine(message);
    await mapSeries(subscribers, async (subscriber) => {
      return subscriber(this, args);
    });
    this.logger.consoleSuccess(message);
  }
}
