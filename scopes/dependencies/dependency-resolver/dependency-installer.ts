import { mapSeries } from 'bluebird';
import { MainAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { ComponentMap } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from 'bit-bin/dist/utils/path';
import { MainAspectNotInstallable, RootDirNotDefined } from './exceptions';
import { PackageManager, PackageManagerInstallOptions } from './package-manager';
import { WorkspacePolicy } from './policy';

const DEFAULT_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
  copyPeerToRuntimeOnRoot: true,
  copyPeerToRuntimeOnComponents: false,
};

const DEFAULT_LINKING_OPTIONS: InstallLinkingOptions = {
  bitLinkType: 'link',
  linkCoreAspects: true,
};

type InstallArgs = {
  rootDir: string | undefined;
  rootPolicy: WorkspacePolicy;
  componentDirectoryMap: ComponentMap<string>;
  options: PackageManagerInstallOptions;
};

export type BitExtendedLinkType = 'none' | BitLinkType;
export type BitLinkType = 'link' | 'install';

export type InstallLinkingOptions = {
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

    private linkingOptions?: InstallLinkingOptions,

    private preInstallSubscriberList?: PreInstallSubscriberList,

    private postInstallSubscriberList?: PostInstallSubscriberList
  ) {}

  async install(
    rootDir: string | undefined,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: PackageManagerInstallOptions = DEFAULT_INSTALL_OPTIONS
  ) {
    const args = {
      componentDirectoryMap,
      options,
      rootDir,
      rootPolicy,
    };
    await this.runPrePostSubscribers(this.preInstallSubscriberList, 'pre', args);
    const mainAspect: MainAspect = this.aspectLoader.mainAspect;
    const finalRootDir = rootDir || this.rootDir;
    const linkingOpts = Object.assign({}, DEFAULT_LINKING_OPTIONS, this.linkingOptions || {});
    if (!finalRootDir) {
      throw new RootDirNotDefined();
    }
    // Make sure to take other default if passed options with only one option
    const calculatedOpts = Object.assign({}, DEFAULT_INSTALL_OPTIONS, { cacheRootDir: this.cacheRootDir }, options);
    if (linkingOpts.bitLinkType === 'install') {
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

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(finalRootDir, rootPolicy, componentDirectoryMap, calculatedOpts);
    await this.runPrePostSubscribers(this.postInstallSubscriberList, 'post', args);
    return componentDirectoryMap;
  }

  private async runPrePostSubscribers(
    subscribers: PreInstallSubscriberList | PostInstallSubscriberList = [],
    type: 'pre' | 'post',
    args: InstallArgs
  ): Promise<void> {
    let message = 'running pre install subscribers';
    if (type === 'post') {
      message = 'running pre install subscribers';
    }
    this.logger.setStatusLine(message);
    await mapSeries(subscribers, async (subscriber) => {
      return subscriber(this, args);
    });
    this.logger.consoleSuccess(message);
  }
}
