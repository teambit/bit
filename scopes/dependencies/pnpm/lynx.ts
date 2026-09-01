import { join } from 'path';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import semver from 'semver';
import parsePackageName from 'parse-package-name';
import { TRUSTED_PACKAGE_NAMES } from '@pnpm/plugin-trusted-deps';
import type {
  PackageManifest,
  ProjectManifest,
  ReadPackageHook,
  PeerDependencyRules,
  DependencyManifest,
  DepPath,
} from '@pnpm/types';
import * as nodeApi from '@pnpm/napi';
import type { PeerDependencyIssuesByProjects } from '@pnpm/napi';
import { type LockfileFile } from '@pnpm/lockfile.types';
import type { Registries } from '@teambit/pkg.entities.registry';
import toNerfDart from 'nerf-dart';
import type {
  ResolvedPackageVersion,
  PackageManagerProxyConfig,
  PackageManagerNetworkConfig,
  PackageExtension,
} from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import { BIT_ROOTS_DIR } from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';
import { VIRTUAL_STORE_DIR_MAX_LENGTH } from '@teambit/dependencies.pnpm.dep-path';
import { isEqual } from 'lodash';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';
import { readConfig } from './read-config';
import { addNodeGypToPath } from './node-gyp-bin';

/**
 * Packages that are known to have risky or unnecessary build scripts.
 * These packages will be disallowed from running scripts by default,
 * unless the user explicitly allows them in `allowScripts`.
 */
const UNTRUSTED_PACKAGE_NAMES = ['es5-ext', 'less', 'protobufjs', 'ssh', 'core-js-pure', 'core-js'];

const installsRunning: Record<string, Promise<any>> = {};

/**
 * Minimal structural signature of the `resolve` function returned by
 * `generateResolverAndFetcher`. It mirrors what the old
 * `@pnpm/installing.client` `ResolveFunction` exposed, but is backed by
 * `@pnpm/napi`'s `resolveDependency`.
 */
type ResolveOpts = {
  lockfileDir?: string;
  projectDir?: string;
  preferredVersions?: Record<string, unknown>;
  registry?: string;
};
type ResolveFunction = (
  wantedDependency: nodeApi.WantedDependency,
  opts: ResolveOpts
) => Promise<nodeApi.ResolveResult>;

function toNodeApiProxyConfig(proxyConfig: PackageManagerProxyConfig): nodeApi.ProxyConfig {
  return {
    httpProxy: proxyConfig.httpProxy,
    httpsProxy: proxyConfig.httpsProxy,
    noProxy: proxyConfig.noProxy,
  };
}

function toNodeApiNetworkConfig(networkConfig: PackageManagerNetworkConfig): nodeApi.NetworkConfig {
  return {
    ca: networkConfig.ca,
    cert: networkConfig.cert,
    key: networkConfig.key,
    localAddress: networkConfig.localAddress,
    strictSsl: networkConfig.strictSSL,
    maxSockets: networkConfig.maxSockets,
    networkConcurrency: networkConfig.networkConcurrency,
    fetchRetries: networkConfig.fetchRetries,
    fetchRetryFactor: networkConfig.fetchRetryFactor,
    fetchRetryMintimeout: networkConfig.fetchRetryMintimeout,
    fetchRetryMaxtimeout: networkConfig.fetchRetryMaxtimeout,
    fetchTimeout: networkConfig.fetchTimeout,
    userAgent: networkConfig.userAgent,
  };
}

/**
 * Pre-computed `Authorization` headers keyed by nerf-darted registry URI
 * (plus `''` for the default registry) — the shape `@pnpm/napi` applies
 * directly. Bit's registries model already carries ready-to-send header
 * values (from the engine's `readConfig` plus Bit's own cloud token), so no
 * npmrc-style credential round-trip is needed.
 */
