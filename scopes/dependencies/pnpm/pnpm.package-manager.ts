import { CloudMain } from '@teambit/cloud';
import {
  DependencyResolverMain,
  extendWithComponentsFromDir,
  InstallationContext,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
  Registries,
  Registry,
  BIT_CLOUD_REGISTRY,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import fs from 'fs';
import { memoize, omit } from 'lodash';
import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { readModulesManifest, Modules } from '@pnpm/modules-yaml';
import {
  buildDependenciesHierarchy,
  DependenciesHierarchy,
  createPackagesSearcher,
  PackageNode,
} from '@pnpm/reviewing.dependencies-hierarchy';
import { renderTree } from '@pnpm/list';
import { readWantedLockfile } from '@pnpm/lockfile-file';
import { ProjectManifest } from '@pnpm/types';
import { join } from 'path';
import { readConfig } from './read-config';
import { pnpmPruneModules } from './pnpm-prune-modules';
import type { RebuildFn } from './lynx';
import { getVirtualStoreDirMaxLength } from './get-virtual-store-dir-max-length';

export class PnpmPackageManager implements PackageManager {
  readonly name = 'pnpm';
  readonly modulesManifestCache: Map<string, Modules> = new Map();
  private username: string;

  private _readConfig = async (dir?: string) => {
    const { config, warnings } = await readConfig(dir);
    if (config?.fetchRetries && config?.fetchRetries < 5) {
      config.fetchRetries = 5;
      return { config, warnings };
    }

    return { config, warnings };
  };

  public readConfig = memoize(this._readConfig);

  constructor(private depResolver: DependencyResolverMain, private logger: Logger, private cloud: CloudMain) {}

  async install(
    { rootDir, manifests }: InstallationContext,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<{ dependenciesChanged: boolean; rebuild: RebuildFn; storeDir: string }> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');

    this.logger.debug(`running installation in root dir ${rootDir}`);
    this.logger.debug('components manifests for installation', manifests);
    if (!installOptions.hidePackageManagerOutput) {
      // this.logger.setStatusLine('installing dependencies using pnpm');
      // turn off the logger because it interrupts the pnpm output
      // this.logger.console('-------------------------PNPM OUTPUT-------------------------');
      this.logger.off();
    }
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const { config } = await this.readConfig(installOptions.packageManagerConfigRootDir);
    if (!installOptions.useNesting) {
      manifests = await extendWithComponentsFromDir(rootDir, manifests);
    }
    if (installOptions.nmSelfReferences) {
      Object.values(manifests).forEach((manifest) => {
        if (manifest.name) {
          manifest.devDependencies = {
            [manifest.name]: 'link:.',
            ...manifest.devDependencies,
          };
        }
      });
    }
    this.modulesManifestCache.delete(rootDir);
    const { dependenciesChanged, rebuild, storeDir } = await install(
      rootDir,
      manifests,
      config.storeDir,
      config.cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      {
        autoInstallPeers: installOptions.autoInstallPeers ?? false,
        engineStrict: installOptions.engineStrict ?? config.engineStrict,
        excludeLinksFromLockfile: installOptions.excludeLinksFromLockfile,
        lockfileOnly: installOptions.lockfileOnly,
        neverBuiltDependencies: installOptions.neverBuiltDependencies,
        nodeLinker: installOptions.nodeLinker,
        nodeVersion: installOptions.nodeVersion ?? config.nodeVersion,
        includeOptionalDeps: installOptions.includeOptionalDeps,
        ignorePackageManifest: installOptions.ignorePackageManifest,
        dedupeInjectedDeps: installOptions.dedupeInjectedDeps ?? false,
        dryRun: installOptions.dryRun,
        overrides: installOptions.overrides,
        hoistPattern: installOptions.hoistPatterns ?? config.hoistPattern,
        publicHoistPattern: config.shamefullyHoist
          ? ['*']
          : ['@eslint/plugin-*', '*eslint-plugin*', '@prettier/plugin-*', '*prettier-plugin-*'],
        hoistWorkspacePackages: installOptions.hoistWorkspacePackages ?? false,
        hoistInjectedDependencies: installOptions.hoistInjectedDependencies,
        packageImportMethod: installOptions.packageImportMethod ?? config.packageImportMethod,
        preferOffline: installOptions.preferOffline,
        rootComponents: installOptions.rootComponents,
        rootComponentsForCapsules: installOptions.rootComponentsForCapsules,
        sideEffectsCacheRead: installOptions.sideEffectsCache ?? true,
        sideEffectsCacheWrite: installOptions.sideEffectsCache ?? true,
        pnpmHomeDir: config.pnpmHomeDir,
        updateAll: installOptions.updateAll,
        hidePackageManagerOutput: installOptions.hidePackageManagerOutput,
        reportOptions: {
          appendOnly: installOptions.optimizeReportForNonTerminal,
          throttleProgress: installOptions.throttleProgress,
          hideProgressPrefix: installOptions.hideProgressPrefix,
          hideLifecycleOutput: installOptions.hideLifecycleOutput,
          peerDependencyRules: installOptions.peerDependencyRules,
        },
      },
      this.logger
    );
    if (!installOptions.hidePackageManagerOutput) {
      this.logger.on();
      // Make a divider row to improve output
      // this.logger.console('-------------------------END PNPM OUTPUT-------------------------');
      // this.logger.consoleSuccess('installing dependencies using pnpm');
    }
    return { dependenciesChanged, rebuild, storeDir };
  }

  async getPeerDependencyIssues(
    rootDir: string,
    manifests: Record<string, ProjectManifest>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<PeerDependencyIssuesByProjects> {
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const registries = await this.depResolver.getRegistries();
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const lynx = require('./lynx');
    const { config } = await this.readConfig(installOptions.packageManagerConfigRootDir);
    return lynx.getPeerDependencyIssues(manifests, {
      storeDir: config.storeDir,
      cacheDir: config.cacheDir,
      proxyConfig,
      registries,
      rootDir,
      networkConfig,
      overrides: installOptions.overrides,
      packageImportMethod: installOptions.packageImportMethod ?? config.packageImportMethod,
    });
  }

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { resolveRemoteVersion } = require('./lynx');
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const { config } = await this.readConfig(options.packageManagerConfigRootDir);
    return resolveRemoteVersion(packageName, options.rootDir, config.cacheDir, registries, proxyConfig, networkConfig);
  }

  async getProxyConfig?(): Promise<PackageManagerProxyConfig> {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { getProxyConfig } = require('./get-proxy-config');
    const { config } = await this.readConfig();
    return getProxyConfig(config);
  }

  async getNetworkConfig?(): Promise<PackageManagerNetworkConfig> {
    const { config } = await this.readConfig();
    if (!this.username) {
      this.username = (await this.cloud.getCurrentUser())?.username ?? 'anonymous';
    }
    // We need to use config.rawConfig as it will only contain the settings defined by the user.
    // config contains default values of the settings when they are not defined by the user.
    const result: PackageManagerNetworkConfig = {
      userAgent: `bit user/${this.username}`,
    };
    if (config.rawConfig['max-sockets'] != null) {
      result.maxSockets = config.rawConfig['max-sockets'];
    }
    if (config.rawConfig['network-concurrency'] != null) {
      result.networkConcurrency = config.rawConfig['network-concurrency'];
    }
    if (config.rawConfig['fetch-retries'] != null) {
      result.fetchRetries = config.rawConfig['fetch-retries'];
    }
    if (config.rawConfig['fetch-timeout'] != null) {
      result.fetchTimeout = config.rawConfig['fetch-timeout'];
    }
    if (config.rawConfig['fetch-retry-maxtimeout'] != null) {
      result.fetchRetryMaxtimeout = config.rawConfig['fetch-retry-maxtimeout'];
    }
    if (config.rawConfig['fetch-retry-mintimeout'] != null) {
      result.fetchRetryMintimeout = config.rawConfig['fetch-retry-mintimeout'];
    }
    if (config.rawConfig['strict-ssl'] != null) {
      result.strictSSL = config.rawConfig['strict-ssl'];
    }
    if (config.ca != null) {
      result.ca = config.ca;
    }
    if (config.cert != null) {
      result.cert = config.cert;
    }
    if (config.key != null) {
      result.key = config.key;
    }
    return result;
  }

  async getRegistries(): Promise<Registries> {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { getRegistries } = require('./get-registries');
    const { config } = await this.readConfig();
    const pnpmRegistry = await getRegistries(config);
    const defaultRegistry = new Registry(
      pnpmRegistry.default.uri,
      pnpmRegistry.default.alwaysAuth,
      pnpmRegistry.default.authHeaderValue,
      pnpmRegistry.default.originalAuthType,
      pnpmRegistry.default.originalAuthValue
    );

    const pnpmScoped = omit(pnpmRegistry, ['default']);
    const scopesRegistries: Record<string, Registry> = Object.keys(pnpmScoped).reduce((acc, scopedRegName) => {
      const scopedReg = pnpmScoped[scopedRegName];
      const name = scopedRegName.replace('@', '');
      acc[name] = new Registry(
        scopedReg.uri,
        scopedReg.alwaysAuth,
        scopedReg.authHeaderValue,
        scopedReg.originalAuthType,
        scopedReg.originalAuthValue
      );
      return acc;
    }, {});

    // Add bit registry server if not exist
    if (!scopesRegistries.bit) {
      scopesRegistries.bit = new Registry(BIT_CLOUD_REGISTRY, true);
    }

    return new Registries(defaultRegistry, scopesRegistries);
  }

  async getInjectedDirs(rootDir: string, componentDir: string, packageName: string): Promise<string[]> {
    const modulesState = await this._readModulesManifest(rootDir);
    if (modulesState?.injectedDeps == null) return [];
    return modulesState.injectedDeps[`node_modules/${packageName}`] ?? modulesState.injectedDeps[componentDir] ?? [];
  }

  async _readModulesManifest(lockfileDir: string): Promise<Modules | undefined> {
    if (this.modulesManifestCache.has(lockfileDir)) {
      return this.modulesManifestCache.get(lockfileDir);
    }
    const modulesManifest = await readModulesManifest(join(lockfileDir, 'node_modules'));
    if (modulesManifest) {
      this.modulesManifestCache.set(lockfileDir, modulesManifest);
    }
    return modulesManifest ?? undefined;
  }

  getWorkspaceDepsOfBitRoots(manifests: ProjectManifest[]): Record<string, string> {
    return Object.fromEntries(manifests.map((manifest) => [manifest.name, 'workspace:*']));
  }

  async pruneModules(rootDir: string): Promise<void> {
    return pnpmPruneModules(rootDir);
  }

  async findUsages(depName: string, opts: { lockfileDir: string; depth?: number }): Promise<string> {
    const search = createPackagesSearcher([depName]);
    const lockfile = await readWantedLockfile(opts.lockfileDir, { ignoreIncompatible: false });
    const projectPaths = Object.keys(lockfile?.importers ?? {})
      .filter((id) => !id.startsWith('node_modules/.bit_roots'))
      .map((id) => join(opts.lockfileDir, id));
    const cache = new Map();
    const modulesManifest = await this._readModulesManifest(opts.lockfileDir);
    const isHoisted = modulesManifest?.nodeLinker === 'hoisted';
    const getPkgLocation: GetPkgLocation = isHoisted
      ? ({ name }) => join(opts.lockfileDir, 'node_modules', name)
      : ({ path }) => path;
    const results = Object.entries(
      await buildDependenciesHierarchy(projectPaths, {
        depth: opts.depth ?? Infinity,
        include: {
          dependencies: true,
          devDependencies: true,
          optionalDependencies: true,
        },
        lockfileDir: opts.lockfileDir,
        registries: {
          default: 'https://registry.npmjs.org',
        },
        search,
        virtualStoreDirMaxLength: getVirtualStoreDirMaxLength(),
      })
    ).map(([projectPath, builtDependenciesHierarchy]) => {
      pkgNamesToComponentIds(builtDependenciesHierarchy, { cache, getPkgLocation });
      return {
        path: projectPath,
        ...builtDependenciesHierarchy,
      };
    });
    return renderTree(results, {
      alwaysPrintRootPackage: false,
      depth: Infinity,
      search: true,
      long: false,
      showExtraneous: false,
    });
  }
}

type GetPkgLocation = (pkgNode: PackageNode) => string;

function pkgNamesToComponentIds(
  deps: DependenciesHierarchy,
  { cache, getPkgLocation }: { cache: Map<string, string>; getPkgLocation: GetPkgLocation }
) {
  for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (deps[depType]) {
      for (const dep of deps[depType]) {
        if (!cache.has(dep.name)) {
          const pkgJson = tryReadPackageJson(getPkgLocation(dep));
          cache.set(
            dep.name,
            pkgJson?.componentId ? `${pkgJson.componentId.scope}/${pkgJson.componentId.name}` : dep.name
          );
        }
        dep.name = cache.get(dep.name);
        pkgNamesToComponentIds(dep, { cache, getPkgLocation });
      }
    }
  }
}

function tryReadPackageJson(pkgDir: string) {
  try {
    return JSON.parse(fs.readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch (err) {
    return undefined;
  }
}
