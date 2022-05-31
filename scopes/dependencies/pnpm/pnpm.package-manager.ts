import { ComponentMap } from '@teambit/component';
import {
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  WorkspacePolicy,
  DependencyResolverMain,
  extendWithComponentsFromDir,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
  ResolvedPackageVersion,
  Registries,
  Registry,
  BIT_DEV_REGISTRY,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { memoize, omit } from 'lodash';
import { PkgMain } from '@teambit/pkg';
import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { ProjectManifest } from '@pnpm/types';
import { join } from 'path';
import userHome from 'user-home';
import { readConfig } from './read-config';

const defaultStoreDir = join(userHome, '.pnpm-store');
const defaultCacheDir = join(userHome, '.pnpm-cache');

interface Manifests {
  componentsManifests: Record<string, ProjectManifest>;
  rootManifest: {
    rootDir: string;
    manifest: ProjectManifest;
  };
}

export class PnpmPackageManager implements PackageManager {
  private readConfig = memoize(readConfig);
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain, private logger: Logger) {}

  private async _componentsToPnpmWorkspaceProjects(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<Manifests> {
    const components = componentDirectoryMap.toArray().map(([component]) => component);
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe: installOptions.dedupe,
      dependencyFilterFn: installOptions.dependencyFilterFn,
    };
    const workspaceManifest = await this.depResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootPolicy,
      rootDir,
      components,
      options
    );
    const rootManifest = workspaceManifest.toJsonWithDir({
      copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
      installPeersFromEnvs: installOptions.installPeersFromEnvs,
    });

    const componentsManifests = this.computeComponentsManifests(
      componentDirectoryMap,
      workspaceManifest.componentsManifestsMap,
      // In case of not deduping we want to install peers inside the components
      // !options.dedupe
      installOptions.copyPeerToRuntimeOnComponents
    );
    return {
      componentsManifests,
      rootManifest,
    };
  }

  async _getGlobalPnpmDirs(
    opts: {
      cacheRootDir?: string;
      packageManagerConfigRootDir?: string;
    } = {}
  ) {
    const { config } = await this.readConfig(opts.packageManagerConfigRootDir);
    const storeDir = opts.cacheRootDir ? join(opts.cacheRootDir, '.pnpm-store') : config.storeDir ?? defaultStoreDir;
    const cacheDir = opts.cacheRootDir ? join(opts.cacheRootDir, '.pnpm-cache') : config.cacheDir ?? defaultCacheDir;
    return { storeDir, cacheDir };
  }

  async install(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');

    const { componentsManifests, rootManifest } = await this._componentsToPnpmWorkspaceProjects(
      rootDir,
      rootPolicy,
      componentDirectoryMap,
      installOptions
    );
    this.logger.debug('root manifest for installation', rootManifest);
    this.logger.debug('components manifests for installation', componentsManifests);
    this.logger.setStatusLine('installing dependencies using pnpm');
    // turn off the logger because it interrupts the pnpm output
    this.logger.off();
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const { storeDir, cacheDir } = await this._getGlobalPnpmDirs(installOptions);
    const { config } = await this.readConfig(installOptions.packageManagerConfigRootDir);
    await extendWithComponentsFromDir(rootManifest.rootDir, componentsManifests);
    await install(
      rootManifest,
      componentsManifests,
      storeDir,
      cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      {
        engineStrict: installOptions.engineStrict ?? config.engineStrict,
        nodeLinker: installOptions.nodeLinker,
        nodeVersion: installOptions.nodeVersion ?? config.nodeVersion,
        overrides: installOptions.overrides,
        hoistPattern: config.hoistPattern,
        publicHoistPattern: ['*eslint*', '@prettier/plugin-*', '*prettier-plugin-*'],
        packageImportMethod: installOptions.packageImportMethod ?? config.packageImportMethod,
        sideEffectsCacheRead: installOptions.sideEffectsCache ?? true,
        sideEffectsCacheWrite: installOptions.sideEffectsCache ?? true,
      },
      this.logger
    );
    this.logger.on();
    // Make a divider row to improve output
    this.logger.console('-------------------------');
    this.logger.consoleSuccess('installing dependencies using pnpm');
  }

  async getPeerDependencyIssues(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<PeerDependencyIssuesByProjects> {
    const { storeDir, cacheDir } = await this._getGlobalPnpmDirs(installOptions);
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const registries = await this.depResolver.getRegistries();
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const lynx = require('./lynx');
    const { componentsManifests, rootManifest } = await this._componentsToPnpmWorkspaceProjects(
      rootDir,
      rootPolicy,
      componentDirectoryMap,
      installOptions
    );
    const { config } = await this.readConfig();
    return lynx.getPeerDependencyIssues(rootManifest, componentsManifests, {
      storeDir,
      cacheDir,
      proxyConfig,
      registries,
      networkConfig,
      overrides: installOptions.overrides,
      packageImportMethod: installOptions.packageImportMethod ?? config.packageImportMethod,
    });
  }

  private computeComponentsManifests(
    componentDirectoryMap: ComponentMap<string>,
    componentsManifestsFromWorkspace: ComponentsManifestsMap,
    copyPeerToRuntime = false
  ): Record<string, ProjectManifest> {
    return componentDirectoryMap.toArray().reduce((acc, [component, dir]) => {
      const packageName = this.pkg.getPackageName(component);
      if (componentsManifestsFromWorkspace.has(packageName)) {
        acc[dir] = componentsManifestsFromWorkspace.get(packageName)?.toJson({ copyPeerToRuntime });
      }
      return acc;
    }, {});
  }

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { resolveRemoteVersion } = require('./lynx');
    const { cacheDir } = await this._getGlobalPnpmDirs(options);
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    return resolveRemoteVersion(packageName, options.rootDir, cacheDir, registries, proxyConfig, networkConfig);
  }

  async getProxyConfig?(): Promise<PackageManagerProxyConfig> {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { getProxyConfig } = require('./get-proxy-config');
    const { config } = await this.readConfig();
    return getProxyConfig(config);
  }

  async getNetworkConfig?(): Promise<PackageManagerNetworkConfig> {
    const { config } = await this.readConfig();
    return {
      maxSockets: config.maxSockets,
      networkConcurrency: config.networkConcurrency,
      fetchRetries: config.fetchRetries,
      fetchTimeout: config.fetchTimeout,
      fetchRetryMaxtimeout: config.fetchRetryMaxtimeout,
      fetchRetryMintimeout: config.fetchRetryMintimeout,
    };
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
      scopesRegistries.bit = new Registry(BIT_DEV_REGISTRY, true);
    }

    return new Registries(defaultRegistry, scopesRegistries);
  }
}