function buildAuthHeaderByUri(registries: Registries): Record<string, string> {
  const result: Record<string, string> = {};
  for (const registry of Object.values(registries.scopes)) {
    if (registry.uri && registry.authHeaderValue) {
      result[toNerfDart(registry.uri)] = registry.authHeaderValue;
    }
  }
  const { defaultRegistry } = registries;
  if (defaultRegistry?.authHeaderValue) {
    if (defaultRegistry.uri) {
      result[toNerfDart(defaultRegistry.uri)] = defaultRegistry.authHeaderValue;
    }
    result[''] = defaultRegistry.authHeaderValue;
  }
  return result;
}

/**
 * Compose the list of read-package hooks into a single synchronous transform.
 * The Bit hooks are all synchronous, so the accumulator stays synchronous even
 * though the pnpm `ReadPackageHook` type allows returning a promise.
 */
function applyReadPackageHooks(
  hooks: ReadPackageHook[],
  manifest: PackageManifest,
  workspaceDir?: string
): PackageManifest {
  return hooks.reduce<PackageManifest>((m, hook) => hook(m, workspaceDir) as PackageManifest, manifest);
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
}): Promise<{ resolve: ResolveFunction }> {
  const pnpmConfig = await readConfig();
  // The engine-resolved `.npmrc` headers first; Bit's own registries model
  // (which carries the cloud token) wins on conflict.
  const authHeaderByUri = { ...pnpmConfig.config.authHeaderByUri, ...buildAuthHeaderByUri(registries) };
  const registriesMap = registries.toMap();
  const resolve: ResolveFunction = (wantedDep, resolveOpts) =>
    nodeApi.resolveDependency(wantedDep, {
      dir: resolveOpts.projectDir || resolveOpts.lockfileDir || process.cwd(),
      cacheDir,
      registries: registriesMap,
      authHeaderByUri,
      proxyConfig: proxyConfig ? toNodeApiProxyConfig(proxyConfig) : undefined,
      networkConfig: networkConfig ? toNodeApiNetworkConfig(networkConfig) : undefined,
      fullMetadata,
    });
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
    packageImportMethod?: 'auto' | 'hardlink' | 'copy' | 'clone';
    pnpmHomeDir?: string;
  }
): Promise<PeerDependencyIssuesByProjects> {
  const projects: nodeApi.NodeApiProject[] = Object.entries(manifestsByPaths).map(([rootDir, manifest]) => ({
    rootDir,
    manifest: manifest as nodeApi.PackageManifest,
  }));
  try {
    return await nodeApi.getPeerDependencyIssues({
      dir: opts.rootDir,
      projects,
      storeDir: opts.storeDir,
      cacheDir: opts.cacheDir,
      overrides: opts.overrides,
      peersSuffixMaxLength: 1000,
      registries: opts.registries.toMap(),
      authHeaderByUri: buildAuthHeaderByUri(opts.registries),
      proxyConfig: toNodeApiProxyConfig(opts.proxyConfig),
      networkConfig: toNodeApiNetworkConfig(opts.networkConfig),
      virtualStoreDirMaxLength: VIRTUAL_STORE_DIR_MAX_LENGTH,
    });
  } catch (err: any) {
    throw pnpmErrorToBitError(err);
  }
}

export type RebuildFn = (opts: { pending?: boolean; skipIfHasSideEffectsCache?: boolean }) => Promise<void>;

/**
 * A stream the engine's rendered output can be written to. `columns` is
 * how the frame is sized; a stream that is not a terminal has none, and
 * the reporter falls back to pnpm's 80-column default.
 */
export type OutputStream = NodeJS.WritableStream & { columns?: number };

