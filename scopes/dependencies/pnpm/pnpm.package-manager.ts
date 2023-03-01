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
  BIT_DEV_REGISTRY,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { memoize, omit } from 'lodash';
import { PeerDependencyIssuesByProjects } from '@pnpm/core';
import { readModulesManifest } from '@pnpm/modules-yaml';
import { ProjectManifest } from '@pnpm/types';
import { join } from 'path';
import { readConfig } from './read-config';

export class PnpmPackageManager implements PackageManager {
  private readConfig = memoize(readConfig);
  constructor(private depResolver: DependencyResolverMain, private logger: Logger) {}

  async install(
    { rootDir, manifests }: InstallationContext,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');

    this.logger.debug(`running installation in root dir ${rootDir}`);
    this.logger.debug('components manifests for installation', manifests);
    this.logger.setStatusLine('installing dependencies using pnpm');
    // turn off the logger because it interrupts the pnpm output
    this.logger.off();
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    const { config } = await this.readConfig(installOptions.packageManagerConfigRootDir);
    if (!installOptions.useNesting) {
      manifests = await extendWithComponentsFromDir(rootDir, manifests);
    }
    await install(
      rootDir,
      manifests,
      config.storeDir,
      config.cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      {
        engineStrict: installOptions.engineStrict ?? config.engineStrict,
        nodeLinker: installOptions.nodeLinker,
        nodeVersion: installOptions.nodeVersion ?? config.nodeVersion,
        includeOptionalDeps: installOptions.includeOptionalDeps,
        overrides: installOptions.overrides,
        hoistPattern: config.hoistPattern,
        publicHoistPattern: ['@eslint/plugin-*', '*eslint-plugin*', '@prettier/plugin-*', '*prettier-plugin-*'],
        packageImportMethod: installOptions.packageImportMethod ?? config.packageImportMethod,
        rootComponents: installOptions.rootComponents,
        rootComponentsForCapsules: installOptions.rootComponentsForCapsules,
        peerDependencyRules: installOptions.peerDependencyRules,
        sideEffectsCacheRead: installOptions.sideEffectsCache ?? true,
        sideEffectsCacheWrite: installOptions.sideEffectsCache ?? true,
        pnpmHomeDir: config.pnpmHomeDir,
        updateAll: installOptions.updateAll,
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
    // We need to use config.rawConfig as it will only contain the settings defined by the user.
    // config contains default values of the settings when they are not defined by the user.
    return {
      maxSockets: config.rawConfig['max-sockets'],
      networkConcurrency: config.rawConfig['network-concurrency'],
      fetchRetries: config.rawConfig['fetch-retries'],
      fetchTimeout: config.rawConfig['fetch-timeout'],
      fetchRetryMaxtimeout: config.rawConfig['fetch-retry-maxtimeout'],
      fetchRetryMintimeout: config.rawConfig['fetch-retry-mintimeout'],
      strictSSL: config.rawConfig['strict-ssl'],
      // These settings don't have default value, so it is safe to read them from config
      // ca is automatically populated from the content of the file specified by cafile.
      ca: config.ca,
      cert: config.cert,
      key: config.key,
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

  async getInjectedDirs(rootDir: string, componentDir: string, packageName: string): Promise<string[]> {
    const modulesState = await readModulesManifest(join(rootDir, 'node_modules'));
    if (modulesState?.injectedDeps == null) return [];
    return modulesState.injectedDeps[`node_modules/${packageName}`] ?? modulesState.injectedDeps[componentDir] ?? [];
  }

  getWorkspaceDepsOfBitRoots(manifests: ProjectManifest[]): Record<string, string> {
    return Object.fromEntries(manifests.map((manifest) => [manifest.name, 'workspace:*']));
  }
}
