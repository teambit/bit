import mapSeries from 'p-map-series';
import path from 'path';
import fs from 'fs-extra';
import type { MainAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import type { ComponentMap } from '@teambit/component';
import { type DependenciesGraph } from '@teambit/objects';
import type { Logger } from '@teambit/logger';
import type { PathAbsolute } from '@teambit/toolbox.path.path';
import type { PeerDependencyRules, ProjectManifest } from '@pnpm/types';
import { MainAspectNotInstallable, RootDirNotDefined, SelfHostedVirtualStoreTransition } from './exceptions';
import { isPathInsideOrEqual, parseRecordedVirtualStoreDir } from './hoisted-resolution-bridge';
import type {
  PackageManager,
  PackageManagerInstallOptions,
  PackageImportMethod,
  PackageExtension,
} from './package-manager';
import type { WorkspacePolicy } from './policy';
import type { CreateFromComponentsOptions } from './manifest';
import type { DependencyResolverMain } from './dependency-resolver.main.runtime';

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
  forcedHarmonyVersion?: string;
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
  includeAllEnvPeers?: boolean;
  hasRootComponents?: boolean;
  excludeExtensionsDependencies?: boolean;
} & Pick<
  PackageManagerInstallOptions,
  | 'dedupe'
  | 'dependencyFilterFn'
  | 'copyPeerToRuntimeOnComponents'
  | 'copyPeerToRuntimeOnRoot'
  | 'installPeersFromEnvs'
  | 'resolveEnvPeersFromRoot'
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

    private allowScripts?: Record<string, boolean | 'warn'>,

    private dangerouslyAllowAllScripts?: boolean,

    private preferOffline?: boolean,

    private minimumReleaseAge?: number,

    private minimumReleaseAgeExclude?: string[],

    private patchedDependencies?: Record<string, string>,

    private packageExtensions?: Record<string, PackageExtension>,

    private installingContext: DepInstallerContext = {}
  ) {}

  /**
   * `packageExtensions` bit ships for published envs whose `tsconfig.json` `extends` a package
   * they never declare, merged under the workspace's own `packageExtensions` so a user entry for
   * the same package always wins.
   *
   * Only applied under the global virtual store. TypeScript resolves `extends` with its own
   * resolver, walking up from the tsconfig's real location: under the project-local layout that
   * walk passes pnpm's privately hoisted `node_modules/.pnpm/node_modules`, which catches any
   * phantom dependency, so these envs work by accident. A global-store slot walks up into the
   * store and finds nothing. Declaring the missing dependency via `packageExtensions` - pnpm's
   * documented remedy for exactly this - places the real package inside the slot's
   * `node_modules`, where the tsconfig resolver finds it.
   *
   * An extension merges *underneath* the manifest (it only adds entries the package lacks), an
   * entry whose package never installs is not an error (unlike `patchedDependencies`), and a
   * `name@range` key scopes an entry to the versions that need it. None of these envs import
   * their extends-target at runtime - the reference lives only in config files - so the added
   * registry copy cannot shadow the host-provided core-aspect singletons.
   *
   * The list covers teambit's own published envs known to carry the phantom `extends`
   * (react-env fixed it in 2.x by inlining, hence the `@1` scope). Third-party envs with the
   * same shape are covered by the user-level `packageExtensions` config this merges under.
   *
   * Both halves of every entry are version-scoped. The keys cover only the majors shipped and
   * verified to carry the phantom - a future major of an env must be re-verified before its
   * range moves, rather than inheriting the workaround (and its injected dependency edge)
   * automatically. The added dependencies are caret-pinned to the major whose file layout the
   * extension exists for - a floating `*` would follow a future major that may not keep
   * `typescript/tsconfig.json` (or the rspack env's `config/`) where the extending tsconfigs
   * point, and would drift across installs.
   */
  private withBuiltInPackageExtensions(
    fromConfig: Record<string, PackageExtension> | undefined,
    enableGlobalVirtualStore: boolean
  ): Record<string, PackageExtension> | undefined {
    if (!enableGlobalVirtualStore) return fromConfig;
    const react = { dependencies: { '@teambit/react': '^1.0.0' } };
    const builtIn: Record<string, PackageExtension> = {
      '@teambit/node.envs.node-babel-mocha@<3': react,
      '@teambit/node.envs.node-typescript-mocha@<3': react,
      '@teambit/react.internal.base-react-env@1': react,
      '@teambit/rspack.envs.react-env@<2': react,
      '@teambit/react.react-env@1': react,
      '@teambit/cloud.envs.cloud-react@0': {
        dependencies: { '@teambit/rspack.envs.react-env': '^1.0.0' },
      },
    };
    return { ...builtIn, ...fromConfig };
  }

  /**
   * Patch paths are configured relative to the workspace root, but pnpm resolves a relative one
   * from the directory it is installing in. Those coincide for a workspace install and do not for
   * a capsule install, which runs in the capsules directory - the patch would be looked for
   * under the capsule root and the install would fail on the missing file.
   *
   * So capsule installs get absolute paths, resolved against the workspace root the caller passes
   * as the package manager config root. Workspace installs keep the configured spelling: pnpm
   * records it in the lockfile, and an absolute path there would be machine-specific.
   */
  private resolvePatchPaths(
    installRootDir: string,
    packageManagerConfigRootDir?: string
  ): Record<string, string> | undefined {
    if (!this.patchedDependencies) return undefined;
    if (!packageManagerConfigRootDir || packageManagerConfigRootDir === installRootDir) {
      return this.patchedDependencies;
    }
    return Object.fromEntries(
      Object.entries(this.patchedDependencies).map(([selector, patchPath]) => [
        selector,
        path.isAbsolute(patchPath) ? patchPath : path.join(packageManagerConfigRootDir, patchPath),
      ])
    );
  }

  /**
   * Refuse an install that would switch this workspace between the project-local and the global
   * virtual store while the running bit is installed inside this workspace's `node_modules`.
   *
   * Both layouts are safe in steady state: repeat installs preserve the top-level package
   * directories the running process resolves from, and the end-of-install compile refreshes the
   * per-variant copies (`.pnpm` entries or store slots). A layout *switch* is different - it
   * relocates every injected component package, rebuilding the top-level directories from
   * source, so their compiled `dist` disappears mid-install. A bit running from those very
   * directories loses its own code before it can reach the compile step that would restore it,
   * and dies leaving `node_modules` unusable. The transition has to run once from a bit
   * installation outside the workspace; detect the combination up front and fail before
   * anything is rewritten.
   *
   * The current layout is read off `node_modules/.modules.yaml`: pnpm records `virtualStoreDir`
   * as `.pnpm` for the project-local layout and as a path escaping the workspace for the global
   * one. No manifest (fresh install) or an unreadable one means nothing can be mid-flight -
   * a fresh install writes whichever layout is requested.
   */
  private async assertSafeVirtualStoreTransition(finalRootDir: string, enableGlobalVirtualStore: boolean) {
    const modulesDir = path.join(finalRootDir, 'node_modules');
    let modulesManifest: string;
    try {
      modulesManifest = await fs.readFile(path.join(modulesDir, '.modules.yaml'), 'utf8');
    } catch {
      return;
    }
    // same reader as the bootstrap-time layout gate, so the guard and the bridge can never
    // disagree about which layout the workspace is currently on
    const virtualStoreDir = parseRecordedVirtualStoreDir(modulesManifest);
    if (!virtualStoreDir) return;
    // compare real paths on both sides: resolving the recorded dir against the as-given (possibly
    // symlinked) workspace spelling while comparing to the workspace's realpath would misread a
    // project-local store as global for a workspace reached through a symlink
    const workspaceRealpath = await fs.realpath(finalRootDir).catch(() => finalRootDir);
    const resolvedStoreDir = path.resolve(workspaceRealpath, 'node_modules', virtualStoreDir);
    const storeRealpath = await fs.realpath(resolvedStoreDir).catch(() => resolvedStoreDir);
    const currentIsGlobal = !isPathInsideOrEqual(storeRealpath, workspaceRealpath);
    if (currentIsGlobal === enableGlobalVirtualStore) return;

    // the switch only endangers a bit whose own code lives inside the node_modules being
    // rewritten. `__dirname` sits in the running installation's copy of this component; injected
    // workspace packages are real directories, so a workspace-provided bit resolves under the
    // workspace realpath while bvm/global installations resolve elsewhere.
    const runningFrom = await fs.realpath(__dirname).catch(() => __dirname);
    const selfHosted = isPathInsideOrEqual(runningFrom, path.join(workspaceRealpath, 'node_modules'));
    if (!selfHosted) return;
    throw new SelfHostedVirtualStoreTransition(finalRootDir, enableGlobalVirtualStore);
  }

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
    const { manifests } = await this.getComponentManifests({
      ...packageManagerOptions,
      componentDirectoryMap,
      rootPolicy,
      rootDir: finalRootDir,
      resolveVersionsFromDependenciesOnly: options.resolveVersionsFromDependenciesOnly,
      referenceLocalPackages: packageManagerOptions.rootComponentsForCapsules,
      includeAllEnvPeers: packageManagerOptions.rootComponentsForCapsules,
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
    // guard here rather than in `install()`: workspace installs enter through this method
    // directly (InstallMain._installModules), so `install()` is not a choke point.
    if (!this.installingContext?.inCapsule) {
      await this.assertSafeVirtualStoreTransition(
        finalRootDir,
        this.dependencyResolver.enableGlobalVirtualStore()
      );
    }
    if (options.linkedDependencies) {
      manifests = JSON.parse(JSON.stringify(manifests));
      const linkedDependencies = JSON.parse(
        JSON.stringify(options.linkedDependencies)
      ) as typeof options.linkedDependencies;
      if (linkedDependencies[finalRootDir]) {
        if (options.forcedHarmonyVersion == null && manifests[finalRootDir].dependencies?.['@teambit/harmony']) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          delete manifests[finalRootDir].dependencies!['@teambit/harmony'];
        }
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
      // Capsules stay on the project-local virtual store even when the global one is enabled.
      // A capsule is a self-contained build sandbox, and TypeScript's declaration emit relies on
      // that: it names the type of an inferred value (`compiler()` returning a `@teambit/compiler`
      // type, say) through the package that declares it, and can only do so while that package
      // sits inside the capsule. Moving env and aspect packages out to the shared store makes
      // `bit build` of any custom env fail with TS2742 ("cannot be named without a reference to
      // ../../../node_modules/@teambit/compiler"). Workspace installs - the ones a user actually
      // waits on repeatedly - still get the global store.
      enableGlobalVirtualStore:
        !this.installingContext?.inCapsule && this.dependencyResolver.enableGlobalVirtualStore(),
      globalVirtualStoreDir: this.installingContext?.inCapsule
        ? undefined
        : await this.dependencyResolver.getGlobalVirtualStoreDir(finalRootDir),
      patchedDependencies: this.resolvePatchPaths(finalRootDir, options.packageManagerConfigRootDir),
      packageExtensions: this.withBuiltInPackageExtensions(
        this.packageExtensions,
        !this.installingContext?.inCapsule && this.dependencyResolver.enableGlobalVirtualStore()
      ),
      minimumReleaseAge: this.minimumReleaseAge,
      minimumReleaseAgeExclude: this.minimumReleaseAgeExclude,
      sideEffectsCache: this.sideEffectsCache,
      nodeVersion: this.nodeVersion,
      engineStrict: this.engineStrict,
      packageManagerConfigRootDir: options.packageManagerConfigRootDir,
      peerDependencyRules: this.peerDependencyRules,
      hidePackageManagerOutput,
      neverBuiltDependencies: this.neverBuiltDependencies,
      allowScripts: this.allowScripts,
      dangerouslyAllowAllScripts: this.dangerouslyAllowAllScripts,
      preferOffline: this.preferOffline,
      dedupeInjectedDeps: options.dedupeInjectedDeps,
      dependenciesGraph: options.dependenciesGraph,
      forcedHarmonyVersion: options.forcedHarmonyVersion,
      ...packageManagerOptions,
    };
    if (this.installingContext?.inCapsule) {
      // the capsule invariant is non-negotiable: caller-provided packageManagerOptions spread
      // last for every other option's sake, but must not move a capsule onto the global store
      // (see the comment above on TypeScript's declaration emit)
      calculatedPmOpts.enableGlobalVirtualStore = false;
      calculatedPmOpts.globalVirtualStoreDir = undefined;
    }
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
    resolveEnvPeersFromRoot,
    resolveVersionsFromDependenciesOnly,
    referenceLocalPackages,
    includeAllEnvPeers,
    hasRootComponents,
    excludeExtensionsDependencies,
  }: GetComponentManifestsOptions): Promise<{
    manifests: Record<string, ProjectManifest>;
    peerOverrides: Record<string, string>;
  }> {
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe,
      dependencyFilterFn,
      resolveVersionsFromDependenciesOnly,
      referenceLocalPackages,
      includeAllEnvPeers,
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
        resolveEnvPeersFromRoot,
      });
    }
    return { manifests, peerOverrides: workspaceManifest.peerOverrides };
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
