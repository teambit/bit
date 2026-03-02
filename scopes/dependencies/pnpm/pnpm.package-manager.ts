import type { CloudMain } from '@teambit/cloud';
import { extendWithComponentsFromDir, BIT_CLOUD_REGISTRY } from '@teambit/dependency-resolver';
import type {
  DependencyResolverMain,
  InstallationContext,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
  CalcDepsGraphOptions,
} from '@teambit/dependency-resolver';
import { Registries, Registry } from '@teambit/pkg.entities.registry';
import { DEPS_GRAPH, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';
import type { Logger } from '@teambit/logger';
import { type LockfileFile } from '@pnpm/lockfile.types';
import fs from 'fs';
import { memoize, omit } from 'lodash';
import type { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { filterLockfileByImporters } from '@pnpm/lockfile.filtering';
import type { Config } from '@pnpm/config';
import { type ProjectId, type ProjectManifest, type DepPath } from '@pnpm/types';
import type { Modules } from '@pnpm/modules-yaml';
import { readModulesManifest } from '@pnpm/modules-yaml';
import type { ImporterInfo } from '@pnpm/reviewing.dependencies-hierarchy';
import { buildDependentsTree } from '@pnpm/reviewing.dependencies-hierarchy';
import { renderDependentsTree } from '@pnpm/list';
import {
  readWantedLockfile,
  writeLockfileFile,
  convertToLockfileFile as convertLockfileObjectToLockfileFile,
} from '@pnpm/lockfile.fs';
import { BIT_ROOTS_DIR } from '@teambit/legacy.constants';
import { ServerSendOutStream } from '@teambit/legacy.logger';
import { join } from 'path';
import { convertLockfileToGraph, convertGraphToLockfile } from './lockfile-deps-graph-converter';
import { readConfig } from './read-config';
import { pnpmPruneModules } from './pnpm-prune-modules';
import type { RebuildFn } from './lynx';
import { generateResolverAndFetcher } from './lynx';
import { type DependenciesGraph } from '@teambit/objects';

export type { RebuildFn };

export interface InstallResult {
  dependenciesChanged: boolean;
  rebuild: RebuildFn;
  storeDir: string;
  depsRequiringBuild?: DepPath[];
}

type ReadConfigResult = Promise<{ config: Config; warnings: string[] }>;

export class PnpmPackageManager implements PackageManager {
  readonly name = 'pnpm';
  readonly modulesManifestCache: Map<string, Modules> = new Map();
  private username: string;

  private _readConfig = async (dir?: string): ReadConfigResult => {
    const { config, warnings } = await readConfig(dir);
    if (config?.fetchRetries && config?.fetchRetries < 5) {
      config.fetchRetries = 5;
      return { config, warnings };
    }

    return { config, warnings };
  };

  public readConfig: (dir?: string) => ReadConfigResult = memoize(this._readConfig);

  constructor(
    private depResolver: DependencyResolverMain,
    private logger: Logger,
    private cloud: CloudMain
  ) {}

  async dependenciesGraphToLockfile(
    dependenciesGraph: DependenciesGraph,
    opts: {
      cacheDir: string;
      manifests: Record<string, ProjectManifest>;
      rootDir: string;
      registries?: Registries;
      proxyConfig?: PackageManagerProxyConfig;
      networkConfig?: PackageManagerNetworkConfig;
    }
  ) {
    const registries = opts.registries ?? new Registries(new Registry('https://node-registry.bit.cloud', false), {});
    const { resolve } = await generateResolverAndFetcher({
      ...opts,
      registries,
    });
    const lockfile: LockfileFile = await convertGraphToLockfile(dependenciesGraph, {
      ...opts,
      resolve,
    });
    Object.assign(lockfile, {
      bit: {
        restoredFromModel: true,
      },
    });
    const lockfilePath = join(opts.rootDir, 'pnpm-lock.yaml');
    await writeLockfileFile(lockfilePath, lockfile);
    this.logger.debug(`generated a lockfile from dependencies graph at ${lockfilePath}`);
    if (process.env.DEPS_GRAPH_LOG) {
      // eslint-disable-next-line no-console
      console.log(`generated a lockfile from dependencies graph at ${lockfilePath}`);
    }
  }

  async install(
    { rootDir, manifests }: InstallationContext,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<InstallResult> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');

    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const { config } = await this.readConfig(installOptions.packageManagerConfigRootDir);
    if (
      installOptions.dependenciesGraph &&
      isFeatureEnabled(DEPS_GRAPH) &&
      (installOptions.rootComponents || installOptions.rootComponentsForCapsules)
    ) {
      try {
        await this.dependenciesGraphToLockfile(installOptions.dependenciesGraph, {
          manifests,
          rootDir,
          registries,
          proxyConfig,
          networkConfig,
          cacheDir: config.cacheDir,
        });
      } catch (error) {
        // If the lockfile could not be created for some reason, it will be created later during installation.
        this.logger.error((error as Error).message);
      }
    }

    this.logger.debug(`running installation in root dir ${rootDir}`);
    this.logger.debug('components manifests for installation', manifests);
    if (!installOptions.hidePackageManagerOutput) {
      // this.logger.setStatusLine('installing dependencies using pnpm');
      // turn off the logger because it interrupts the pnpm output
      // this.logger.console('-------------------------PNPM OUTPUT-------------------------');
      this.logger.off();
    }
    if (!installOptions.useNesting && installOptions.rootComponentsForCapsules) {
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
    const { dependenciesChanged, rebuild, storeDir, depsRequiringBuild } = await install(
      rootDir,
      manifests,
      config.storeDir,
      config.cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      {
        autoInstallPeers: installOptions.autoInstallPeers ?? true,
        enableModulesDir: installOptions.enableModulesDir,
        engineStrict: installOptions.engineStrict ?? config.engineStrict,
        excludeLinksFromLockfile: installOptions.excludeLinksFromLockfile,
        lockfileOnly: installOptions.lockfileOnly,
        minimumReleaseAge: installOptions.minimumReleaseAge,
        minimumReleaseAgeExclude: installOptions.minimumReleaseAgeExclude,
        neverBuiltDependencies: installOptions.neverBuiltDependencies,
        allowScripts: installOptions.allowScripts,
        dangerouslyAllowAllScripts: installOptions.dangerouslyAllowAllScripts,
        nodeLinker: installOptions.nodeLinker,
        nodeVersion: installOptions.nodeVersion ?? config.nodeVersion,
        includeOptionalDeps: installOptions.includeOptionalDeps,
        ignorePackageManifest: installOptions.ignorePackageManifest,
        dedupeInjectedDeps: installOptions.dedupeInjectedDeps ?? false,
        dryRun: installOptions.dependenciesGraph == null && installOptions.dryRun,
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
          process: process.env.BIT_CLI_SERVER_NO_TTY ? { ...process, stdout: new ServerSendOutStream() } : undefined,
          throttleProgress: installOptions.throttleProgress,
          hideProgressPrefix: installOptions.hideProgressPrefix,
          hideLifecycleOutput: installOptions.hideLifecycleOutput,
          peerDependencyRules: installOptions.peerDependencyRules,
        },
        returnListOfDepsRequiringBuild: installOptions.returnListOfDepsRequiringBuild,
        forcedHarmonyVersion: installOptions.forcedHarmonyVersion,
      },
      this.logger
    );
    if (!installOptions.hidePackageManagerOutput) {
      this.logger.on();
      // Make a divider row to improve output
      // this.logger.console('-------------------------END PNPM OUTPUT-------------------------');
      // this.logger.consoleSuccess('installing dependencies using pnpm');
    }
    return { dependenciesChanged, rebuild, storeDir, depsRequiringBuild };
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
    return resolveRemoteVersion(packageName, {
      rootDir: options.rootDir,
      cacheDir: config.cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      fullMetadata: options.fullMetadata,
    });
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
    const lockfile = await readWantedLockfile(opts.lockfileDir, { ignoreIncompatible: false });
    if (!lockfile) return '';
    const importerIds = Object.keys(lockfile.importers ?? {})
      .filter((id) => !id.includes(`${BIT_ROOTS_DIR}/`));
    const projectPaths = importerIds.map((id) => join(opts.lockfileDir, id));
    const importerInfoMap = new Map<string, ImporterInfo>();
    for (const importerId of importerIds) {
      const pkgJson = tryReadPackageJson(join(opts.lockfileDir, importerId));
      importerInfoMap.set(importerId, {
        name: pkgJson?.name ?? importerId,
        version: pkgJson?.version ?? '',
      });
    }
    const trees = await buildDependentsTree([depName], projectPaths, {
      include: {
        dependencies: true,
        devDependencies: true,
        optionalDependencies: true,
      },
      lockfileDir: opts.lockfileDir,
      registries: {
        default: 'https://registry.npmjs.org',
      },
      importerInfoMap,
      lockfile,
      nameFormatter ({ manifest }) {
        if ('componentId' in manifest) {
          const { scope, name } = manifest.componentId as { scope: string; name: string };
          return `${scope}/${name}`;
        }
        return manifest.name;
      },
    });
    return renderDependentsTree(trees, {
      depth: opts.depth ?? Infinity,
      long: false,
    });
  }

  /**
   * Calculating the dependencies graph of a given component using the lockfile.
   */
  async calcDependenciesGraph(opts: CalcDepsGraphOptions): Promise<void> {
    const originalLockfile = await readWantedLockfile(opts.rootDir, { ignoreIncompatible: false });
    if (!originalLockfile) {
      return;
    }
    for (const { componentRootDir, componentRelativeDir, pkgName, component } of opts.components) {
      const lockfile = structuredClone(originalLockfile);
      let compRootDir: string | undefined;
      if (componentRootDir && !lockfile.importers[componentRootDir] && componentRootDir.includes('@')) {
        compRootDir = componentRootDir.split('@')[0];
      } else {
        compRootDir = componentRootDir;
      }
      if (!lockfile.importers[compRootDir as ProjectId]) {
        // This will only happen if the env was not loaded correctly before install.
        // But in this case we cannot calculate the dependency graph from the lockfile.
        continue;
      }
      const filterByImporterIds = [componentRelativeDir as ProjectId];
      if (compRootDir != null) {
        filterByImporterIds.push(compRootDir as ProjectId);
      }
      for (const importerId of filterByImporterIds) {
        for (const depType of [
          'dependencies',
          'devDependencies',
          'optionalDependencies',
          'specifiers',
          'dependenciesMeta',
        ]) {
          for (const workspacePkgName of opts.componentIdByPkgName.keys()) {
            if (workspacePkgName !== pkgName) {
              delete lockfile.importers[importerId]?.[depType]?.[workspacePkgName];
            }
          }
        }
      }
      // Filters the lockfile so that it only includes packages related to the given component.
      const partialLockfile = convertLockfileObjectToLockfileFile(
        filterLockfileByImporters(lockfile, filterByImporterIds, {
          include: {
            dependencies: true,
            devDependencies: true,
            optionalDependencies: true,
          },
          failOnMissingDependencies: false,
          skipped: new Set(),
        })
      );
      const graph = convertLockfileToGraph(partialLockfile, {
        ...opts,
        componentRootDir: compRootDir,
        componentRelativeDir,
        pkgName,
      });
      component.state._consumer.dependenciesGraph = graph;
    }
  }
}

function tryReadPackageJson(pkgDir: string) {
  try {
    return JSON.parse(fs.readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}