export interface ReportOptions {
  appendOnly?: boolean;
  throttleProgress?: number;
  hideAddedPkgsProgress?: boolean;
  hideProgressPrefix?: boolean;
  hideLifecycleOutput?: boolean;
  peerDependencyRules?: PeerDependencyRules;
  /** Defaults to `process.stdout`. */
  outputStream?: OutputStream;
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
    neverBuiltDependencies?: string[];
    autoInstallPeers?: boolean;
    publicHoistPattern?: string[];
    hoistPattern?: string[];
    lockfileOnly?: boolean;
    nodeVersion?: string;
    enableModulesDir?: boolean;
    engineStrict?: boolean;
    excludeLinksFromLockfile?: boolean;
    minimumReleaseAge?: number;
    minimumReleaseAgeExclude?: string[];
    ignorePackageManifest?: boolean;
    hoistWorkspacePackages?: boolean;
    returnListOfDepsRequiringBuild?: boolean;
    packageImportMethod?: 'auto' | 'hardlink' | 'copy' | 'clone';
    enableGlobalVirtualStore?: boolean;
    globalVirtualStoreDir?: string;
    patchedDependencies?: Record<string, string>;
    packageExtensions?: Record<string, PackageExtension>;
    pnpmHomeDir?: string;
    preferOffline?: boolean;
    // Accepted for backward-compatibility with the previous pnpm engine, but the
    // Rust engine manages the side-effects cache internally.
    sideEffectsCacheRead?: boolean;
    sideEffectsCacheWrite?: boolean;
  },
  logger?: Logger
): Promise<{ dependenciesChanged: boolean; rebuild: RebuildFn; storeDir: string; depsRequiringBuild?: DepPath[] }> {
  const externalDependencies = new Set<string>();
  const hooks = createReadPackageHooks(options);
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
  const hoistPattern = options.hoistPattern ?? ['*'];
  if (hoistPattern.length > 0 && externalDependencies.size > 0 && !options.hoistInjectedDependencies) {
    for (const pkgName of externalDependencies) {
      hoistPattern.push(`!${pkgName}`);
    }
  }
  const scriptPolicies = resolveScriptPolicies({
    allowScripts: options.allowScripts,
    dangerouslyAllowAllScripts: options.dangerouslyAllowAllScripts,
    neverBuiltDependencies: options.neverBuiltDependencies,
  });

  // The in-memory importer manifests are transformed up front (with each
  // importer's own directory as workspaceDir). The dependency manifests are
  // transformed lazily by the engine through the readPackageHook (which has no
  // workspaceDir).
  const projects: nodeApi.NodeApiProject[] = Object.entries(manifestsByPaths).map(([dir, manifest]) => ({
    rootDir: dir,
    manifest: applyReadPackageHooks(
      hooks,
      manifest as unknown as PackageManifest,
      dir
    ) as unknown as nodeApi.PackageManifest,
  }));
  // When the engine resolves a workspace project as a dependency (an injected
  // "file:" instance), it hands the hook that project's importer manifest —
  // which the up-front transform above already stripped of workspace-sibling
  // deps. The instance must keep those deps (they become the component's graph
  // edges), so substitute the project's raw manifest, identified by the
  // lockfile-root-relative directory the engine passes for directory
  // resolutions. pnpm's TS engine reaches the same split by keeping raw
  // project manifests and applying the hook chain contextually.
  const readPackageHookForDeps = (manifest: nodeApi.PackageManifest, resolvedDir?: string): nodeApi.PackageManifest => {
    const rawManifest = resolvedDir ? manifestsByPaths[join(rootDir, resolvedDir)] : undefined;
    const resolvedManifest = applyReadPackageHooks(
      hooks,
      (rawManifest ?? manifest) as unknown as PackageManifest
    ) as unknown as nodeApi.PackageManifest;
    return removeScriptsFromNeverBuiltPackages(resolvedManifest, scriptPolicies.neverBuildPackageNames);
  };

  const installOptions: nodeApi.InstallOptions = {
    dir: rootDir,
    projects,
    storeDir,
    cacheDir,
    registries: registries.toMap(),
    authHeaderByUri: buildAuthHeaderByUri(registries),
    proxyConfig: toNodeApiProxyConfig(proxyConfig),
    networkConfig: toNodeApiNetworkConfig(networkConfig),
    overrides,
    nodeLinker: options.nodeLinker,
    // Resolve bare-semver deps on workspace components (incl. auto-installed
    // peers naming a sibling component) from the workspace instead of the
    // registry — otherwise an unpublished component peer 404s. `'deep'` so
    // transitive component deps link locally too.
    linkWorkspacePackages: 'deep',
    hoistPattern,
    publicHoistPattern: options.publicHoistPattern,
    externalDependencies: [...externalDependencies],
    allowBuilds: scriptPolicies.allowBuilds as Record<string, boolean>,
    dangerouslyAllowAllBuilds: scriptPolicies.dangerouslyAllowAllBuilds,
    // `neverBuiltDependencies` is already folded into `allowBuilds` above by
    // `resolveScriptPolicies`; the binding rejects a non-empty pass-through.
    autoInstallPeers: options.autoInstallPeers,
    excludeLinksFromLockfile: options.excludeLinksFromLockfile ?? true,
    lockfileOnly: options.lockfileOnly ?? false,
    packageImportMethod: options.packageImportMethod,
    preferOffline: options.preferOffline,
    virtualStoreDirMaxLength: VIRTUAL_STORE_DIR_MAX_LENGTH,
    // The hoisted linker copies packages straight into `node_modules` instead of symlinking them
    // out of a virtual store, so there is no virtual store for the global one to replace.
    enableGlobalVirtualStore: options.nodeLinker === 'hoisted' ? false : options.enableGlobalVirtualStore,
    globalVirtualStoreDir: options.globalVirtualStoreDir,
    patchedDependencies: options.patchedDependencies,
    packageExtensions: options.packageExtensions,
    peersSuffixMaxLength: 1000,
    dedupePeerDependents: true,
    dedupePeers: options.dedupePeers,
    dedupeDirectDeps: true,
    dedupeInjectedDeps: options.dedupeInjectedDeps,
    injectWorkspacePackages: true,
    includeOptionalDeps: options.includeOptionalDeps !== false,
    // `update` re-resolves the whole graph; the binding ignores `depth` (there
    // are no package selectors), but pass a finite full-depth value for parity
    // with the old engine's `depth: Infinity` update-all call.
    update: options.updateAll,
    depth: options.updateAll ? 1000 : undefined,
    nodeVersion: options.nodeVersion,
    engineStrict: options.engineStrict,
    // pnpm v12 defaults minimumReleaseAge to 1440 when the option is absent.
    // bit.cloud packuments are huge (a version per snap) and their abbreviated
    // form carries no `time` field, so the maturity cutoff forces a full-
    // packument upgrade fetch for every component on a cold resolve. Disable
    // the policy unless the workspace opts in.
    minimumReleaseAge: options.minimumReleaseAge ?? 0,
    minimumReleaseAgeExclude: options.minimumReleaseAgeExclude,
    // Bit lockfiles are trusted workspace input. Keep installs compatible with
    // lockfiles generated before pnpm v12 added registry resolution verification.
    trustLockfile: true,
    ignorePackageManifest: options.ignorePackageManifest,
    hoistWorkspacePackages: options.hoistWorkspacePackages,
    enableModulesDir: options.enableModulesDir,
    resolvePeersFromWorkspaceRoot: true,
    frozenLockfile: options.updateAll ? false : undefined,
    preferFrozenLockfile: !options.updateAll,
    // Suppress peer-dependency warnings by default (allow any version, ignore
    // missing), letting the workspace's own rules override.
    peerDependencyRules: {
      allowAny: ['*'],
      ignoreMissing: ['*'],
      ...options.reportOptions?.peerDependencyRules,
    } as nodeApi.PeerDependencyRules,
    // Bit reports the deps requiring a build in the lockfile instead of failing.
    strictDepBuilds: false,
    pnpmHomeDir: options.pnpmHomeDir,
    // Report every package with install scripts (not just blocked ones) in
    // `depsRequiringBuild`, so the `bit:` lockfile block lists them even
    // though Bit allows the builds to run.
    returnListOfDepsRequiringBuild: true,
    reporter: options.hidePackageManagerOutput
      ? undefined
      : toReporterOptions({ ...options.reportOptions, hideAddedPkgsProgress: options.lockfileOnly }),
  };

  let dependenciesChanged = false;
  let depsRequiringBuild: DepPath[] | undefined;
  let resolvedStoreDir = storeDir;
  if (!options.dryRun) {
    // Dependency build scripts inherit this process's PATH. Set up inside the
    // guard, so a dry run neither writes the wrapper nor touches the env.
    addNodeGypToPath(logger);
    let installPromise: Promise<nodeApi.InstallResult> | undefined;
    let restoreWantedLockfile: (() => Promise<void>) | undefined;
    const onOutput = options.hidePackageManagerOutput ? undefined : reporterOutput(options.reportOptions);
    try {
      await installsRunning[rootDir];
      // The engine rewrites pnpm-lock.yaml from its typed model, which
      // does not round-trip Bit's `bit:` extension block (the v11 TS
      // engine mutated the loaded object in place, so the block
      // survived). Capture it up front and re-assert it after the
      // install alongside `depsRequiringBuild`.
      const preInstallBitAttrs = await readBitLockfileAttrs(rootDir);
      restoreWantedLockfile = await removeWantedLockfileForUpdate(rootDir, options.updateAll);
      installPromise = nodeApi.install(installOptions, undefined, readPackageHookForDeps, onOutput);
      installsRunning[rootDir] = installPromise;
      const installResult: nodeApi.InstallResult = await installPromise;
      resolvedStoreDir = installResult.storeDir;
      const sortedDepsRequiringBuild = sortDepsRequiringBuild(installResult.depsRequiringBuild);
      const bitAttrs = mergeBitLockfileAttrs(preInstallBitAttrs, sortedDepsRequiringBuild);
      if (bitAttrs != null) {
        await addBitAttributesToLockfile(rootDir, bitAttrs);
      }
      depsRequiringBuild = sortedDepsRequiringBuild as unknown as DepPath[] | undefined;
      dependenciesChanged =
        installResult.stats.added + installResult.stats.removed + installResult.stats.linkedToRoot > 0;
    } catch (err: any) {
      await restoreWantedLockfile?.();
      if (logger) {
        logger.warn('got an error from the pnpm install function', err);
      }
      throw pnpmErrorToBitError(err);
    } finally {
      if (installPromise && installsRunning[rootDir] === installPromise) {
        delete installsRunning[rootDir];
      }
    }
  }
  return {
    dependenciesChanged,
    // The Rust engine's rebuild rebuilds every build-needing package and does not
    // support the pending / skipIfHasSideEffectsCache selectors of the old engine.
    rebuild: async () => {
      // Reached without an install of its own after a dry run.
      addNodeGypToPath(logger);
      // Same output routing as the install: the CLI server's stream has to
      // carry the rebuild's output too, not just the install's.
      const rebuildReportOptions: ReportOptions = {
        ...options.reportOptions,
        appendOnly: true,
        hideLifecycleOutput: true,
      };
      await nodeApi.rebuild(
        {
          ...installOptions,
          storeDir: resolvedStoreDir,
          reporter: options.hidePackageManagerOutput ? undefined : toReporterOptions(rebuildReportOptions),
        },
        undefined,
        undefined,
        options.hidePackageManagerOutput ? undefined : reporterOutput(rebuildReportOptions)
      );
    },
    storeDir: resolvedStoreDir ?? '',
    depsRequiringBuild,
  };
}

