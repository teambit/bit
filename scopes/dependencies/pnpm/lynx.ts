import fs from 'graceful-fs';
import path from 'path';
import semver from 'semver';
import parsePackageName from 'parse-package-name';
import defaultReporter from '@pnpm/default-reporter';
import { streamParser } from '@pnpm/logger';
import { read as readModulesState } from '@pnpm/modules-yaml';
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
import { PackageManifest, ProjectManifest } from '@pnpm/types';
import { Logger } from '@teambit/logger';
import toNerfDart from 'nerf-dart';
import { promisify } from 'util';
import pkgsGraph from 'pkgs-graph';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';
import { readConfig } from './read-config';

const link = promisify(fs.link);
const installsRunning: Record<string, Promise<any>> = {}

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
    ca: options.proxyConfig?.ca,
    cert: options.proxyConfig?.cert,
    key: options.proxyConfig?.key,
    localAddress: options.networkConfig?.localAddress,
    noProxy: options.proxyConfig?.noProxy,
    strictSsl: options.proxyConfig.strictSSL,
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
    ca: proxyConfig?.ca,
    cert: proxyConfig?.cert,
    key: proxyConfig?.key,
    localAddress: networkConfig?.localAddress,
    noProxy: proxyConfig?.noProxy,
    strictSsl: proxyConfig.strictSSL,
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
  options: {
    nodeLinker?: 'hoisted' | 'isolated';
    overrides?: Record<string, string>;
    rootComponents?: boolean;
    rootComponentsForCapsules?: boolean;
  } & Pick<InstallOptions, 'publicHoistPattern' | 'hoistPattern' | 'nodeVersion' | 'engineStrict'> &
    Pick<CreateStoreControllerOptions, 'packageImportMethod'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger?: Logger
) {
  if (!rootManifest.manifest.dependenciesMeta) {
    rootManifest.manifest.dependenciesMeta = {};
  }
  let readPackage: any;
  let hoistingLimits = new Map();
  if (options?.rootComponents) {
    const { rootComponentWrappers, rootComponents } = createRootComponentWrapperManifests(
      rootManifest.rootDir,
      manifestsByPaths
    );
    manifestsByPaths = {
      ...rootComponentWrappers,
      ...manifestsByPaths,
    };
    readPackage = readPackageHook;
    hoistingLimits = new Map();
    hoistingLimits.set('.@', new Set(rootComponents));
  } else if (options?.rootComponentsForCapsules) {
    readPackage = readPackageHookForCapsules;
  }
  if (!manifestsByPaths[rootManifest.rootDir]) {
    manifestsByPaths[rootManifest.rootDir] = rootManifest.manifest;
  }
  const { packagesToBuild, workspacePackages } = groupPkgs(manifestsByPaths);
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
    registries: registriesMap,
    rawConfig: authConfig,
    hooks: { readPackage },
    hoistingLimits,
    ...options,
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
    await installsRunning[rootManifest.rootDir]
    installsRunning[rootManifest.rootDir] = mutateModules(packagesToBuild, opts)
    await installsRunning[rootManifest.rootDir]
    delete installsRunning[rootManifest.rootDir]
  } catch (err: any) {
    throw pnpmErrorToBitError(err)
  } finally {
    stopReporting();
  }
  if (options.rootComponents) {
    const modulesState = await readModulesState(path.join(rootManifest.rootDir, 'node_modules'));
    if (modulesState?.injectedDeps) {
      await linkManifestsToInjectedDeps({
        injectedDeps: modulesState.injectedDeps,
        manifestsByPaths,
        rootDir: rootManifest.rootDir,
      });
    }
  }
}

/**
 * This function creates manifests for root component wrappers.
 * Root component wrappers are used to isolated workspace components with their workspace dependencies
 * and peer dependencies.
 * A root component wrapper has the wrapped component in the dependencies and any of its peer dependencies.
 * This way pnpm will install the wrapped component in isolation from other components and their dependencies.
 */
