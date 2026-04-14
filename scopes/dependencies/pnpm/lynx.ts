import semver from 'semver';
import parsePackageName from 'parse-package-name';
import { initDefaultReporter } from '@pnpm/cli.default-reporter';
import { streamParser } from '@pnpm/logger';
import type { StoreController, WantedDependency } from '@pnpm/store.controller';
import { TRUSTED_PACKAGE_NAMES } from '@pnpm/plugin-trusted-deps';
import { rebuild } from '@pnpm/building.commands';
import type { CreateStoreControllerOptions } from '@pnpm/store.connection-manager';
import { createStoreController as pnpmCreateStoreController } from '@pnpm/store.connection-manager';
import { sortProjects } from '@pnpm/workspace.projects-sorter';
import type {
  PackageManifest,
  ProjectManifest,
  ReadPackageHook,
  PeerDependencyRules,
  ProjectRootDir,
  DepPath,
} from '@pnpm/types';
import type { Registries } from '@teambit/pkg.entities.registry';
import { getAuthConfig } from '@teambit/pkg.config.auth';
import type {
  ResolvedPackageVersion,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
} from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import { BIT_ROOTS_DIR } from '@teambit/legacy.constants';
import type { MutatedProject, InstallOptions, PeerDependencyIssuesByProjects, ProjectOptions } from '@pnpm/installing.deps-installer';
import { mutateModules } from '@pnpm/installing.deps-installer';
import * as pnpm from '@pnpm/installing.deps-installer';
import type { ClientOptions } from '@pnpm/installing.client';
import { createResolver } from '@pnpm/installing.client';
import { restartWorkerPool, finishWorkers } from '@pnpm/worker';
import { createProjectsGraph } from '@pnpm/workspace.projects-graph';
import { readWantedLockfile, writeWantedLockfile } from '@pnpm/lockfile.fs';
import { type LockfileFile, type LockfileObject } from '@pnpm/lockfile.types';
import type { Logger } from '@teambit/logger';
import { VIRTUAL_STORE_DIR_MAX_LENGTH } from '@teambit/dependencies.pnpm.dep-path';
import { isEqual } from 'lodash';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';
import { readConfig } from './read-config';

/**
 * Packages that are known to have risky or unnecessary build scripts.
 * These packages will be disallowed from running scripts by default,
 * unless the user explicitly allows them in `allowScripts`.
 */
const UNTRUSTED_PACKAGE_NAMES = ['es5-ext', 'less', 'protobufjs', 'ssh', 'core-js-pure', 'core-js'];

const installsRunning: Record<string, Promise<any>> = {};
const cafsLocker = new Map<string, number>();

/**
 * Convert a flat rawConfig-style auth dict (keys like `//registry/:_authToken`, `_auth`, etc.)
 * into the `configByUri: Record<string, RegistryConfig>` structure that pnpm v11 APIs expect.
 */
function authConfigToConfigByUri(authConfig: Record<string, any>, defaultRegistry?: string): Record<string, any> {
  const configByUri: Record<string, any> = {};
  const defaultCreds: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authConfig)) {
    if (value == null) continue;
    // Default-registry creds (no `:` prefix): _auth, _authToken, _password, username, tokenHelper
    if (key === '_auth' || key === '_authToken' || key === '_password' || key === 'username' || key === 'tokenHelper') {
      defaultCreds[key] = value;
      continue;
    }
    // Per-registry keys end with ':<credsField>' or ':<sslField>' or ':<sslField>file'
    const credMatch = key.match(/^(.+):(_auth|_authToken|_password|username|tokenHelper)$/);
    if (credMatch) {
      const [, uri, field] = credMatch;
      configByUri[uri] ??= {};
      configByUri[uri].creds ??= {};
      if (field === '_authToken') configByUri[uri].creds.authToken = value;
      else if (field === '_auth') configByUri[uri].creds.basicAuth = decodeBasicAuth(value);
      else if (field === 'tokenHelper') configByUri[uri].creds.tokenHelper = value;
      else configByUri[uri].creds[field] = value;
      continue;
    }
    const sslMatch = key.match(/^(.+):(cert|key|ca)(file)?$/);
    if (sslMatch) {
      const [, uri, field] = sslMatch;
      configByUri[uri] ??= {};
      configByUri[uri].tls ??= {};
      configByUri[uri].tls[field] = value;
    }
  }
  // Build default creds entry keyed by default registry
  if (defaultRegistry && Object.keys(defaultCreds).length > 0) {
    configByUri[''] ??= {};
    configByUri[''].creds ??= {};
    if (defaultCreds._authToken != null) configByUri[''].creds.authToken = defaultCreds._authToken;
    if (defaultCreds._auth != null) configByUri[''].creds.basicAuth = decodeBasicAuth(defaultCreds._auth as string);
    if (defaultCreds.tokenHelper != null) configByUri[''].creds.tokenHelper = defaultCreds.tokenHelper;
  }
  return configByUri;
}

