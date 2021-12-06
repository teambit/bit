import { ComponentMap } from '@teambit/component';
import {
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  WorkspacePolicy,
  DependencyResolverMain,
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
import { join } from 'path';
import userHome from 'user-home';
import { readConfig } from './read-config';

const defaultStoreDir = join(userHome, '.pnpm-store');
const defaultCacheDir = join(userHome, '.pnpm-cache');

export class PnpmPackageManager implements PackageManager {
  private readConfig = memoize(readConfig);
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain, private logger: Logger) {}

  async install(
    rootDir: string,
    rootPolicy: WorkspacePolicy,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');
    const storeDir = installOptions?.cacheRootDir ? join(installOptions?.cacheRootDir, '.pnpm-store') : defaultStoreDir;
    const cacheDir = installOptions?.cacheRootDir ? join(installOptions?.cacheRootDir, '.pnpm-cache') : defaultCacheDir;

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
    const rootManifest = workspaceManifest.toJson({
      includeDir: true,
      copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
    });

    const componentsManifests = this.computeComponentsManifests(
      componentDirectoryMap,
      workspaceManifest.componentsManifestsMap,
      // In case of not deduping we want to install peers inside the components
      // !options.dedupe
      installOptions.copyPeerToRuntimeOnComponents
    );
    this.logger.debug('root manifest for installation', rootManifest);
    this.logger.debug('components manifests for installation', componentsManifests);
    this.logger.setStatusLine('installing dependencies using pnpm');
    // turn off the logger because it interrupts the pnpm output
    this.logger.off();
    const registries = await this.depResolver.getRegistries();
    const proxyConfig = await this.depResolver.getProxyConfig();
    const networkConfig = await this.depResolver.getNetworkConfig();
    await install(
      rootManifest,
      componentsManifests,
      storeDir,
      cacheDir,
      registries,
      proxyConfig,
      networkConfig,
      {
        overrides: installOptions.overrides,
      },
      this.logger
    );
    this.logger.on();
    // Make a divider row to improve output
    this.logger.console('-------------------------');
    this.logger.consoleSuccess('installing dependencies using pnpm');
  }

  private computeComponentsManifests(
    componentDirectoryMap: ComponentMap<string>,
    componentsManifestsFromWorkspace: ComponentsManifestsMap,
    copyPeerToRuntime = false
  ) {
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
    const cacheDir = options?.cacheRootDir ? join(options?.cacheRootDir, '.pnpm-cache') : defaultStoreDir;
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