function createRootComponentWrapperManifests(rootDir: string, manifestsByPaths: Record<string, ProjectManifest>) {
  const rootComponentWrappers: Record<string, ProjectManifest> = {};
  const rootComponents: string[] = [];
  for (const manifest of Object.values(manifestsByPaths)) {
    const name = manifest.name!.toString(); // eslint-disable-line
    const compDir = path.join(rootDir, 'node_modules', name);
    const id = path.relative(rootDir, compDir).replace(/\\/g, '/');
    rootComponents.push(encodeURIComponent(id));
    rootComponentWrappers[compDir] = {
      name: `${name}__root`,
      dependencies: {
        [name]: `workspace:*`,
        ...manifest.peerDependencies,
        ...manifest['defaultPeerDependencies'], // eslint-disable-line
      },
      dependenciesMeta: {
        [name]: { injected: true },
      },
    };
  }
  return {
    rootComponentWrappers,
    rootComponents,
  };
}

/**
 * This hook is used when installation is executed inside a capsule.
 * The components in the capsules should get their peer dependencies installed,
 * so this hook converts any peer dependencies into runtime dependencies.
 * Also, any local dependencies are extended with the "injected" option,
 * this tells pnpm to hard link the packages instead of symlinking them.
 */
function readPackageHookForCapsules(pkg: PackageManifest, workspaceDir?: string): PackageManifest {
  // workspaceDir is set only for workspace packages
  if (workspaceDir) {
    return readDependencyPackageHook({
      ...pkg,
      dependencies: {
        ...pkg.dependencies,
        ...pkg.peerDependencies,
        ...pkg['defaultPeerDependencies'], // eslint-disable-line
      },
    });
  }
  return readDependencyPackageHook(pkg);
}

/**
 * This hook is used when installation happens in a Bit workspace.
 * We need a different hook for this case because unlike in a capsule, in a workspace,
 * the package manager only links workspace components to subdependencies.
 * For direct dependencies, Bit's linking is used.
 */
function readPackageHook(pkg: PackageManifest, workspaceDir?: string): PackageManifest {
  if (!pkg.dependencies || pkg.name?.endsWith(`__root`)) {
    return pkg;
  }
  // workspaceDir is set only for workspace packages
  if (workspaceDir) {
    return readWorkspacePackageHook(pkg);
  }
  return readDependencyPackageHook(pkg);
}

/**
 * This hook adds the "injected" option to any workspace dependency.
 * The injected option tell pnpm to hard link the packages instead of symlinking them.
 */
function readDependencyPackageHook(pkg: PackageManifest): PackageManifest {
  const dependenciesMeta = pkg.dependenciesMeta ?? {};
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (version.startsWith('workspace:')) {
      // This instructs pnpm to hard link the component from the workspace, not symlink it.
      dependenciesMeta[name] = { injected: true };
    }
  }
  return {
    ...pkg,
    dependenciesMeta,
  };
}

/**
 * This hook is used when installation happens in a Bit workspace.
 * It is applied on workspace projects, and it removes any references to other workspace projects.
 * This is needed because Bit has its own linking for workspace projects.
 * pnpm should not override the links created by Bit.
 * Otherwise, the IDE would reference workspace projects from inside `node_modules/.pnpm`.
 */
function readWorkspacePackageHook(pkg: PackageManifest): PackageManifest {
  const newDeps = {};
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (!version.startsWith('workspace:')) {
      newDeps[name] = version;
    }
  }
  return {
    ...pkg,
    dependencies: newDeps,
  };
}

/*
 * The package.json files of the components are generated into node_modules/<component pkg name>/package.json
 * This function copies the generated package.json file into all the locations of the component.
 */
async function linkManifestsToInjectedDeps({
  rootDir,
  manifestsByPaths,
  injectedDeps,
}: {
  rootDir: string;
  manifestsByPaths: Record<string, ProjectManifest>;
  injectedDeps: Record<string, string[]>;
}) {
  await Promise.all(
    Object.entries(injectedDeps).map(async ([compDir, targetDirs]) => {
      const pkgName = manifestsByPaths[path.join(rootDir, compDir)]?.name;
      if (!pkgName) return;
      const pkgJsonPath = path.join(rootDir, 'node_modules', pkgName, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        await Promise.all(targetDirs.map((targetDir) => link(pkgJsonPath, path.join(targetDir, 'package.json'))));
      }
    })
  );
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