function decodeBasicAuth(b64: string): { username: string; password: string } {
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return { username: decoded, password: '' };
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

async function createStoreController(
  options: {
    rootDir: string;
    storeDir?: string;
    cacheDir: string;
    registries: Registries;
    proxyConfig: PackageManagerProxyConfig;
    networkConfig: PackageManagerNetworkConfig;
  } & Pick<CreateStoreControllerOptions, 'packageImportMethod' | 'pnpmHomeDir' | 'preferOffline'>
): Promise<{ ctrl: StoreController; dir: string }> {
  const authConfig = getAuthConfig(options.registries);
  const opts: CreateStoreControllerOptions = {
    dir: options.rootDir,
    cacheDir: options.cacheDir,
    cafsLocker,
    storeDir: options.storeDir,
    configByUri: authConfigToConfigByUri(authConfig, options.registries.defaultRegistry.uri),
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
    preferOffline: options.preferOffline,
    resolveSymlinksInInjectedDirs: true,
    pnpmHomeDir: options.pnpmHomeDir,
    userAgent: options.networkConfig.userAgent,
    fetchRetries: options.networkConfig.fetchRetries,
    fetchRetryFactor: options.networkConfig.fetchRetryFactor,
    fetchRetryMaxtimeout: options.networkConfig.fetchRetryMaxtimeout,
    fetchRetryMintimeout: options.networkConfig.fetchRetryMintimeout,
    fetchTimeout: options.networkConfig.fetchTimeout,
    virtualStoreDirMaxLength: VIRTUAL_STORE_DIR_MAX_LENGTH,
    registries: options.registries.toMap(),
    fetchWarnTimeoutMs: options.networkConfig.fetchWarnTimeoutMs,
    fetchMinSpeedKiBps: options.networkConfig.fetchMinSpeedKiBps,
  };
  return pnpmCreateStoreController(opts);
}

export async function generateResolverAndFetcher({
  cacheDir,
  registries,
  proxyConfig,
  networkConfig,
  fullMetadata,
}: {
  cacheDir: string;
  registries: Registries;
  proxyConfig?: PackageManagerProxyConfig;
  networkConfig?: PackageManagerNetworkConfig;
  fullMetadata?: boolean;
}) {
  const pnpmConfig = await readConfig();
  const authConfig = getAuthConfig(registries);
  proxyConfig ??= {};
  networkConfig ??= {};
  const mergedAuthConfig = Object.assign({}, pnpmConfig.config.authConfig, authConfig);
  const opts: Omit<ClientOptions, 'storeIndex'> = {
    configByUri: authConfigToConfigByUri(mergedAuthConfig, registries.defaultRegistry.uri),
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
    userAgent: networkConfig.userAgent,
    retry: {
      factor: networkConfig.fetchRetryFactor,
      maxTimeout: networkConfig.fetchRetryMaxtimeout,
      minTimeout: networkConfig.fetchRetryMintimeout,
      retries: networkConfig.fetchRetries,
    },
    registries: registries.toMap(),
    fullMetadata,
    fetchWarnTimeoutMs: networkConfig?.fetchWarnTimeoutMs,
    fetchMinSpeedKiBps: networkConfig?.fetchMinSpeedKiBps,
  };
  const { resolve } = createResolver(opts);
  return { resolve };
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
  for (const [rootDir, manifest] of Object.entries(manifestsByPaths)) {
    projects.push({
      buildIndex: 0, // this is not used while searching for peer issues anyway
      manifest,
      rootDir: rootDir as ProjectRootDir,
    });
  }
  const storeController = await createStoreController({
    ...opts,
    rootDir: opts.rootDir,
  });
  return pnpm.getPeerDependencyIssues(projects, {
    autoInstallPeers: false,
    excludeLinksFromLockfile: true,
    storeController: storeController.ctrl,
    storeDir: storeController.dir,
    globalVirtualStoreDir: storeController.dir,
    overrides: opts.overrides,
    peersSuffixMaxLength: 1000,
    registries: opts.registries.toMap(),
    virtualStoreDirMaxLength: VIRTUAL_STORE_DIR_MAX_LENGTH,
  });
}

export type RebuildFn = (opts: { pending?: boolean; skipIfHasSideEffectsCache?: boolean }) => Promise<void>;

export interface ReportOptions {
  appendOnly?: boolean;
  throttleProgress?: number;
  hideAddedPkgsProgress?: boolean;
  hideProgressPrefix?: boolean;
  hideLifecycleOutput?: boolean;
  peerDependencyRules?: PeerDependencyRules;
  process?: NodeJS.Process;
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
    reportOptions?: ReportOptions;
    hidePackageManagerOutput?: boolean;
    hoistInjectedDependencies?: boolean;
    dryRun?: boolean;
    dedupePeers?: boolean;
    dedupeInjectedDeps?: boolean;
    forcedHarmonyVersion?: string;
    allowScripts?: Record<string, boolean | 'warn'>;
    dangerouslyAllowAllScripts?: boolean;
  } & Pick<
    InstallOptions,
    | 'autoInstallPeers'
    | 'publicHoistPattern'
    | 'hoistPattern'
    | 'lockfileOnly'
    | 'nodeVersion'
    | 'enableModulesDir'
    | 'engineStrict'
    | 'excludeLinksFromLockfile'
    | 'minimumReleaseAge'
    | 'minimumReleaseAgeExclude'
    | 'ignorePackageManifest'
    | 'hoistWorkspacePackages'
    | 'returnListOfDepsRequiringBuild'
  > &
    Pick<CreateStoreControllerOptions, 'packageImportMethod' | 'pnpmHomeDir' | 'preferOffline'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger?: Logger
): Promise<{ dependenciesChanged: boolean; rebuild: RebuildFn; storeDir: string; depsRequiringBuild?: DepPath[] }> {
  const externalDependencies = new Set<string>();
  const readPackage = createReadPackageHooks(options);
  if (options?.rootComponents && !options?.rootComponentsForCapsules) {
    for (const [dir, { name }] of Object.entries(manifestsByPaths)) {
      if (dir !== rootDir && name) {
        externalDependencies.add(name);
      }
    }
  }
  const overrides = {
    ...options.overrides,
  };
  if (options.forcedHarmonyVersion) {
    // Harmony needs to be a singleton, so if a specific version was requested for the workspace,
    // we force that version accross the whole dependency graph.
    overrides['@teambit/harmony'] = options.forcedHarmonyVersion;
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
  const { allProjects, packagesToBuild } = groupPkgs(manifestsByPaths, {
    update: options?.updateAll,
  });
  const storeController = await createStoreController({
    rootDir,
    storeDir,
    cacheDir,
    registries,
    preferOffline: options?.preferOffline,
    proxyConfig,
    networkConfig,
    packageImportMethod: options?.packageImportMethod,
    pnpmHomeDir: options?.pnpmHomeDir,
  });
  const hoistPattern = options.hoistPattern ?? ['*'];
  if (hoistPattern.length > 0 && externalDependencies.size > 0 && !options.hoistInjectedDependencies) {
    for (const pkgName of externalDependencies) {
      hoistPattern.push(`!${pkgName}`);
    }
  }
  const opts: InstallOptions = {
    allProjects,
    autoInstallPeers: options.autoInstallPeers,
    autoInstallPeersFromHighestMatch: options.autoInstallPeers,
    confirmModulesPurge: false,
    storeDir: storeController.dir,
    dedupePeerDependents: true,
    dir: rootDir,
    storeController: storeController.ctrl,
    preferFrozenLockfile: true,
    pruneLockfileImporters: true,
    lockfileOnly: options.lockfileOnly ?? false,
    modulesCacheMaxAge: Infinity, // pnpm should never prune the virtual store. Bit does it on its own.
    registries: registries.toMap(),
    resolutionMode: 'highest',
    hooks: { readPackage },
    externalDependencies,
    strictPeerDependencies: false,
    peersSuffixMaxLength: 1000,
    resolveSymlinksInInjectedDirs: true,
    resolvePeersFromWorkspaceRoot: true,
    dedupeDirectDeps: true,
    include: {
      dependencies: true,
      devDependencies: true,
      optionalDependencies: options?.includeOptionalDeps !== false,
    },
    userAgent: networkConfig.userAgent,
    ...options,
    injectWorkspacePackages: true,
    ...resolveScriptPolicies({
      allowScripts: options.allowScripts,
      dangerouslyAllowAllScripts: options.dangerouslyAllowAllScripts,
    }),
    returnListOfDepsRequiringBuild: true,
    excludeLinksFromLockfile: options.excludeLinksFromLockfile ?? true,
    depth: options.updateAll ? Infinity : 0,
    disableRelinkLocalDirDeps: true,
    hoistPattern,
    virtualStoreDirMaxLength: VIRTUAL_STORE_DIR_MAX_LENGTH,
    overrides,
    peerDependencyRules: {
      allowAny: ['*'],
      ignoreMissing: ['*'],
      ...options.reportOptions?.peerDependencyRules,
    },
  };

  let dependenciesChanged = false;
  let depsRequiringBuild: DepPath[] | undefined;
  if (!options.dryRun) {
    let stopReporting: Function | undefined;
    if (!options.hidePackageManagerOutput) {
      stopReporting = initReporter({
        ...options.reportOptions,
        hideAddedPkgsProgress: options.lockfileOnly,
      });
    }
    try {
      await installsRunning[rootDir];
      await restartWorkerPool();
      installsRunning[rootDir] = mutateModules(packagesToBuild, opts);
      const installResult = await installsRunning[rootDir];
      depsRequiringBuild = installResult.depsRequiringBuild?.sort();
      if (depsRequiringBuild != null) {
        await addDepsRequiringBuildToLockfile(rootDir, depsRequiringBuild);
      }
      dependenciesChanged =
        installResult.stats.added + installResult.stats.removed + installResult.stats.linkedToRoot > 0;
      delete installsRunning[rootDir];
    } catch (err: any) {
      if (logger) {
        logger.warn('got an error from pnpm mutateModules function', err);
      }
      throw pnpmErrorToBitError(err);
    } finally {
      stopReporting?.();
      await finishWorkers();
    }
  }
  return {
    dependenciesChanged,
    rebuild: async (rebuildOpts) => {
      let stopReporting: Function | undefined;
      const _opts = {
        ...opts,
        ...rebuildOpts,
        cacheDir,
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!_opts.hidePackageManagerOutput) {
        stopReporting = initReporter({
          appendOnly: true,
          hideLifecycleOutput: true,
        });
      }
      try {
        await rebuild.handler(_opts, []);
      } finally {
        stopReporting?.();
      }
    },
    storeDir: storeController.dir,
    depsRequiringBuild,
  };
}

type ScriptPolicyConfig = {
  allowScripts?: Record<string, boolean | 'warn'>;
  dangerouslyAllowAllScripts?: boolean;
};

function resolveScriptPolicies({
  allowScripts,
  dangerouslyAllowAllScripts,
}: ScriptPolicyConfig): { allowBuilds: Record<string, boolean | string>; dangerouslyAllowAllBuilds?: boolean } {
  if (dangerouslyAllowAllScripts) {
    // Allow everything, but keep core-js denied by default (it was always in the legacy deny list).
    return {
      dangerouslyAllowAllBuilds: true,
      allowBuilds: { 'core-js': false },
    };
  }
  const allowBuilds: Record<string, boolean | string> = {};
  for (const [packageDescriptor, allowedScript] of Object.entries(allowScripts ?? {})) {
    if (allowedScript === true || allowedScript === false) {
      allowBuilds[packageDescriptor] = allowedScript;
    }
    // String values (e.g. 'warn') are placeholders — ignore them; pnpm warns about these.
  }
  for (const trustedPkgName of TRUSTED_PACKAGE_NAMES) {
    if (allowScripts?.[trustedPkgName] == null) {
      allowBuilds[trustedPkgName] = true;
    }
  }
  for (const untrustedPkgName of UNTRUSTED_PACKAGE_NAMES) {
    if (allowScripts?.[untrustedPkgName] !== true) {
      allowBuilds[untrustedPkgName] = false;
    }
  }
  return { allowBuilds };
}

function initReporter(opts?: ReportOptions) {
  return initDefaultReporter({
    context: {
      argv: [],
      process: opts?.process,
    },
    reportingOptions: {
      appendOnly: opts?.appendOnly ?? false,
      throttleProgress: opts?.throttleProgress ?? 200,
      hideAddedPkgsProgress: opts?.hideAddedPkgsProgress,
      hideProgressPrefix: opts?.hideProgressPrefix,
      hideLifecycleOutput: opts?.hideLifecycleOutput,
      approveBuildsInstructionText:
        'Update the "allowScripts" field under "teambit.dependencies/dependency-resolver" in workspace.jsonc. \nSet to true to allow, false to explicitly disallow. \nExample: allowScripts: { "esbuild": true, "core-js": false }. \nThis is a security-sensitive setting: enabling scripts may allow arbitrary code execution during install.',
    },
    streamParser: streamParser as any, // eslint-disable-line
    // Linked in core aspects are excluded from the output to reduce noise.
    // Other @teambit/ dependencies will be shown.
    // Only those that are symlinked from outside the workspace will be hidden.
    filterPkgsDiff: (diff) => !diff.name.startsWith('@teambit/') || !diff.from,
  });
}

/**
 * This function returns the list of hooks that are passed to pnpm
 * for transforming the manifests of dependencies during installation.
 */
export function createReadPackageHooks(options: {
  rootComponents?: boolean;
  rootComponentsForCapsules?: boolean;
  forcedHarmonyVersion?: string;
}): ReadPackageHook[] {
  const readPackage: ReadPackageHook[] = [];
  if (options?.rootComponents && !options?.rootComponentsForCapsules) {
    readPackage.push(readPackageHook as ReadPackageHook);
  }
  readPackage.push(removeLegacyFromDeps as ReadPackageHook);
  if (!options.forcedHarmonyVersion) {
    // If the workspace did not specify a harmony version in a root policy,
    // then we remove harmony from any dependencies, so that the one linked from bvm is used.
    readPackage.push(removeHarmonyFromDeps as ReadPackageHook);
  }
  if (options?.rootComponentsForCapsules) {
    readPackage.push(readPackageHookForCapsules as ReadPackageHook);
  }
  return readPackage;
}

/**
 * This hook is used when installation is executed inside a capsule.
 * The components in the capsules should get their peer dependencies installed,
 * so this hook converts any peer dependencies into runtime dependencies.
 */
function readPackageHookForCapsules(pkg: PackageManifest, workspaceDir?: string): PackageManifest {
  // workspaceDir is set only for workspace packages
  if (workspaceDir) {
    return {
      ...pkg,
      dependencies: {
        ...pkg.peerDependencies,
        ...pkg.dependencies,
      },
    };
  }
  return pkg;
}

/**
 * @teambit/legacy should never be installed as a dependency.
 * It is linked from bvm.
 */
function removeLegacyFromDeps(pkg: PackageManifest): PackageManifest {
  if (pkg.dependencies != null) {
    if (pkg.dependencies['@teambit/legacy'] && !pkg.dependencies['@teambit/legacy'].startsWith('link:')) {
      delete pkg.dependencies['@teambit/legacy'];
    }
  }
  if (pkg.peerDependencies != null) {
    if (pkg.peerDependencies['@teambit/legacy']) {
      delete pkg.peerDependencies['@teambit/legacy'];
    }
  }
  return pkg;
}

function removeHarmonyFromDeps(pkg: PackageManifest): PackageManifest {
  if (pkg.dependencies != null) {
    if (pkg.dependencies['@teambit/harmony'] && !pkg.dependencies['@teambit/harmony'].startsWith('link:')) {
      delete pkg.dependencies['@teambit/harmony'];
    }
  }
  if (pkg.peerDependencies != null) {
    if (pkg.peerDependencies['@teambit/harmony']) {
      delete pkg.peerDependencies['@teambit/harmony'];
    }
  }
  return pkg;
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
  if (workspaceDir && !workspaceDir.includes(BIT_ROOTS_DIR)) {
    return readWorkspacePackageHook(pkg);
  }
  return pkg;
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
      ...newDeps,
    },
  };
}