async function removeWantedLockfileForUpdate(
  rootDir: string,
  updateAll?: boolean
): Promise<(() => Promise<void>) | undefined> {
  if (!updateAll) return undefined;
  const lockfilePath = join(rootDir, 'pnpm-lock.yaml');
  let lockfileContent: Buffer;
  try {
    lockfileContent = await fs.readFile(lockfilePath);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return undefined;
    throw err;
  }
  await fs.unlink(lockfilePath);
  return async () => {
    await fs.writeFile(lockfilePath, lockfileContent);
  };
}

type ScriptPolicyConfig = {
  allowScripts?: Record<string, boolean | 'warn'>;
  dangerouslyAllowAllScripts?: boolean;
  neverBuiltDependencies?: string[];
};

export function resolveScriptPolicies({
  allowScripts,
  dangerouslyAllowAllScripts,
  neverBuiltDependencies,
}: ScriptPolicyConfig): {
  allowBuilds: Record<string, boolean | string>;
  dangerouslyAllowAllBuilds?: boolean;
  neverBuildPackageNames?: string[];
} {
  const allowBuilds: Record<string, boolean | string> = {};
  if (dangerouslyAllowAllScripts) {
    if (!neverBuiltDependencies?.length) {
      return { allowBuilds, dangerouslyAllowAllBuilds: true };
    }
    for (const pkg of neverBuiltDependencies) {
      allowBuilds[pkg] = false;
    }
    return { allowBuilds, neverBuildPackageNames: neverBuiltDependencies };
  }
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
  for (const pkg of neverBuiltDependencies ?? []) {
    allowBuilds[pkg] = false;
  }
  return { allowBuilds };
}

