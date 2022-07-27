import semver from 'semver';
import parsePackageName from 'parse-package-name';
import defaultReporter from '@pnpm/default-reporter';
import { streamParser } from '@pnpm/logger';
import { StoreController, WantedDependency } from '@pnpm/package-store';
import { createOrConnectStoreController, CreateStoreControllerOptions } from '@pnpm/store-connection-manager';
import sortPackages from '@pnpm/sort-packages';
import {
  ResolvedPackageVersion,
  Registries,
  NPM_REGISTRY,
  Registry,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import {
  MutatedProject,
  mutateModules,
  InstallOptions,
  PeerDependencyIssuesByProjects,
  ProjectOptions,
} from '@pnpm/core';
import * as pnpm from '@pnpm/core';
import createResolverAndFetcher, { ClientOptions } from '@pnpm/client';
import pickRegistryForPackage from '@pnpm/pick-registry-for-package';
import { ProjectManifest } from '@pnpm/types';
import { Logger } from '@teambit/logger';
import toNerfDart from 'nerf-dart';
import pkgsGraph from 'pkgs-graph';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';
import { readConfig } from './read-config';

type RegistriesMap = {
  default: string;
  [registryName: string]: string;
};

const STORE_CACHE: Record<string, { ctrl: StoreController; dir: string }> = {};

async function createStoreController(
  options: {
    rootDir: string;
    storeDir: string;
    cacheDir: string;
    registries: Registries;
    proxyConfig: PackageManagerProxyConfig;
    networkConfig: PackageManagerNetworkConfig;
  } & Pick<CreateStoreControllerOptions, 'packageImportMethod'>
): Promise<{ ctrl: StoreController; dir: string }> {
  const authConfig = getAuthConfig(options.registries);
  const opts: CreateStoreControllerOptions = {
    dir: options.rootDir,
    cacheDir: options.cacheDir,
    storeDir: options.storeDir,
    rawConfig: authConfig,
    verifyStoreIntegrity: true,
    httpProxy: options.proxyConfig?.httpProxy,
    httpsProxy: options.proxyConfig?.httpsProxy,
    ca: options.networkConfig?.ca,
    cert: options.networkConfig?.cert,
    key: options.networkConfig?.key,
    localAddress: options.networkConfig?.localAddress,
    noProxy: options.proxyConfig?.noProxy,
    strictSsl: options.networkConfig.strictSSL,
    maxSockets: options.networkConfig.maxSockets,
    networkConcurrency: options.networkConfig.networkConcurrency,
    packageImportMethod: options.packageImportMethod,
  };
  // We should avoid the recreation of store.
  // The store holds cache that makes subsequent resolutions faster.
  const cacheKey = JSON.stringify(opts);
  if (!STORE_CACHE[cacheKey]) {
    // Although it would be enough to call createNewStoreController(),
    // that doesn't resolve the store directory location.
    STORE_CACHE[cacheKey] = await createOrConnectStoreController(opts);
  }
  return STORE_CACHE[cacheKey];
}

async function generateResolverAndFetcher(
  cacheDir: string,
  registries: Registries,
  proxyConfig: PackageManagerProxyConfig = {},
  networkConfig: PackageManagerNetworkConfig = {}
) {
  const pnpmConfig = await readConfig();
  const authConfig = getAuthConfig(registries);
  const opts: ClientOptions = {
    authConfig: Object.assign({}, pnpmConfig.config.rawConfig, authConfig),
    cacheDir,
    httpProxy: proxyConfig?.httpProxy,
    httpsProxy: proxyConfig?.httpsProxy,
    ca: networkConfig?.ca,
    cert: networkConfig?.cert,
    key: networkConfig?.key,
    localAddress: networkConfig?.localAddress,
    noProxy: proxyConfig?.noProxy,
    strictSsl: networkConfig.strictSSL,
    timeout: networkConfig.fetchTimeout,
    retry: {
      factor: networkConfig.fetchRetryFactor,
      maxTimeout: networkConfig.fetchRetryMaxtimeout,
      minTimeout: networkConfig.fetchRetryMintimeout,
      retries: networkConfig.fetchRetries,
    },
  };
  const result = createResolverAndFetcher(opts);
  return result;
}

export async function getPeerDependencyIssues(
  rootManifest: {
    rootDir: string;
    manifest: ProjectManifest;
  },
  manifestsByPaths: Record<string, any>,
  opts: {
    storeDir: string;
    cacheDir: string;
    registries: Registries;
    proxyConfig: PackageManagerProxyConfig;
    networkConfig: PackageManagerNetworkConfig;
    overrides?: Record<string, string>;
  } & Pick<CreateStoreControllerOptions, 'packageImportMethod'>
): Promise<PeerDependencyIssuesByProjects> {
  const projects: ProjectOptions[] = [];
  const workspacePackages = {};
  for (const [rootDir, manifest] of Object.entries(manifestsByPaths)) {
    projects.push({
      manifest,
      rootDir,
    });
    workspacePackages[manifest.name] = workspacePackages[manifest.name] || {};
    workspacePackages[manifest.name][manifest.version] = { dir: rootDir, manifest };
  }
  projects.push({
    manifest: rootManifest.manifest,
    rootDir: rootManifest.rootDir,
  });
  const registriesMap = getRegistriesMap(opts.registries);
  const storeController = await createStoreController({
    ...opts,
    rootDir: rootManifest.rootDir,
  });
  return pnpm.getPeerDependencyIssues(projects, {
    storeController: storeController.ctrl,
    storeDir: storeController.dir,
    overrides: opts.overrides,
    workspacePackages,
    registries: registriesMap,
  });
}

export async function install(
  rootManifest,
  manifestsByPaths: Record<string, ProjectManifest>,
  storeDir: string,
  cacheDir: string,
  registries: Registries,
  proxyConfig: PackageManagerProxyConfig = {},
  networkConfig: PackageManagerNetworkConfig = {},
  options?: {
    nodeLinker?: 'hoisted' | 'isolated';
    overrides?: Record<string, string>;
  } & Pick<
    InstallOptions,
    'publicHoistPattern' | 'hoistPattern' | 'nodeVersion' | 'engineStrict' | 'peerDependencyRules'
  > &
    Pick<CreateStoreControllerOptions, 'packageImportMethod'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger?: Logger
) {
  const { packagesToBuild, workspacePackages } = groupPkgs({
    ...manifestsByPaths,
    [rootManifest.rootDir]: rootManifest.manifest,
  });
  const registriesMap = getRegistriesMap(registries);
  const authConfig = getAuthConfig(registries);
  const storeController = await createStoreController({
    rootDir: rootManifest.rootDir,
    storeDir,
    cacheDir,
    registries,
    proxyConfig,
    networkConfig,
    packageImportMethod: options?.packageImportMethod,
  });
  const opts: InstallOptions = {
    storeDir: storeController.dir,
    dir: rootManifest.rootDir,
    extendNodePath: false,
    storeController: storeController.ctrl,
    workspacePackages,
    preferFrozenLockfile: true,
    pruneLockfileImporters: true,
    modulesCacheMaxAge: 0,
    registries: registriesMap,
    rawConfig: authConfig,
    ...options,
    peerDependencyRules: {
      allowAny: ['*'],
      ignoreMissing: ['*'],
      ...options?.peerDependencyRules,
    },
  };

  const stopReporting = defaultReporter({
    context: {
      argv: [],
    },
    reportingOptions: {
      appendOnly: false,
      throttleProgress: 200,
    },
    streamParser,
  });
  try {
    await mutateModules(packagesToBuild, opts);
  } catch (err: any) {
    throw pnpmErrorToBitError(err);
  } finally {
    stopReporting();
  }
}

function groupPkgs(manifestsByPaths: Record<string, ProjectManifest>) {
  const pkgs = Object.entries(manifestsByPaths).map(([dir, manifest]) => ({ dir, manifest }));
  const { graph } = pkgsGraph(pkgs);
  const chunks = sortPackages(graph as any);

  // This will create local link by pnpm to a component exists in the ws.
  // it will later deleted by the link process
  // we keep it here to better support case like this:
  // compA@1.0.0 uses compB@1.0.0
  // I have compB@2.0.0 in my workspace
  // now I install compA@1.0.0
  // compA is hoisted to the root and install B@1.0.0 hoisted to the root as well
  // now we will make link to B@2.0.0 and A will break
  // with this we will have a link to the local B by pnpm so it will install B@1.0.0 inside A
  // then when overriding the link, A will still works
  // This is the rational behind not deleting this completely, but need further check that it really works
  const packagesToBuild: MutatedProject[] = []; // @pnpm/core will use this to install the packages
  const workspacePackages = {}; // @pnpm/core will use this to link packages to each other

  chunks.forEach((dirs, buildIndex) => {
    for (const rootDir of dirs) {
      const manifest = manifestsByPaths[rootDir];
      packagesToBuild.push({
        buildIndex,
        manifest,
        rootDir,
        mutation: 'install',
      });
      if (manifest.name) {
        workspacePackages[manifest.name] = workspacePackages[manifest.name] || {};
        workspacePackages[manifest.name][manifest.version] = { dir: rootDir, manifest };
      }
    }
  });
  return { packagesToBuild, workspacePackages };
}

export async function resolveRemoteVersion(
  packageName: string,
  rootDir: string,
  cacheDir: string,
  registries: Registries,
  proxyConfig: PackageManagerProxyConfig = {},
  networkConfig: PackageManagerNetworkConfig = {}
): Promise<ResolvedPackageVersion> {
  const { resolve } = await generateResolverAndFetcher(cacheDir, registries, proxyConfig, networkConfig);
  const resolveOpts = {
    projectDir: rootDir,
    registry: '',
  };
  try {
    const parsedPackage = parsePackageName(packageName);
    const registriesMap = getRegistriesMap(registries);
    const registry = pickRegistryForPackage(registriesMap, parsedPackage.name);
    const wantedDep: WantedDependency = {
      alias: parsedPackage.name,
      pref: parsedPackage.version,
    };
    const isValidRange = parsedPackage.version ? !!semver.validRange(parsedPackage.version) : false;
    resolveOpts.registry = registry;
    const val = await resolve(wantedDep, resolveOpts);
    const version = isValidRange ? parsedPackage.version : val.manifest.version;

    return {
      packageName: val.manifest.name,
      version,
      isSemver: true,
      resolvedVia: val.resolvedVia,
    };
  } catch (e: any) {
    if (!e.message?.includes('is not a valid string')) {
      throw pnpmErrorToBitError(e);
    }
    // The provided package is probably a git url or path to a folder
    const wantedDep: WantedDependency = {
      alias: undefined,
      pref: packageName,
    };
    const val = await resolve(wantedDep, resolveOpts);
    return {
      packageName: val.manifest.name,
      version: val.normalizedPref,
      isSemver: false,
      resolvedVia: val.resolvedVia,
    };
  }
}

function getRegistriesMap(registries: Registries): RegistriesMap {
  const registriesMap = {
    default: registries.defaultRegistry.uri || NPM_REGISTRY,
  };

  Object.entries(registries.scopes).forEach(([registryName, registry]) => {
    registriesMap[`@${registryName}`] = registry.uri;
  });
  return registriesMap;
}

function getAuthConfig(registries: Registries): Record<string, any> {
  const res: any = {};
  res.registry = registries.defaultRegistry.uri;
  if (registries.defaultRegistry.alwaysAuth) {
    res['always-auth'] = true;
  }
  const defaultAuthTokens = getAuthTokenForRegistry(registries.defaultRegistry, true);
  defaultAuthTokens.forEach(({ keyName, val }) => {
    res[keyName] = val;
  });

  Object.entries(registries.scopes).forEach(([, registry]) => {
    const authTokens = getAuthTokenForRegistry(registry);
    authTokens.forEach(({ keyName, val }) => {
      res[keyName] = val;
    });
    if (registry.alwaysAuth) {
      const nerfed = toNerfDart(registry.uri);
      const alwaysAuthKeyName = `${nerfed}:always-auth`;
      res[alwaysAuthKeyName] = true;
    }
  });
  return res;
}

function getAuthTokenForRegistry(registry: Registry, isDefault = false): { keyName: string; val: string }[] {
  const nerfed = toNerfDart(registry.uri);
  if (registry.originalAuthType === 'authToken') {
    return [
      {
        keyName: `${nerfed}:_authToken`,
        val: registry.originalAuthValue || '',
      },
    ];
  }
  if (registry.originalAuthType === 'auth') {
    return [
      {
        keyName: isDefault ? '_auth' : `${nerfed}:_auth`,
        val: registry.originalAuthValue || '',
      },
    ];
  }
  if (registry.originalAuthType === 'user-pass') {
    return [
      {
        keyName: `${nerfed}:username`,
        val: registry.originalAuthValue?.split(':')[0] || '',
      },
      {
        keyName: `${nerfed}:_password`,
        val: registry.originalAuthValue?.split(':')[1] || '',
      },
    ];
  }
  return [];
}