function groupPkgs(manifestsByPaths: Record<string, ProjectManifest>, opts: { update?: boolean }) {
  const pkgs = Object.entries(manifestsByPaths).map(([rootDir, manifest]) => ({
    rootDir: rootDir as ProjectRootDir,
    manifest,
  }));
  const { graph } = createProjectsGraph(pkgs);
  const chunks = sortProjects(graph as any);

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
  const packagesToBuild: MutatedProject[] = []; // @pnpm/installing.deps-installer will use this to install the packages
  const allProjects: ProjectOptions[] = [];

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
    }
  });
  return { packagesToBuild, allProjects };
}

export async function resolveRemoteVersion(
  packageName: string,
  {
    rootDir,
    cacheDir,
    fullMetadata,
    registries,
    proxyConfig,
    networkConfig,
  }: {
    rootDir: string;
    cacheDir: string;
    fullMetadata?: boolean;
    registries: Registries;
    proxyConfig?: PackageManagerProxyConfig;
    networkConfig?: PackageManagerNetworkConfig;
  }
): Promise<ResolvedPackageVersion> {
  const { resolve } = await generateResolverAndFetcher({
    cacheDir,
    fullMetadata,
    networkConfig,
    proxyConfig,
    registries,
  });
  const resolveOpts = {
    lockfileDir: rootDir,
    preferredVersions: {},
    projectDir: rootDir,
    registry: '',
  };
  try {
    const parsedPackage = parsePackageName(packageName);
    const wantedDep: WantedDependency = {
      alias: parsedPackage.name,
      bareSpecifier: parsedPackage.version,
    };
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
      manifest: val.manifest,
    };
  } catch (e: any) {
    if (!e.message?.includes('is not a valid string')) {
      throw pnpmErrorToBitError(e);
    }
    // The provided package is probably a git url or path to a folder
    const wantedDep: WantedDependency = {
      alias: undefined,
      bareSpecifier: packageName,
    };
    const val = await resolve(wantedDep, resolveOpts);
    if (!val.manifest) {
      throw new BitError('The resolved package has no manifest');
    }
    if (!val.normalizedBareSpecifier) {
      throw new BitError('The resolved package has no version');
    }
    return {
      packageName: val.manifest.name,
      version: val.normalizedBareSpecifier,
      isSemver: false,
      resolvedVia: val.resolvedVia,
      manifest: val.manifest,
    };
  }
}

async function addDepsRequiringBuildToLockfile(rootDir: string, depsRequiringBuild: string[]) {
  const lockfile = (await readWantedLockfile(rootDir, { ignoreIncompatible: true })) as BitLockfile;
  if (lockfile == null) return;
  if (isEqual(lockfile.bit?.depsRequiringBuild, depsRequiringBuild)) return;
  lockfile.bit = {
    ...lockfile.bit,
    depsRequiringBuild,
  };
  await writeWantedLockfile(rootDir, lockfile);
}

export interface BitLockfile extends LockfileObject {
  bit?: BitLockfileAttributes;
}

export interface BitLockfileFile extends LockfileFile {
  bit?: BitLockfileAttributes;
}

export interface BitLockfileAttributes {
  depsRequiringBuild: string[];
}
