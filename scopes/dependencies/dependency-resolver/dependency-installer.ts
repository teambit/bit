import mapSeries from 'p-map-series';
import path from 'path';
import fs from 'fs-extra';
import { MainAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { ComponentMap } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from '@teambit/legacy/dist/utils/path';
import { MainAspectNotInstallable, RootDirNotDefined } from './exceptions';
import { PackageManager, PackageManagerInstallOptions } from './package-manager';
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

    private rootDir?: string | PathAbsolute,

    private cacheRootDir?: string | PathAbsolute,

    private preInstallSubscriberList?: PreInstallSubscriberList,

    private postInstallSubscriberList?: PostInstallSubscriberList,

    private nodeLinker?: 'hoisted' | 'isolated'
  ) {}

  async install(
    rootDir: string | undefined,
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
      packageManagerConfigRootDir: options.packageManagerConfigRootDir,
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

    if (!packageManagerOptions.rootComponents?.length) {
      // remove node modules dir for all components dirs, since it might contain left overs from previous install
      await this.cleanCompsNodeModules(componentDirectoryMap);
    }

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootPolicy, componentDirectoryMap, calculatedPmOpts);
    await this.runPrePostSubscribers(this.postInstallSubscriberList, 'post', args);
    return componentDirectoryMap;
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