function removeScriptsFromNeverBuiltPackages(
  manifest: nodeApi.PackageManifest,
  neverBuildPackageNames?: string[]
): nodeApi.PackageManifest {
  if (!manifest.name || !manifest.scripts || !neverBuildPackageNames?.includes(manifest.name)) return manifest;
  return {
    ...manifest,
    scripts: undefined,
  };
}

const APPROVE_BUILDS_INSTRUCTION_TEXT =
  'Update the "allowScripts" field under "teambit.dependencies/dependency-resolver" in workspace.jsonc. \nSet to true to allow, false to explicitly disallow. \nExample: allowScripts: { "esbuild": true, "core-js": false }. \nThis is a security-sensitive setting: enabling scripts may allow arbitrary code execution during install.';

/**
 * How the engine should render pnpm's output. Every field maps onto the
 * pnpm reporting option of the same name.
 */
function toReporterOptions(opts?: ReportOptions): nodeApi.ReporterOptions {
  const stream = reporterOutputStream(opts);
  return {
    appendOnly: opts?.appendOnly ?? false,
    throttleProgress: opts?.throttleProgress ?? 200,
    hideAddedPkgsProgress: opts?.hideAddedPkgsProgress,
    hideProgressPrefix: opts?.hideProgressPrefix,
    hideLifecycleOutput: opts?.hideLifecycleOutput,
    ignoredBuildsInstructionText: APPROVE_BUILDS_INSTRUCTION_TEXT,
    // Core aspects Bit links in are excluded from the summary to reduce
    // noise. Other @teambit/ dependencies still show; only the ones
    // symlinked from outside the workspace are hidden.
    hideLinkedPkgsDiff: ['@teambit/*'],
    // pnpm's `outputMaxWidth`, floored: a terminal reporting one or two
    // columns would otherwise ask the engine to wrap at zero.
    width: stream.columns ? Math.max(stream.columns - 2, 1) : 80,
    // chalk is the switch Bit already flips for its own output (the CLI
    // server enables it per request and resets it afterwards), so the
    // engine follows it rather than probing the terminal itself.
    color: chalk.level > 0,
  };
}

