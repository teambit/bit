import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import parsePackageName from 'parse-package-name';
import { initDefaultReporter } from '@pnpm/default-reporter';
import { streamParser } from '@pnpm/logger';
import { StoreController, WantedDependency } from '@pnpm/package-store';
import { readModulesManifest } from '@pnpm/modules-yaml';
import { createOrConnectStoreController, CreateStoreControllerOptions } from '@pnpm/store-connection-manager';
import { sortPackages } from '@pnpm/sort-packages';
import {
  ResolvedPackageVersion,
  Registries,
  NPM_REGISTRY,
  Registry,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import {
  MutatedProject,
  mutateModules,
  InstallOptions,
  PeerDependencyIssuesByProjects,
  ProjectOptions,
} from '@pnpm/core';
import * as pnpm from '@pnpm/core';
import { createClient, ClientOptions } from '@pnpm/client';
import { pickRegistryForPackage } from '@pnpm/pick-registry-for-package';
import { createPkgGraph } from '@pnpm/workspace.pkgs-graph';
import { PackageManifest, ProjectManifest, ReadPackageHook } from '@pnpm/types';
import { Logger } from '@teambit/logger';
import toNerfDart from 'nerf-dart';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';
import { readConfig } from './read-config';

const installsRunning: Record<string, Promise<any>> = {};

type RegistriesMap = {
  default: string;
  [registryName: string]: string;
};

const STORE_CACHE: Record<string, { ctrl: StoreController; dir: string }> = {};

async function createStoreController(
  options: {
    rootDir: string;
    storeDir?: string;
    cacheDir: string;
    registries: Registries;
    proxyConfig: PackageManagerProxyConfig;
    networkConfig: PackageManagerNetworkConfig;
  } & Pick<CreateStoreControllerOptions, 'packageImportMethod' | 'pnpmHomeDir'>
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
    resolveSymlinksInInjectedDirs: true,
    pnpmHomeDir: options.pnpmHomeDir,
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
    rawConfig: pnpmConfig.config.rawConfig,
    retry: {
      factor: networkConfig.fetchRetryFactor,
      maxTimeout: networkConfig.fetchRetryMaxtimeout,
      minTimeout: networkConfig.fetchRetryMintimeout,
      retries: networkConfig.fetchRetries,
    },
  };
  const result = createClient(opts);
  return result;
}

