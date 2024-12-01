import mapSeries from 'p-map-series';
import path from 'path';
import fs from 'fs-extra';
import { MainAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { ComponentMap } from '@teambit/component';
import { type DependenciesGraph } from '@teambit/legacy/dist/scope/models/dependencies-graph';
import { Logger } from '@teambit/logger';
import { PathAbsolute } from '@teambit/toolbox.path.path';
import { PeerDependencyRules, ProjectManifest } from '@pnpm/types';
import { MainAspectNotInstallable, RootDirNotDefined } from './exceptions';
import { PackageManager, PackageManagerInstallOptions, PackageImportMethod } from './package-manager';
import { WorkspacePolicy } from './policy';
import { CreateFromComponentsOptions } from './manifest';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

const DEFAULT_PM_INSTALL_OPTIONS: PackageManagerInstallOptions = {
  dedupe: true,
  copyPeerToRuntimeOnRoot: true,
  copyPeerToRuntimeOnComponents: false,
  installPeersFromEnvs: false,
};

const DEFAULT_INSTALL_OPTIONS: InstallOptions = {
  installTeambitBit: false,
  excludeExtensionsDependencies: false,
};

export type DepInstallerContext = {
  inCapsule?: boolean;
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
  resolveVersionsFromDependenciesOnly?: boolean;
  linkedDependencies?: Record<string, Record<string, string>>;
  forceTeambitHarmonyLink?: boolean;
  excludeExtensionsDependencies?: boolean;
  dedupeInjectedDeps?: boolean;
  dependenciesGraph?: DependenciesGraph;
};

export type GetComponentManifestsOptions = {
  componentDirectoryMap: ComponentMap<string>;
  rootPolicy: WorkspacePolicy;
  rootDir: string;
  resolveVersionsFromDependenciesOnly?: boolean;
  referenceLocalPackages?: boolean;
  hasRootComponents?: boolean;
  excludeExtensionsDependencies?: boolean;
} & Pick<
  PackageManagerInstallOptions,
  'dedupe' | 'dependencyFilterFn' | 'copyPeerToRuntimeOnComponents' | 'copyPeerToRuntimeOnRoot' | 'installPeersFromEnvs'
>;

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

    private peerDependencyRules?: PeerDependencyRules,

    private neverBuiltDependencies?: string[],

    private preferOffline?: boolean,

    private installingContext: DepInstallerContext = {}
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
    const manifests = await this.getComponentManifests({
      ...packageManagerOptions,
      componentDirectoryMap,
      rootPolicy,
      rootDir: finalRootDir,
      resolveVersionsFromDependenciesOnly: options.resolveVersionsFromDependenciesOnly,
      referenceLocalPackages: packageManagerOptions.rootComponentsForCapsules,
      excludeExtensionsDependencies: options.excludeExtensionsDependencies,
    });
    return this.installComponents(
      finalRootDir,
      manifests,
      rootPolicy,
      componentDirectoryMap,
      options,
      packageManagerOptions
    );
  }

  async installComponents(
    rootDir: string | undefined,
    manifests: Record<string, ProjectManifest>,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    options: InstallOptions = DEFAULT_INSTALL_OPTIONS,
    packageManagerOptions: PackageManagerInstallOptions = DEFAULT_PM_INSTALL_OPTIONS
  ): Promise<{ dependenciesChanged: boolean }> {
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
    if (options.linkedDependencies) {
      manifests = JSON.parse(JSON.stringify(manifests));
      const linkedDependencies = JSON.parse(
        JSON.stringify(options.linkedDependencies)
      ) as typeof options.linkedDependencies;
      if (linkedDependencies[finalRootDir]) {
        const directDeps = new Set<string>();
        Object.values(manifests).forEach((manifest) => {
          for (const depName of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
            directDeps.add(depName);
          }
        });
        for (const manifest of Object.values(manifests)) {
          if (manifest.name && directDeps.has(manifest.name)) {
            delete linkedDependencies[finalRootDir][manifest.name];
          }
        }
        if (options.forceTeambitHarmonyLink && manifests[finalRootDir].dependencies?.['@teambit/harmony']) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          delete manifests[finalRootDir].dependencies!['@teambit/harmony'];
        }
      }
      Object.entries(linkedDependencies).forEach(([dir, linkedDeps]) => {
        if (!manifests[dir]) {
          manifests[dir] = {};
        }
        manifests[dir].dependencies = {
          ...linkedDeps,
          ...manifests[dir].dependencies,
        };
      });
    }
    const isJsonCmd = process.argv.includes('--json') || process.argv.includes('-j');
    const hidePackageManagerOutput =
      Boolean(this.installingContext.inCapsule && process.env.VERBOSE_PM_OUTPUT !== 'true') || isJsonCmd;

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
      hidePackageManagerOutput,
      neverBuiltDependencies: ['core-js', ...(this.neverBuiltDependencies ?? [])],
      preferOffline: this.preferOffline,
      dedupeInjectedDeps: options.dedupeInjectedDeps,
      dependenciesGraph: options.dependenciesGraph,
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
      try {
        // Remove node modules dir for all components dirs, since it might contain left overs from previous install.
        //
        // This is not needed when "rootComponents" are used, as in that case the package manager handles the node_modules
        // and it never leaves node_modules in a broken state.
        // Removing node_modules in that case would delete useful state information that is used by Yarn or pnpm.
        await this.cleanCompsNodeModules(componentDirectoryMap);
      } catch (err) {
        this.logger.debug('failed to remove node_modules directories from components', err);
        // A failure to remove the node_modules directory should not cause the process to fail
      }
    }

    const messagePrefix = 'running package installation';
    const messageSuffix = `using ${this.packageManager.name}`;
    const message = this.installingContext?.inCapsule
      ? `(capsule) ${messagePrefix} in root dir ${this.rootDir} ${messageSuffix}`
      : `${messagePrefix} ${messageSuffix}`;
    if (!hidePackageManagerOutput) {
      this.logger.setStatusLine(message);
    }
    const startTime = process.hrtime();

    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    const installResult = await this.packageManager.install(
      {
        rootDir: finalRootDir,
        manifests,
        componentDirectoryMap,
      },
      calculatedPmOpts
    );
    if (!hidePackageManagerOutput) {
      this.logger.consoleSuccess(`done ${message}`, startTime);
    }
    await this.runPrePostSubscribers(this.postInstallSubscriberList, 'post', args);
    return installResult;
  }

  public async pruneModules(rootDir: string): Promise<void> {
    if (!this.packageManager.pruneModules) {
      return;
    }
    await this.packageManager.pruneModules(rootDir);
  }

  /**
   * Compute all the component manifests (a.k.a. package.json files) that should be passed to the package manager
   * in order to install the dependencies.
   */
  public async getComponentManifests({
    componentDirectoryMap,
    rootPolicy,
    rootDir,
    dedupe,
    dependencyFilterFn,
    copyPeerToRuntimeOnComponents,
    copyPeerToRuntimeOnRoot,
    installPeersFromEnvs,
    resolveVersionsFromDependenciesOnly,
    referenceLocalPackages,
    hasRootComponents,
    excludeExtensionsDependencies,
  }: GetComponentManifestsOptions) {
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe,
      dependencyFilterFn,
      resolveVersionsFromDependenciesOnly,
      referenceLocalPackages,
      hasRootComponents,
      excludeExtensionsDependencies,
    };
    const workspaceManifest = await this.dependencyResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootPolicy,
      rootDir,
      componentDirectoryMap.components,
      options,
      this.installingContext
    );
    const manifests: Record<string, ProjectManifest> = componentDirectoryMap
      .toArray()
      .reduce((acc, [component, dir]) => {
        const packageName = this.dependencyResolver.getPackageName(component);
        const manifest = workspaceManifest.componentsManifestsMap.get(packageName);
        if (manifest) {
          acc[dir] = manifest.toJson({ copyPeerToRuntime: copyPeerToRuntimeOnComponents });
        }
        return acc;
      }, {});
    if (!manifests[rootDir]) {
      manifests[rootDir] = workspaceManifest.toJson({
        copyPeerToRuntime: copyPeerToRuntimeOnRoot,
        installPeersFromEnvs,
      });
    }
    return manifests;
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
    const message = this.installingContext?.inCapsule
      ? `(capsule) running ${type} install subscribers in root dir ${this.rootDir}`
      : `running ${type} install subscribers`;
    if (!this.installingContext?.inCapsule) {
      this.logger.setStatusLine(message);
    }
    await mapSeries(subscribers, async (subscriber) => {
      return subscriber(this, args);
    });
    if (!this.installingContext?.inCapsule) {
      this.logger.consoleSuccess(message);
    }
  }
}