/**
 * Where the engine's rendered output goes. It has to be written through
 * the JS stream rather than by the engine itself: Bit monkey-patches
 * `process.stdout.write` to mirror output to a tty, and the CLI server
 * swaps in a stream that forwards to connected editors — a write from Rust
 * would bypass both.
 */
function reporterOutput(opts?: ReportOptions): (chunk: string) => void {
  const stream = reporterOutputStream(opts);
  return (chunk) => {
    stream.write(chunk);
  };
}

function reporterOutputStream(opts?: ReportOptions): OutputStream {
  return opts?.outputStream ?? process.stdout;
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
    const wantedDep: nodeApi.WantedDependency = {
      alias: parsedPackage.name,
      // parse-package-name returns an empty string when no version is present,
      // but the engine resolves only undefined (or an explicit range) as "latest".
      bareSpecifier: parsedPackage.version || undefined,
    };
    const val = await resolve(wantedDep, resolveOpts);
    if (!val.manifest) {
      throw new BitError('The resolved package has no manifest');
    }
    const manifest = val.manifest as unknown as DependencyManifest;
    const wantedRange =
      parsedPackage.version && semver.validRange(parsedPackage.version) ? parsedPackage.version : undefined;

    return {
      packageName: manifest.name,
      version: manifest.version,
      wantedRange,
      isSemver: true,
      resolvedVia: val.resolvedVia,
      manifest,
    };
  } catch (e: any) {
    if (!e.message?.includes('is not a valid string')) {
      throw pnpmErrorToBitError(e);
    }
    // The provided package is probably a git url or path to a folder
    const wantedDep: nodeApi.WantedDependency = {
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
    const manifest = val.manifest as unknown as DependencyManifest;
    return {
      packageName: manifest.name,
      version: val.normalizedBareSpecifier,
      isSemver: false,
      resolvedVia: val.resolvedVia,
      manifest,
    };
  }
}