export async function getPeerDependencyIssues(
  manifestsByPaths: Record<string, any>,
  opts: {
    storeDir?: string;
    cacheDir: string;
    registries: Registries;
    rootDir: string;
    proxyConfig: PackageManagerProxyConfig;
    networkConfig: PackageManagerNetworkConfig;
    overrides?: Record<string, string>;
  } & Pick<CreateStoreControllerOptions, 'packageImportMethod' | 'pnpmHomeDir'>
): Promise<PeerDependencyIssuesByProjects> {
  const projects: ProjectOptions[] = [];
  const workspacePackages = {};
  for (const [rootDir, manifest] of Object.entries(manifestsByPaths)) {
    projects.push({
      buildIndex: 0, // this is not used while searching for peer issues anyway
      manifest,
      rootDir,
    });
    workspacePackages[manifest.name] = workspacePackages[manifest.name] || {};
    workspacePackages[manifest.name][manifest.version] = { dir: rootDir, manifest };
  }
  const registriesMap = getRegistriesMap(opts.registries);
  const storeController = await createStoreController({
    ...opts,
    rootDir: opts.rootDir,
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
  rootDir: string,
  manifestsByPaths: Record<string, ProjectManifest>,
  storeDir: string | undefined,
  cacheDir: string,
  registries: Registries,
  proxyConfig: PackageManagerProxyConfig = {},
  networkConfig: PackageManagerNetworkConfig = {},
  options: {
    updateAll?: boolean;
    nodeLinker?: 'hoisted' | 'isolated';
    overrides?: Record<string, string>;
    rootComponents?: boolean;
    rootComponentsForCapsules?: boolean;
    includeOptionalDeps?: boolean;
  } & Pick<
    InstallOptions,
    'publicHoistPattern' | 'hoistPattern' | 'nodeVersion' | 'engineStrict' | 'peerDependencyRules'
  > &
    Pick<CreateStoreControllerOptions, 'packageImportMethod' | 'pnpmHomeDir'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger?: Logger
) {
  let externalDependencies: Set<string> | undefined;
  const readPackage: ReadPackageHook[] = [];
  if (options?.rootComponents && !options?.rootComponentsForCapsules) {
    externalDependencies = new Set(
      Object.values(manifestsByPaths)
        .map(({ name }) => name)
        .filter(Boolean) as string[]
    );
    readPackage.push(readPackageHook as ReadPackageHook);
  }
  if (!manifestsByPaths[rootDir].dependenciesMeta) {
    manifestsByPaths = {
      ...manifestsByPaths,
      [rootDir]: {
        ...manifestsByPaths[rootDir],
        dependenciesMeta: {},
      },
    };
  }
  if (options?.rootComponentsForCapsules) {
    readPackage.push(readPackageHookForCapsules as ReadPackageHook);
  }
  const { allProjects, packagesToBuild, workspacePackages } = groupPkgs(manifestsByPaths, {
    update: options?.updateAll,
  });
  const registriesMap = getRegistriesMap(registries);
  const authConfig = getAuthConfig(registries);
  const storeController = await createStoreController({
    rootDir,
    storeDir,
    cacheDir,
    registries,
    proxyConfig,
    networkConfig,
    packageImportMethod: options?.packageImportMethod,
    pnpmHomeDir: options?.pnpmHomeDir,
  });
  const opts: InstallOptions = {
    allProjects,
    storeDir: storeController.dir,
    dedupePeerDependents: true,
    dir: rootDir,
    storeController: storeController.ctrl,
    workspacePackages,
    preferFrozenLockfile: true,
    pruneLockfileImporters: true,
    modulesCacheMaxAge: 0,
    neverBuiltDependencies: ['core-js'],
    registries: registriesMap,
    rawConfig: authConfig,
    hooks: { readPackage },
    externalDependencies,
    strictPeerDependencies: false,
    resolveSymlinksInInjectedDirs: true,
    resolvePeersFromWorkspaceRoot: true,
    dedupeDirectDeps: true,
    include: {
      dependencies: true,
      devDependencies: true,
      optionalDependencies: options?.includeOptionalDeps !== false,
    },
    ...options,
    peerDependencyRules: {
      allowAny: ['*'],
      ignoreMissing: ['*'],
      ...options?.peerDependencyRules,
    },
    depth: options.updateAll ? Infinity : 0,
  };

  const stopReporting = initDefaultReporter({
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
    await installsRunning[rootDir];
    installsRunning[rootDir] = mutateModules(packagesToBuild, opts);
    await installsRunning[rootDir];
    delete installsRunning[rootDir];
  } catch (err: any) {
    throw pnpmErrorToBitError(err);
  } finally {
    stopReporting();
  }
  if (options.rootComponents) {
    const modulesState = await readModulesManifest(path.join(rootDir, 'node_modules'));
    if (modulesState?.injectedDeps) {
      await linkManifestsToInjectedDeps({
        injectedDeps: modulesState.injectedDeps,
        manifestsByPaths,
        rootDir,
      });
    }
  }
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
        await Promise.all(
          targetDirs.map(async (targetDir) => {
            try {
              await fs.link(pkgJsonPath, path.join(targetDir, 'package.json'));
            } catch (err: any) {
              if (err.code !== 'EEXIST') throw err;
            }
          })
        );
      }
    })
  );
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
  if (!pkg.dependencies) {
    return pkg;
  }
  // workspaceDir is set only for workspace packages
  if (workspaceDir && !workspaceDir.includes('.bit_roots')) {
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
    dependencies: {
      ...pkg.peerDependencies,
      ...pkg['defaultPeerDependencies'], // eslint-disable-line
      ...newDeps,
    },
  };
}

function groupPkgs(manifestsByPaths: Record<string, ProjectManifest>, opts: { update?: boolean }) {
  const pkgs = Object.entries(manifestsByPaths).map(([dir, manifest]) => ({ dir, manifest }));
  const { graph } = createPkgGraph(pkgs);
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
  const allProjects: ProjectOptions[] = [];
  const workspacePackages = {}; // @pnpm/core will use this to link packages to each other

  chunks.forEach((dirs, buildIndex) => {
    for (const rootDir of dirs) {
      const manifest = manifestsByPaths[rootDir];
      allProjects.push({
        buildIndex,
        manifest,
        rootDir,
      });
      packagesToBuild.push({
        rootDir,
        mutation: 'install',
        update: opts.update,
      });
      if (manifest.name) {
        workspacePackages[manifest.name] = workspacePackages[manifest.name] || {};
        workspacePackages[manifest.name][manifest.version] = { dir: rootDir, manifest };
      }
    }
  });
  return { packagesToBuild, allProjects, workspacePackages };
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
    lockfileDir: rootDir,
    preferredVersions: {},
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
    resolveOpts.registry = registry;
    const val = await resolve(wantedDep, resolveOpts);
    if (!val.manifest) {
      throw new BitError('The resolved package has no manifest');
    }
    const wantedRange =
      parsedPackage.version && semver.validRange(parsedPackage.version) ? parsedPackage.version : undefined;

    return {
      packageName: val.manifest.name,
      version: val.manifest.version,
      wantedRange,
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
    if (!val.manifest) {
      throw new BitError('The resolved package has no manifest');
    }
    if (!val.normalizedPref) {
      throw new BitError('The resolved package has no version');
    }
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