/**
 * Sort the engine's `depsRequiringBuild` for a stable lockfile block, or
 * return undefined when the install did not compute the list at all —
 * it was served from the frozen-lockfile path, or the engine predates
 * `returnListOfDepsRequiringBuild`. Undefined is not an empty list: the
 * install has no answer, so the recorded one has to stand.
 */
export function sortDepsRequiringBuild(depsRequiringBuild: string[] | undefined): string[] | undefined {
  return depsRequiringBuild == null ? undefined : [...depsRequiringBuild].sort();
}

/**
 * The `bit:` attributes to re-assert after an install, or undefined when
 * there is nothing to write. See {@link sortDepsRequiringBuild} for why
 * an uncomputed list leaves the recorded one untouched.
 */
export function mergeBitLockfileAttrs(
  preInstallAttrs: Partial<BitLockfileAttributes> | undefined,
  sortedDepsRequiringBuild: string[] | undefined
): Partial<BitLockfileAttributes> | undefined {
  if (sortedDepsRequiringBuild == null) return preInstallAttrs;
  return { ...preInstallAttrs, depsRequiringBuild: sortedDepsRequiringBuild };
}

/**
 * Read the `bit:` extension block of the workspace's wanted lockfile,
 * or undefined when there is no lockfile or no block.
 */
async function readBitLockfileAttrs(rootDir: string): Promise<Partial<BitLockfileAttributes> | undefined> {
  try {
    const lockfile = await nodeApi.readLockfile<BitLockfileFile>({ dir: rootDir });
    return lockfile?.bit;
  } catch {
    // A malformed lockfile fails the install itself later with a proper
    // error; there is nothing to preserve here.
    return undefined;
  }
}

/**
 * Re-assert Bit's `bit:` extension block on the wanted lockfile after
 * an engine install rewrote it. Merges over whatever the file has, so
 * an attribute captured before the install (e.g. `restoredFromModel`)
 * survives the rewrite.
 */
async function addBitAttributesToLockfile(rootDir: string, attrs: Partial<BitLockfileAttributes>) {
  const lockfile = await nodeApi.readLockfile<BitLockfileFile>({ dir: rootDir });
  if (lockfile == null) return;
  const merged = { ...lockfile.bit, ...attrs };
  if (isEqual(lockfile.bit, merged)) return;
  lockfile.bit = merged as BitLockfileAttributes;
  await nodeApi.writeLockfile({ dir: rootDir, lockfile });
}

/**
 * A `pnpm-lock.yaml` as the engine reads and writes it, plus the `bit:`
 * block Bit records beside pnpm's own keys. The engine preserves top-level
 * keys it does not define, so reading, editing that block, and writing the
 * file back leaves everything else untouched.
 */
export interface BitLockfileFile extends LockfileFile {
  bit?: BitLockfileAttributes;
}

export interface BitLockfileAttributes {
  depsRequiringBuild: string[];
  restoredFromModel?: boolean;
}
