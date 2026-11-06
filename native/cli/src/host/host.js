'use strict';
if (process.platform === 'darwin' && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
if (!process.env.BIT_NO_COMPILE_CACHE) {
  try { require('module').enableCompileCache(); } catch {}
}

// The JavaScript host of the Rust `bit` CLI (native/cli/src/host.rs). It serves the behavior
// that components and aspects implement in JavaScript to commands that otherwise run in Rust,
// using only modules the published `@teambit/bit` package ships. The Rust CLI passes it to the
// Node.js CLI's own Node with `-e`. Changed in-memory sources are spooled only into Rust-owned temporary directories.
//
//   node <private host.cjs> <@teambit/bit dir> <Node.js CLI entry> <workspace root>
//
// One JSON request per stdin line, `{id, method, params}`; one JSON response per stdout line,
// `{id, result}` or `{id, error}`. Aspect output normally goes to stderr so stdout stays
// the protocol stream. `afterInstall` returns its stdout to Rust for the command's stdout.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const [bitDir, entry, root] = process.argv.slice(-3);
const cliArguments = JSON.parse(process.env.BIT_NATIVE_HOST_ARGUMENTS ?? '[]');
const readonlyStatus = ['status', 's', 'diff'].includes(cliArguments[0]);
const identityRenameCommand = ['rename', 'fork'].includes(cliArguments[0]) || (cliArguments[0] === 'scope' && ['rename', 'rename-owner', 'fork'].includes(cliArguments[1]));
const identityMutationCommand = identityRenameCommand || ['move', 'mv', 'deprecate', 'd', 'undeprecate', 'remove', 'rm', 'delete', 'recover'].includes(cliArguments[0]);
const snapshotCommandName = cliArguments[0] === 't' ? 'tag' : cliArguments[0];
let snapshotCommand = ['snap', 'tag'].includes(snapshotCommandName) || (cliArguments[0] === 'merge' && cliArguments.includes('--resolve'));
const laneHistoryCommand = cliArguments[0] === 'lane' && ['checkout', 'revert'].includes(cliArguments[1]);
const checkoutCommand = laneHistoryCommand || (cliArguments[0] === 'merge' && cliArguments.includes('--abort')) || (cliArguments[0] === 'lane' && cliArguments[1] === 'merge-abort') || ['checkout', 'U', 'revert', 'switch'].includes(cliArguments[0]) || (cliArguments[0] === 'lane' && cliArguments[1] === 'import');
const laneSwitchCommand = laneHistoryCommand || cliArguments[0] === 'switch' || (cliArguments[0] === 'lane' && cliArguments[1] === 'import');
const laneMergeCommand = cliArguments[0] === 'lane' && cliArguments[1] === 'merge';
const mergeCommand = (cliArguments[0] === 'merge' && !cliArguments.includes('--abort') && !cliArguments.includes('--resolve')) || (cliArguments[0] === 'lane' && cliArguments[1] === 'merge');
const exportCommand = ['export', 'e', 'resume-export'].includes(cliArguments[0]);
const bufferedCommand = snapshotCommand || checkoutCommand || mergeCommand || exportCommand || identityMutationCommand || ['stash', 'add', 'a'].includes(cliArguments[0]);
const bufferedOutputCommand = bufferedCommand || cliArguments[0] === 'import';
process.argv = [process.execPath, entry, ...cliArguments];
require(path.join(bitDir, 'dist', 'hook-require.js'));
const bitRequire = createRequire(path.join(bitDir, 'package.json'));
const respond = process.stdout.write.bind(process.stdout);
let capturedStdout = null;
const trackingDocumentation = new Map();
process.stdout.write = (chunk, encoding, callback) => {
  if (capturedStdout) {
    capturedStdout.push(Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : undefined) : chunk);
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  }
  return process.stderr.write(chunk, encoding, callback);
};

const BIT_ASPECT_ID = 'teambit.harmony/bit';
let harmony;

prepareProcess();
serve();

/** What `run-bit.ts` and `bootstrap()` set up before any aspect loads, minus the terminal prompts. */
function prepareProcess() {
  bitRequire('graceful-fs').gracefulify(fs);
  // Module side effects: the deprecation-warning filter and the unhandled-rejection handler.
  require(path.join(bitDir, 'dist', 'bootstrap.js'));
  try {
    const bridge = bitRequire('@teambit/dependency-resolver/dist/hoisted-resolution-bridge.js');
    bridge.ensureSelfInstallationBridge();
    if (bridge.isGlobalVirtualStoreLayout(root)) bridge.ensureHoistedDependencyResolution(root);
  } catch {
    // Nothing to bridge.
  }
}

function serve() {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();
  lines.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(() => handle(line));
  });
  lines.on('close', () => {
    queue.then(() => process.exit(0));
  });
}

async function handle(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    respond(`${JSON.stringify({ id: null, error: `malformed request: ${error.message}` })}\n`);
    return;
  }
  const handler = handlers[request.method];
  if (!handler) {
    respond(`${JSON.stringify({ id: request.id, error: `unknown host method "${request.method}"` })}\n`);
    return;
  }
  try {
    if (request.method === 'afterInstall' || request.method === 'inventoryResolve' || request.method === 'logFileLoad' || readonlyStatus || bufferedOutputCommand) capturedStdout = [];
    const result = await handler(request.params ?? {});
    const output = capturedStdout?.join('');
    capturedStdout = null;
    const value = ['afterInstall', 'statusLoadCallbacks', 'statusIssueCallbacks', 'snapshotPreSnap', 'snapshotEditor', 'snapshotBuild', 'registryPublished', 'snapshotPackageManifests'].includes(request.method) ? { value: result ?? null, stdout: output } : result ?? null;
    respond(`${JSON.stringify({ id: request.id, result: value, stdout: ['afterInstall', 'statusLoadCallbacks', 'statusIssueCallbacks', 'snapshotPreSnap', 'snapshotEditor', 'snapshotBuild', 'registryPublished', 'snapshotPackageManifests'].includes(request.method) ? undefined : output })}\n`);
  } catch (error) {
    const output = capturedStdout?.join('');
    if (output && !bufferedOutputCommand) process.stderr.write(output);
    capturedStdout = null;
    respond(`${JSON.stringify({ id: request.id, error:error?.message??String(error), stdout:bufferedOutputCommand?output:undefined })}\n`);
  }
}

const handlers = {
  inventoryResolve,
  installCanonicalSupport,
  prepareNativeBuildScriptsPath,
  installCanonicalNeeded,
  installCanonical,
  installCanonicalResume,
  installCanonicalEnginePrepare,
  installImportWriter,
  installCanonicalFinalize,
  mergeLoadApps,
  catSupport,
  catMetadata,
  catSemanticDocsSupport,
  catSemanticDocs,
  logFileLoad,
  identityScopeDefault: async ({ scope }) => {
    const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
    workspace.getWorkspaceConfig().setExtension('teambit.workspace/workspace', { defaultScope: scope }, { mergeIntoExisting: true, ignoreVersion: true });
    workspace.config.defaultScope = scope;
    return true;
  },
  renameTooling,
  renameAst,
  renameSourceConfig,
  importWriteDependencyFacts,
  importGraphDependencyFacts,
  importClassLoad,
  importCompleteClassLoad,
  importWorkspaceOrder,
  forkRemoteHydrate,
  forkSourceFacts,
  forkEnvironment,
  forkAdded,
  forkTracked,
  forkPolicyFacts,
  forkPolicyApplied,
  forkAst,
  identityUseCached,
  identityListOrder,
  identityConsumerMode,
  identityLinkFacts,
  identityMaterialized,
  identityClearLoadCache: async () => {
    (await loadHarmony()).get('teambit.workspace/workspace').clearAllComponentsCache();
    return true;
  },
  trackingAspectComponents: async ({ components }) => {
    const envs = (await loadHarmony()).get('teambit.envs/envs');
    const aspects = [];
    for (const row of components) {
      const retained = identityLoadedComponent(row.identity) ?? statusComponents.find(component => component.id.toStringWithoutVersion() === row.identity);
      const component = retained ?? await hydrateStatusComponent(row);
      const descriptor = retained ? component.state.aspects.get('teambit.envs/envs')?.data : await envs.calcDescriptor(component, { skipWarnings: false });
      if (descriptor?.type === 'aspect') aspects.push(row.identity);
    }
    return aspects;
  },
  identityEnvironments,
  identityBootstrap: async () => {
    const loaded = await loadHarmony();
    // Scope rename subcommands are appended after CLIMain's loadAspects defaults.
    // Workspace.registerOnStart therefore skips their configured root aspects.
    if (cliArguments[0] === 'scope') return true;
    const workspace = loaded.get('teambit.workspace/workspace');
    const loader = loaded.get('teambit.harmony/aspect-loader');
    const ids = loader.getNotLoadedConfiguredExtensions();
    const previous = snapshotBootstrapProgress;
    if (cliArguments[0] === 'import') {
      captureBootstrapProgress(workspace);
      snapshotBootstrapProgress = !cliArguments.some(argument => ['--json', '-j'].includes(argument));
    }
    try {
      await loadWorkspaceAspects(ids);
      const components = await workspace.resolveMultipleComponentIds(ids);
      for (const id of components) workspace.clearComponentCache(id);
      return true;
    } finally {
      snapshotBootstrapProgress = previous;
    }
  },
  exportBootstrap,
  exportFileAction,
  exportInterrupt,
  exportPackages,
  exportFinish,
  hostInfo,
  switchCompile,
  switchConfiguredAspectClasses,
  switchInstallationComponents,
  switchInstallationLinked,
  historyInstallationComponents,
  switchInstallSubscribers,
  collationOrder: ({ ids }) => ids.map((_, index) => index).sort((left, right) => ids[left].localeCompare(ids[right])),
  envPolicy: ({ envId }) => envPolicy(envId),
  compilerFacts: ({ envId }) => compilerFacts(envId),
  providerFacts,
  environmentIds: async ({ ids }) => {
    const envs = (await loadHarmony()).get('teambit.envs/envs');
    return ids.map((id) => envs.getEnvDefinitionByStringId(id)).filter(Boolean).map((definition) => definition.id);
  },
  registeredEnvPolicy: ({ envId, aspectIds }) => registeredEnvPolicy(envId, aspectIds),
  devPatterns: ({ envId }) => devPatterns(envId),
  prepareInstall: ({ aspectIds }) => prepareInstall(aspectIds),
  envFallsBack: ({ envId }) => envFallsBack(envId),
  dependencyPolicies: ({ extensionIds, bootstrap, startupAspectIds, componentAspectIds, componentIdentities, componentUsedExtensions }) =>
    dependencyPolicies(extensionIds, bootstrap, startupAspectIds, componentAspectIds, componentIdentities, componentUsedExtensions),
  detectDependencies: ({ envId, files, componentDir, aspectIds }) =>
    detectDependencies(envId, files, componentDir, aspectIds),
  parseDependencies,
  statusCallbackInfo,
  statusDependencyCacheChecked: async () => Boolean((await loadHarmony()).get('teambit.workspace/workspace').consumer.componentLoader.invalidateDepsCachePromise),
  snapshotWorkspaceIssues: async () => (await loadHarmony()).get('teambit.workspace/workspace').getWorkspaceIssues({includeNonBlocking:false}).map((error)=>error.message),
  statusWorkspaceIssues: async () => (await loadHarmony()).get('teambit.workspace/workspace').getWorkspaceIssues().map((error) => error.message),
  statusLoadCallbacks,
  switchStatusBegin,
  switchStatusLoadOne,
  switchStatusStageRow,
  switchStatusResume,
  switchStatusFinish,
  trackingCachedDocs: ({ entries }) => {
    for (const entry of entries) trackingDocumentation.set(entry.path, entry.docs);
    return true;
  },
  trackingDocs: async ({ components, nativeCacheOnly = false }) => {
    const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
    const { SourceFile } = bitRequire('@teambit/component.sources');
    const { parser } = bitRequire('@teambit/semantics.doc-parser');
    const cache = workspace.consumer.componentFsCache;
    const writes = [];
    for (const component of components) {
      const directory = path.join(root, component.directory);
      for (const entry of component.files) {
        if (entry.test) continue;
        const filename = path.join(directory, entry.relativePath);
        const file = SourceFile.load(filename, directory, root);
        const docs = await parser(file, {
          getDocsFromCache: (key) => nativeCacheOnly ? undefined : cache.getDocsFromCache(key),
          saveDocsInCache: async (key, value) => { writes.push({path:key,docs:value}); },
        });
        trackingDocumentation.set(filename, docs);
      }
    }
    return writes;
  },
  trackingEnvConfig: async ({ env }) => {
    const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
    const id = await workspace.resolveComponentId(env);
    let configuredId;
    try {
      configuredId = await workspace.resolveEnvIdWithPotentialVersionForConfig(id);
    } catch {
      configuredId = id.toStringWithoutVersion();
    }
    return { resolvedId: id.toStringWithoutVersion(), configuredId };
  },
  trackingRemoteExistence: async ({ ids }) => {
    if (!ids.length) return [];
    try {
      const harmony = await loadHarmony();
      const { ComponentID } = bitRequire('@teambit/component-id');
      const candidates = ids.map((identity) => ComponentID.fromString(identity));
      // This published metadata helper owns the fetch-concurrency limit and the
      // exact five-second best-effort race; it never tracks or publishes anything.
      const existing = await harmony.get('teambit.component/tracker').getIdsExistingOnRemote(candidates);
      return existing.map((id) => id.toStringWithoutVersion());
    } catch {
      return [];
    }
  },
  trackingProjectBitmap: async ({ bitmap, components, retainLoaded = false }) => {
    const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
    const { BitMap: LegacyBitMap } = bitRequire('@teambit/legacy.bit-map');
    const { BitMap: WorkspaceBitMap } = bitRequire('@teambit/workspace/dist/bit-map.js');
    const projected = LegacyBitMap.loadFromContentWithoutLoadingFiles(
      Buffer.from(JSON.stringify(bitmap)), workspace.consumer.bitMap.mapPath, root,
      workspace.consumer.defaultScope
    );
    for (const componentMap of projected.components) {
      const receipt = components.find((component) => component.directory === componentMap.rootDir);
      if (!receipt || receipt.mainFile !== componentMap.mainFile) {
        throw new Error('native tracking component inventory mismatch');
      }
      const previous = laneSwitchCommand && retainLoaded
        ? workspace.consumer.bitMap.components.find(component => component.id.isEqual(componentMap.id)
          && component.rootDir === componentMap.rootDir && component.mainFile === componentMap.mainFile)
        : undefined;
      // The published import writer updates an existing ComponentMap in place.
      // Its pre-import bitmap scan may have stored the actual missing-files
      // error there; addComponent updates files and id without clearing it.
      const importPrevious = cliArguments[0] === 'import' && retainLoaded
        ? workspace.consumer.bitMap.components.find(component => component.id.fullName === componentMap.id.fullName
          && component.rootDir === componentMap.rootDir && component.mainFile === componentMap.mainFile)
        : undefined;
      if (importPrevious?.noFilesError) componentMap.noFilesError = importPrevious.noFilesError;
      const files = new Map(receipt.files.map(file => [file.relativePath, file]));
      // ComponentWriter changes selected entries in the live bitmap. An untouched
      // provider keeps its existing inventory order, even when disk scanning sorts it.
      const unchangedFiles = previous && previous.files.length === files.size
        && previous.files.every(file => files.has(file.relativePath));
      componentMap.files = (unchangedFiles ? previous.files.map(file => files.get(file.relativePath)) : receipt.files)
        .map(file => ({ ...file }));
      if(Object.hasOwn(receipt,'trackingVersion')) componentMap.id=componentMap.id.changeVersion(receipt.trackingVersion??undefined);
    }
    if (!retainLoaded) {
      workspace.clearAllComponentsCache();
      if (identityRenameCommand) identityLoadedComponents.clear();
    }
    workspace.consumer.bitMap = projected;
    workspace.bitMap = new WorkspaceBitMap(projected, workspace.consumer);
    return true;
  },
  stashAdded: async ({ ids }) => {
    const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
    await workspace._reloadConsumer();
    captureBootstrapProgress(workspace);
    const previousProgress = snapshotBootstrapProgress;
    snapshotBootstrapProgress = true;
    try {
      for (const identity of ids) {
        const id = await workspace.resolveComponentId(identity);
        // addNewComponents keeps the detached consumer's versionless identity before onAdd.
        // Reloading our already-published bitmap otherwise substitutes legacy "latest".
        const component = await workspace.get(id);
        component.state._consumer.version = undefined;
        await workspace.triggerOnComponentAdd(id, { compile: true });
      }
    } finally {
      snapshotBootstrapProgress = previousProgress;
    }
    return true;
  },
  statusIssueCallbacks,
  snapshotContinuation: async () => {
    snapshotCommand = true;
    snapshotContinuation = true;
    snapshotLoads = [];
    statusComponents = [];
    await (await loadHarmony()).get('teambit.workspace/workspace')._reloadConsumer();
    return true;
  },
  snapshotPreSnap,
  snapshotEditor,
  snapshotBuild,
  registryPublished,
  snapshotPackageManifests,
  snapshotLoadFacts:()=>{const facts=snapshotLoads;snapshotLoads=[];return facts;},
  appTypes,
  packageJsonProps: ({ envId }) => packageJsonProps(envId),
  transformPackageJson: ({ component, manifest }) => transformPackageJson(component, manifest),
  afterInstall,
};

/**
 * The `HostInfo` of native `bit install`: process facts the Rust CLI cannot compute itself,
 * merged with the terminal facts it passes in.
 */
function hostInfo(terminal) {
  requireHelpers();
  if (cliArguments[0] === 'switch' && terminal.canonicalOnly === true) {
    switchCanonicalOnlyHostInfo = true;
  }
  const { GLOBAL_CONFIG } = bitRequire('@teambit/legacy.constants');
  const { getBitVersion } = bitRequire('@teambit/bit.get-bit-version');
  const { findBvmDir } = bitRequire('@teambit/bvm.path/dist/path.js');
  // The published pnpm adapter prepares node-gyp only when it reaches a real
  // install. Host bootstrap must not write a shim for a graceful early failure.
  const nodeDir = path.dirname(process.execPath);
  if ((process.env.PATH ?? '').split(path.delimiter)[0] !== nodeDir) {
    process.env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
  return {
    ...(terminal.canonicalOnly === true
      ? { bitDir, coreAspects: [], corePackages: [], canonicalOnly: true }
      : coreAspectsInfo()),
    bvmDir: findBvmDir(entry) ?? null,
    nodePath: process.execPath,
    globalConfigDir: GLOBAL_CONFIG,
    bitVersion: getBitVersion(),
    columns: terminal.tty ? (process.stderr.columns ?? 80) : null,
    color: terminal.color,
    loader: terminal.loader,
    nonInteractive: terminal.nonInteractive,
    fileId: currentDateAndTimeToFileName(),
    path: process.env.PATH,
  };
}

/**
 * Modules the callbacks read without loading Harmony: the node env and the typescript aspect,
 * whose constants they call unbound, and the registered dependency detectors. A Node.js CLI
 * without them fails `hostInfo`, so the native command declines before it writes anything and
 * the Node.js CLI runs the install.
 */
const HELPERS = [
  '@teambit/node/dist/node.env.js',
  '@teambit/typescript/dist/typescript.main.runtime.js',
  '@teambit/dependency-resolver/dist/detector-hook.js',
];

function requireHelpers() {
  for (const helper of HELPERS) {
    try {
      bitRequire.resolve(helper);
    } catch {
      throw new Error(`the Node.js CLI does not ship ${helper}`);
    }
  }
}

/** `currentDateAndTimeToFileName()` of `@teambit/legacy.consumer`: local time, no padding. */
function currentDateAndTimeToFileName() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  return parts.join('-');
}

/**
 * Where the running bit's core aspects and core packages live, for the `link:` dependencies
 * native `bit install` adds to the root manifest. Mirrors the non-bvm branches of
 * `DependencyLinker`'s `linkCoreAspect` and `linkNonAspectCorePackages`.
 */
function coreAspectsInfo() {
  const { getAspectDir, getCoreAspectPackageName } = bitRequire('@teambit/aspect-loader/dist/core-aspects.js');
  const { getAllCoreAspectsIds } = require(path.join(bitDir, 'dist', 'manifests.js'));
  const coreAspects = [];
  for (const id of getAllCoreAspectsIds()) {
    if (id === BIT_ASPECT_ID) continue;
    const dir = aspectSource(id, getAspectDir, getCoreAspectPackageName);
    if (dir) coreAspects.push({ id, packageName: getCoreAspectPackageName(id), dir });
  }
  const corePackages = ['legacy', 'harmony'].map((name) => ({
    id: '',
    packageName: `@teambit/${name}`,
    dir: corePackageSource(name),
  }));
  return { bitDir, coreAspects, corePackages };
}

function aspectSource(id, getAspectDir, getCoreAspectPackageName) {
  const distDir = path.join(bitDir, 'dist', getCoreAspectPackageName(id).slice('@teambit/'.length));
  try {
    if (!fs.existsSync(distDir)) return getAspectDir(id);
    return path.resolve(path.join(require(distDir).path, '..', '..'));
  } catch {
    return undefined;
  }
}

function corePackageSource(name) {
  const packageName = `@teambit/${name}`;
  const distDir = path.join(bitDir, 'dist', name);
  if (fs.existsSync(distDir)) return path.resolve(path.join(require(distDir).path, '..', '..'));
  const resolved = bitRequire.resolve(packageName);
  if (resolved.includes(packageName)) return path.join(resolved, '../..');
  return path.join(bitDir, '..', name);
}

async function envPolicy(envId) {
  if (envId === 'teambit.harmony/node') {
    // The node env's policy is constant: `getDependencies()` without loading the env.
    const { NodeEnv } = bitRequire('@teambit/node/dist/node.env.js');
    return NodeEnv.prototype.getDependencies.call(undefined);
  }
  const env = await loadEnv(envId);
  const policy = await env?.getDependencies?.();
  return policy ?? null;
}

async function compilerFacts(envId) {
  const env = await loadEnv(envId) ?? await loadEnv('teambit.harmony/node');
  const compiler = env?.getCompiler?.();
  return { hasCompiler: Boolean(compiler), distDir: compiler?.getDistDir?.() ?? 'dist' };
}

/** Run the same environment methods in their original order after the manifest read. */
async function providerFacts({ envId, needsEnvPolicy, needsIssues }) {
  if (typeof envId !== 'string' || typeof needsEnvPolicy !== 'boolean' || typeof needsIssues !== 'boolean') {
    throw new Error('invalid provider facts request');
  }
  const policy = needsEnvPolicy ? await envPolicy(envId) : null;
  const patterns = await devPatterns(envId);
  const compiler = needsIssues ? await compilerFacts(envId) : null;
  return { envPolicy: policy, devPatterns: patterns, compiler, loadFailures: recordedLoadFailures };
}

/**
 * The env's dev-file pattern methods, each `null` when the env does not implement it.
 * The node env implements none of them.
 */
async function devPatterns(envId) {
  if (envId === 'teambit.harmony/node') return { devPatterns: null, tests: null, docs: null, compositions: null };
  const env = await loadEnv(envId);
  if (!env) return null;
  const call = async (method) => (typeof env[method] === 'function' ? await env[method]() : null);
  return {
    devPatterns: await call('getDevPatterns'),
    tests: await call('getTestsDevPatterns'),
    docs: await call('getDocsDevPatterns'),
    compositions: await call('getCompositionsDevPatterns'),
  };
}

/**
 * Whether the requests run before the package manager of `bit install`: an env is then only
 * what `prepareInstall` registered, and an unregistered one is the default env, as
 * `EnvsMain.calculateEnv` resolves it (`skipWarnings` in the install context). `afterInstall`
 * ends it, as `reloadNonLoadedEnvs` follows the package manager.
 */
let beforePackageManager = false;

/**
 * Enter the requests before the package manager of `bit install`. The component loads they
 * depend on run on the first request that needs Harmony (`loadInstallComponents`), so an
 * install no env or aspect request reaches never loads Harmony.
 */
let laneInstallationPrepared = false;
async function prepareInstall(aspectIds) {
  if (laneSwitchCommand && laneInstallationPrepared) {
    laneInstallationPrepared = false;
    return null;
  }
  beforePackageManager = true;
  pendingInstallLoad = aspectIds ?? [];
  return null;
}

/** Whether `envId` is the default env: before the package manager, one not registered. */
async function envFallsBack(envId) {
  if (!beforePackageManager) return false;
  await loadInstallComponents();
  return !(await loadHarmony()).get('teambit.envs/envs').getEnvDefinitionByStringId(envId);
}

/** The workspace aspects `prepareInstall` was given, until `loadInstallComponents` ran. */
let pendingInstallLoad = null;

/**
 * The component loads `InstallMain.install` performs before the manifests: the workspace aspects
 * the CLI loads on start, then every workspace component as `getComponentsDirectory` loads them,
 * without loading the envs among them as aspects (`loadSeedersAsAspects: false`). The envs this
 * registers, and no other, serve the env requests until `afterInstall`.
 */
async function loadInstallComponents() {
  if (!pendingInstallLoad) return;
  const aspectIds = pendingInstallLoad;
  pendingInstallLoad = null;
  await loadWorkspaceAspects(aspectIds);
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  workspace.inInstallContext = true;
  switchInstallationClasses = await workspace.list(undefined, { loadSeedersAsAspects: false });
}

/**
 * The dependency policies aspects registered (`registerDependenciesPolicies`), as
 * `[[registrar, policy], ...]`, once the aspects the components configure are loaded.
 */
const importPrimedPolicies = new Set();
const snapshotPrimedAspects=new Set();
function snapshotFreshAspects(ids) {
  if(!bufferedCommand)return ids;
  return ids.filter((id)=>{const key=id.split('@')[0];if(snapshotPrimedAspects.has(key))return false;snapshotPrimedAspects.add(key);return true;});
}

const recordedLoadFailures = [];

async function runWithLoadTrace(entry, fn) {
  let traceModule;
  try {
    traceModule = bitRequire('@teambit/harmony.modules.load-trace');
  } catch {
    return fn();
  }
  if (typeof traceModule?.startOrJoinLoadTrace !== 'function' || typeof traceModule?.currentLoadTrace !== 'function') {
    return fn();
  }
  return traceModule.startOrJoinLoadTrace(entry, {}, async () => {
    try {
      return await fn();
    } finally {
      for (const failure of traceModule.currentLoadTrace()?.loadFailures ?? []) {
        if (!recordedLoadFailures.some((existing) => existing.failedId === failure.failedId && existing.phase === failure.phase)) {
          recordedLoadFailures.push(failure);
        }
      }
    }
  });
}

let snapshotBootstrapProgress = false;
async function dependencyPolicies(extensionIds, bootstrap, startupAspectIds = [], componentAspectIds = [], componentIdentities = [], componentUsedExtensions = []) {
  await loadInstallComponents();
  snapshotBootstrapProgress = bootstrap === true && (['tag', 'checkout', 'add', 'a'].includes(cliArguments[0]) || cliArguments[0] === 'merge');
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  if (cliArguments[0] === 'scope') {
    extensionIds = extensionIds.filter(id => !startupAspectIds.includes(id) || componentAspectIds.includes(id));
  }
  extensionIds=snapshotFreshAspects(extensionIds);
  if (cliArguments[0] === 'import' && importClassMode === 'graph') {
    // Graph seeds load serially. Root providers are already running; resolving an
    // unrelated root aspect here would eagerly load its component before this seed.
    const rootIds = new Set(startupAspectIds.map(id => id.split('@')[0]));
    const required = new Set([...componentAspectIds, ...componentIdentities].map(id => id.split('@')[0]));
    extensionIds = extensionIds.filter(id => !rootIds.has(id.split('@')[0]) || required.has(id.split('@')[0]));
  }
  if (cliArguments[0] === 'import') extensionIds = extensionIds.filter(id => !importPrimedPolicies.has(id));
  snapshotBootstrapProgress = bootstrap === true && (['tag', 'checkout', 'add', 'a'].includes(cliArguments[0]) || cliArguments[0] === 'merge');
  try {
    // MergeStatusProvider reads the selected components without loading their
    // configured aspects. MergingMain loads application aspects after the write.
    if(!beforePackageManager && !laneMergeCommand && extensionIds.length) {
      if (cliArguments[0] === 'switch' && startupAspectIds.length
          && (typeof workspace.resolveMultipleComponentIds !== 'function'
            || typeof workspace.clearComponentCache !== 'function')) {
        throw new Error('published switch aspect cache invalidation is unavailable');
      }
      const loadedAspects = await runWithLoadTrace('host.dependencyPolicies', () =>
        workspace.loadAspects(extensionIds, false, undefined,
          { ...workspaceAspectOptions(workspace), throwOnError: false, hideMissingModuleError: true })
      );
      if (cliArguments[0] === 'switch' && startupAspectIds.length) {
        const startup = new Set(startupAspectIds.map(id => id.split('@')[0]));
        const roots = loadedAspects.filter(id => startup.has(id.split('@')[0]));
        const resolved = await workspace.resolveMultipleComponentIds(roots);
        for (const id of resolved) workspace.clearComponentCache(id);
      }
      if (cliArguments[0] === 'import') extensionIds.forEach(id => importPrimedPolicies.add(id));
    }
    if (!workspace.inInstallContext && recordedLoadFailures.length && typeof workspace.registerAggregatedLoadFailure === 'function') {
      const noVersion = (id) => id.split('@')[0];
      for (const entry of componentUsedExtensions) {
        const componentIdStr = entry?.id;
        const usedIds = entry?.usedIds ?? [];
        if (!componentIdStr) continue;
        for (const failure of recordedLoadFailures) {
          if (noVersion(failure.failedId) === noVersion(componentIdStr)) continue;
          if (usedIds.some((usedId) => noVersion(usedId) === noVersion(failure.failedId))) {
            workspace.registerAggregatedLoadFailure(failure, componentIdStr);
          }
        }
      }
    }
  } finally {snapshotBootstrapProgress = false;}
  return loaded.get('teambit.dependencies/dependency-resolver').policiesRegistry.toArray();
}

function workspaceAspectOptions(workspace) {
  return readonlyStatus || bufferedCommand ? { runSubscribers: false, skipDeps: !workspace.config.autoLoadAspectsDeps } : {};
}

let snapshotLoads=[];
let snapshotContinuation=false;

function captureBootstrapProgress(workspace) {
  const logger = workspace.componentLoader.logger;
  if (logger.__nativeCaptured) return;
  logger.__nativeCaptured = true;
  logger.__nativeSetStatusLine = logger.setStatusLine;
  let loadingDepth=0;
  if(bufferedCommand) {
    const getMany=workspace.componentLoader.getMany;
    workspace.componentLoader.getMany=async function(...args) {
      loadingDepth++;
      try {return await getMany.apply(this,args);} finally {loadingDepth--;}
    };
  }
  logger.setStatusLine = (message) => {
    const count=/^loading (\d+) component\(s\)$/.exec(message);
    if(snapshotCommand && count && loadingDepth===1) snapshotLoads.push(Number(count[1]));
    if (process.env.BIT_NATIVE_HOST_PROGRESS === '1' || (snapshotBootstrapProgress && process.env.CI === undefined && count)) process.stdout.write(`- ${message}\n`);
  };
}

/**
 * The import specifiers custom detectors find in `files`: the env's `getDepDetectors()`, then
 * the detectors aspects registered (`registerDetector`); `null` when there are none. `aspectIds`
 * are the workspace aspects the CLI loads on start (`getNotLoadedConfiguredExtensions`), which
 * `loadBit` does not.
 */
async function detectDependencies(envId, files, componentDir, aspectIds) {
  await loadInstallComponents();
  await loadWorkspaceAspects(aspectIds);
  const env = await loadEnv(envId);
  return detectWithCustomDetectors(env?.getDepDetectors?.(), files, componentDir);
}

/**
 * `getEnvPolicyFromEnvId` of a component that is not known to be an env: `getDependencies()`
 * when the envs aspect already registered it, once the workspace aspects are loaded. Unlike
 * `envPolicy`, the component is never loaded as an aspect.
 */
async function registeredEnvPolicy(envId, aspectIds) {
  await loadInstallComponents();
  await loadWorkspaceAspects(aspectIds);
  const definition = (await loadHarmony()).get('teambit.envs/envs').getEnvDefinitionByStringId(envId);
  const policy = await definition?.env?.getDependencies?.();
  return policy ?? null;
}

let workspaceAspectsLoaded = false;
let switchCanonicalOnlyHostInfo = false;

/** The workspace aspects the CLI loads on start (`getNotLoadedConfiguredExtensions`), once. */
async function loadWorkspaceAspects(aspectIds) {
  if (cliArguments[0] === 'scope' || laneMergeCommand) return;
  if (workspaceAspectsLoaded || !aspectIds?.length) return;
  workspaceAspectsLoaded = true;
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  aspectIds=snapshotFreshAspects(aspectIds);
  if (!aspectIds.length) return;
  if (cliArguments[0] === 'switch'
      && (typeof workspace.resolveMultipleComponentIds !== 'function'
        || typeof workspace.clearComponentCache !== 'function')) {
    throw new Error('published switch aspect cache invalidation is unavailable');
  }
  const aspects = await workspace.loadAspects(aspectIds, false, undefined,
    { ...workspaceAspectOptions(workspace), throwOnError: false, hideMissingModuleError: true });
  if (cliArguments[0] === 'switch') {
    const componentIds = await workspace.resolveMultipleComponentIds(aspects);
    componentIds.forEach(id => workspace.clearComponentCache(id));
  }
}

/** MergingMain.mergeSnaps loads application aspects after writing and before install. */
async function mergeLoadApps({ componentIds }) {
  const loaded = await loadHarmony();
  const application = loaded.get('teambit.harmony/application');
  if (typeof application?.loadAllAppsAsAspects !== 'function') throw new Error('published application loader unavailable');
  const workspace = loaded.get('teambit.workspace/workspace');
  const { ComponentID } = bitRequire('@teambit/component-id');
  workspace.clearComponentsCache(componentIds.map(id => ComponentID.fromString(id)));
  // Preserve the real workspace loader's status callbacks through this exact
  // published app-loading step, including its ordinary-terminal loading line.
  captureBootstrapProgress(workspace);
  const previousProgress = snapshotBootstrapProgress;
  snapshotBootstrapProgress = true;
  try {
    await application.loadAllAppsAsAspects();
    return true;
  } finally {
    snapshotBootstrapProgress = previousProgress;
  }
}

/**
 * The detection precinct's `getDetector` performs before the built-in detectives: per file, the
 * first env detector (`getDepDetectors()`) supporting it, else the first detector aspects
 * registered (`registerDetector`) when one of them is not replicated by the native scanner. Files
 * no custom detector claims are left out: the native scanner detects them. `directory` is the
 * component dir `filing-cabinet` passes a `dependencyLookup`. `null` without any custom detector.
 * Each file maps to `{ dependencies, typescript, lookups? }`: what the detector returned, whether
 * a registered detector claimed it (resolved through `lookupTypeScript`), and what a detector's
 * `dependencyLookup` returned per specifier (an absolute path, or `null`).
 */
async function detectWithCustomDetectors(envDetectors, files, directory) {
  const { DetectorHook } = bitRequire('@teambit/dependency-resolver/dist/detector-hook.js');
  const fromEnv = envDetectors ?? [];
  const registered = DetectorHook.hooks.some((hook) => !isNativelyReplicated(hook));
  if (!fromEnv.length && !registered) return null;
  const hook = new DetectorHook();
  const result = {};
  for (const filename of files) {
    const ext = path.extname(filename);
    const context = { ext, filename };
    // env.jsonc keeps its native handling, as the canonical env.jsonc detector does.
    const fromHook = registered && !filename.endsWith('env.jsonc') ? hook.getDetector(ext, filename) : undefined;
    const detector = fromEnv.find((candidate) => candidate.isSupported(context)) ?? fromHook;
    if (!detector) continue;
    let content;
    try {
      content = fs.readFileSync(filename, 'utf8');
    } catch {
      continue;
    }
    const lookup = dependencyLookup(fromEnv, fromHook, context);
    const detection = { dependencies: [], typescript: Boolean(fromHook), sourceHash: require('crypto').createHash('sha1').update(content).digest('hex') };
    try {
      const raw = await detectFile(detector, content);
      detection.dependencies = Array.isArray(raw) ? raw : Object.keys(raw);
      if (lookup) detection.lookups = lookUp(lookup, raw, { filename, directory, envDetectors: fromEnv });
    } catch {
      // `dependency-tree` records a parse or resolve error for the file: it yields nothing.
      detection.dependencies = [];
    }
    result[filename] = detection;
  }
  return result;
}

/** The detectors Bit's own aspects register, which the native scanner replicates. */
const NATIVE_DETECTORS = new Set(['EnvJsoncDetector', 'MDXDependencyDetector']);

/**
 * A registered detector the native scanner replicates: an instance of the env.jsonc or the MDX
 * detector class itself (not a subclass), whose support predicate is not overridden on the instance.
 */
function isNativelyReplicated(hook) {
  const prototype = Object.getPrototypeOf(hook);
  return (
    NATIVE_DETECTORS.has(prototype?.constructor?.name) &&
    Object.getPrototypeOf(prototype) === Object.prototype &&
    !Object.hasOwn(hook, 'isSupported')
  );
}

/**
 * `filing-cabinet`'s resolver choice: the lookup of the registered detector supporting the file,
 * overridden by the last env detector supporting it that has one. Called unbound, as there.
 */
function dependencyLookup(fromEnv, fromHook, context) {
  let lookup = fromHook?.dependencyLookup;
  for (const detector of fromEnv) {
    if (detector.isSupported(context) && detector.dependencyLookup) lookup = detector.dependencyLookup;
  }
  return lookup;
}

/** The `cabinet()` options `dependency-tree` builds, without the parser state a custom detector never sets. */
function lookUp(lookup, raw, options) {
  const { isBuiltin } = require('module');
  const lookups = {};
  const dependencies = Array.isArray(raw) ? raw : Object.keys(raw);
  for (const dependency of dependencies) {
    if (dependency in lookups || isBuiltin(dependency) || /^https?:\/\//.test(dependency)) continue;
    const params = { ...options, dependency, config: null, webpackConfig: null };
    // used for vue
    if (!Array.isArray(raw) && raw[dependency]?.isScript !== undefined) params.isScript = raw[dependency].isScript;
    const resolved = lookup(params);
    lookups[dependency] = typeof resolved === 'string' && resolved ? path.resolve(resolved) : null;
  }
  return lookups;
}

/** `getDepsFromFile` on a custom detector: `@bit-no-check` files yield nothing, other values are dropped. */
async function detectFile(detector, content) {
  if (content.startsWith('// @bit-no-check') || content.startsWith('/* @bit-no-check')) return [];
  const deps = await detector.detect(content);
  if (Array.isArray(deps)) return deps.filter((dep) => typeof dep === 'string');
  return deps && typeof deps === 'object' ? deps : [];
}

async function appTypes() {
  return (await loadHarmony()).get('teambit.harmony/application').getAppPatterns();
}

/** The env's `getPackageJsonProps()` and whether it implements `modifyPackageJson()`. */
async function packageJsonProps(envId) {
  if (envId === 'teambit.harmony/node') {
    // The node env's props are the typescript aspect's constant CJS props.
    const { TypescriptMain } = bitRequire('@teambit/typescript/dist/typescript.main.runtime.js');
    return { props: TypescriptMain.prototype.getCjsPackageJsonProps.call(undefined), modifiesPackageJson: false };
  }
  const env = await loadEnv(envId);
  return {
    props: env?.getPackageJsonProps?.() ?? {},
    modifiesPackageJson: typeof env?.modifyPackageJson === 'function',
  };
}

async function transformPackageJson(componentId, manifest) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  const component = identityLoadedComponent(componentId) || ((identityMutationCommand || ['add','a'].includes(cliArguments[0])) && statusComponents.find((component)=>component.id.toStringWithoutVersion()===componentId)) || await workspace.get(await workspace.resolveComponentId(componentId));
  const env = loaded.get('teambit.envs/envs').getOrCalculateEnv(component).env;
  return env.modifyPackageJson(component, manifest);
}

async function loadEnv(envId) {
  await loadInstallComponents();
  const loaded = await loadHarmony();
  const envs = loaded.get('teambit.envs/envs');
  let definition = envs.getEnvDefinitionByStringId(envId);
  if (!definition && beforePackageManager) return envs.getDefaultEnv().env;
  if (!definition) {
    const workspace = loaded.get('teambit.workspace/workspace');
    await workspace.loadAspects([envId], false, undefined, { ...workspaceAspectOptions(workspace), throwOnError: false, hideMissingModuleError: true });
    definition = envs.getEnvDefinitionByStringId(envId);
  }
  return definition?.env;
}

/** Compile and write config files with the canonical JavaScript aspects. */
async function afterInstall(request) {
  const loaded = await loadHarmony();
  // `PnpmPackageManager.install` turns the logger on after the package manager, so the
  // compile step reports through Bit's loader even when the command runs without one.
  bitRequire('@teambit/legacy.loader').loader.on();
  const workspace = loaded.get('teambit.workspace/workspace');
  const install = loaded.get('teambit.workspace/install');
  const envs = loaded.get('teambit.envs/envs');
  beforePackageManager = false;
  pendingInstallLoad = null;
  workspace.inInstallContext = true;
  workspace.inInstallAfterPmContext = true;
  const previousProgress = snapshotBootstrapProgress;
  if (laneSwitchCommand || cliArguments[0] === 'fork' || (cliArguments[0] === 'scope' && cliArguments[1] === 'rename')) snapshotBootstrapProgress = true;
  try {
    if (!laneSwitchCommand) await workspace.clearCache();
    await install.reloadMovedEnvs();
    await install.reloadNonLoadedEnvs();
    if (laneSwitchCommand && install.shouldClearCacheOnInstall()) await workspace.clearCache();
    let compiled = 0;
    let distDirs = null;
    if (request.compile) {
      const { CompilationInitiator } = bitRequire('@teambit/compiler');
      const logger = loaded.get('teambit.harmony/logger').createLogger('teambit.workspace/install');
      const started = process.hrtime();
      logger.setStatusLine('compiling components');
      const results = await loaded
        .get('teambit.compilation/compiler')
        .compileOnWorkspace([], { initiator: CompilationInitiator.Install });
      compiled = results.length;
      distDirs = await cleanDistDirs(loaded, results);
      logger.consoleSuccess('compiling components', started);
    }
    const configFiles = request.writeConfigFiles ? await writeConfigFiles(loaded) : [];
    // what native `bit install` snapshots: `null` unless both steps left a complete record.
    const outputs = distDirs && configFiles ? [...distDirs, ...configFiles] : null;
    return { oldNonLoadedEnvs: envs.getFailedToLoadEnvs(), compiled, outputs };
  } finally {
    snapshotBootstrapProgress = previousProgress;
    workspace.inInstallContext = false;
  }
}

/**
 * `tryWriteConfigFiles(false)` of the install aspect, returning the config files it wrote, which
 * native `bit install` snapshots to skip the next write when nothing changed: `[]` when writing is
 * disabled, `null` when the write failed or left files bit did not generate.
 */
async function writeConfigFiles(loaded) {
  const wsConfigFiles = loaded.get('teambit.workspace/workspace-config-files');
  if (!wsConfigFiles.isWorkspaceConfigWriteEnabled()) return [];
  const logger = loaded.get('teambit.harmony/logger').createLogger('teambit.workspace/install');
  const { err, writeResults } = await wsConfigFiles.writeConfigFiles({
    clean: true,
    silent: true,
    dedupe: true,
    throw: false,
  });
  if (err) {
    logger.consoleFailure(
      `failed generating workspace config files, please run "bit ws-config write" manually. error: ${err.message}`
    );
    return null;
  }
  const skippedPaths = writeResults?.skippedPaths ?? [];
  const skippedWarning =
    typeof wsConfigFiles.formatSkippedFilesWarning === 'function'
      ? wsConfigFiles.formatSkippedFilesWarning(skippedPaths)
      : skippedPaths.length
        ? `some workspace config files were skipped: ${skippedPaths.join(', ')}`
        : '';
  // the formatted section already starts with the shared warning symbol, so no need for consoleWarning here.
  if (skippedWarning) {
    logger.console(`\n${skippedWarning}`);
    return null;
  }
  return (writeResults?.writersResult ?? []).flatMap((writerResult) => [
    ...writerResult.realConfigFiles.map((file) => file.writtenRealConfigFile.filePath),
    ...writerResult.extendingConfigFiles.flatMap((file) => file.extendingConfigFile.filePaths),
  ]);
}

/**
 * The absolute dist directories of a compilation without errors, which native `bit install`
 * snapshots to skip the next `afterInstall` when nothing changed. `null` when any component failed.
 */
async function cleanDistDirs(loaded, results) {
  if (results.some((result) => result.errors.length)) return null;
  const workspace = loaded.get('teambit.workspace/workspace');
  const distDirs = [];
  for (const result of results.filter((built) => !built.skipped)) {
    const dirs = result.distDirs ?? (await componentDistDirs(loaded, result.component));
    if (!dirs) return null;
    distDirs.push(...dirs.map((dir) => path.resolve(workspace.path, dir)));
  }
  return distDirs;
}

/**
 * `ComponentCompiler.distDirs()` of the compiler aspect, for a compiler that does not report them
 * on its results: the package directory's dist, then the injected or root-component copies.
 */
async function componentDistDirs(loaded, componentId) {
  const workspace = loaded.get('teambit.workspace/workspace');
  const component = await workspace.get(await workspace.resolveComponentId(componentId));
  const compiler = loaded.get('teambit.envs/envs').getEnv(component).env.getCompiler?.();
  if (!compiler) return null;
  const compilerRequire = createRequire(bitRequire.resolve('@teambit/compiler'));
  const { componentIdToPackageName } = compilerRequire('@teambit/pkg.modules.component-package-name');
  const { readRootComponentsDir } = compilerRequire('@teambit/workspace.root-components');
  const { DEFAULT_DIST_DIRNAME } = compilerRequire('@teambit/legacy.constants');
  const packageName = componentIdToPackageName(component.state._consumer);
  let injectedDirs = await workspace.getInjectedDirs(component);
  if (!injectedDirs.length) {
    const rootDirs = await readRootComponentsDir(workspace.rootComponentsPath);
    injectedDirs = rootDirs.map((rootDir) => path.relative(workspace.path, path.join(rootDir, packageName)));
  }
  const distDirName = compiler.getDistDir?.() || DEFAULT_DIST_DIRNAME;
  return [path.join('node_modules', packageName), ...injectedDirs].map((dir) => path.join(dir, distDirName));
}

function loadHarmony() {
  if (!harmony) {
    const { loadBit } = require(path.join(bitDir, 'dist', 'load-bit.js'));
    harmony = loadBit(root);
  }
  return harmony;
}

/** Released language detectives only; sources and operation planning remain in Rust. */
async function parseDependencies({ files, exclude = [] }) {
  const precinct = bitRequire('@teambit/dependencies/dist/files-dependency-builder/precinct/index.js').default;
  const result = {};
  for (const filename of files) {
    if (exclude.includes(filename)) continue;
    const bytes = fs.readFileSync(filename);
    const receipt = { dependencies: [], typescript: /\.(?:ts|tsx|mts|cts)$/.test(filename), sourceHash: require('crypto').createHash('sha1').update(bytes).digest('hex') };
    try {
      const dependencies = await precinct.paperwork(filename, { includeCore: false });
      receipt.dependencies = Array.isArray(dependencies) ? dependencies : Object.keys(dependencies);
    } catch (error) {
      receipt.error = { code: 'PARSING_ERROR', message: error.message, lineNumber: error.lineNumber, column: error.column };
    }
    if (!bytes.equals(fs.readFileSync(filename))) throw new Error('parser source changed');
    result[filename] = receipt;
  }
  return result;
}

let statusComponents = [];

async function statusCallbackInfo({ coreIds, aspectIds }) {
  await loadWorkspaceAspects(aspectIds);
  const loaded = await loadHarmony();
  const custom = (id) => !coreIds.includes(id.split('@')[0]);
  return {
    onLoad: Boolean(importClassMode) || loaded.get('teambit.workspace/workspace').onComponentLoadSlot.toArray().some(([id]) => custom(id)),
    issues: loaded.get('teambit.component/issues').addComponentsIssuesSlot.toArray().some(([id]) => custom(id)),
    classLoad: cliArguments[0] === 'switch' && (switchCanonicalOnlyHostInfo || aspectIds.length > 0),
  };
}

// Native issue JSON contains the public ComponentID class shape, whereas legacy
// issue deserializers accept ComponentID.serialize() objects.
function serializedIssue(issue) {
  const convert = (value) => {
    if (Array.isArray(value)) return value.map(convert);
    if (!value || typeof value !== 'object') return value;
    if (value._legacy) return { ...value._legacy, ...(value._scope ? { scope: value._scope } : {}) };
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, convert(entry)]));
  };
  return { type: issue.type, data: JSON.stringify(convert(typeof issue.data === 'string' ? JSON.parse(issue.data) : issue.data)) };
}

async function hydrateStatusComponent(row, sourceConsumer) {
  const { ComponentID } = bitRequire('@teambit/component-id');
  const { ConsumerComponent, Dependency } = bitRequire('@teambit/legacy.consumer-component');
  const { SourceFile } = bitRequire('@teambit/component.sources');
  const { State, Config, ComponentFS, TagMap, Tag, Snap } = bitRequire('@teambit/component');
  const { IssuesList } = bitRequire('@teambit/component-issues');
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const directory = path.join(root, row.directory);
  const parsedId = ComponentID.fromString(row.identity + (row.version ? `@${row.version}` : ''));
  let id = row.scoped === false ? ComponentID.fromObject({name:parsedId.fullName,version:parsedId.version},parsedId.scope) : parsedId;
  if(Object.hasOwn(row,'trackingVersion')) id=id.changeVersion(row.trackingVersion??undefined);
  const convert = (extension) => ({ ...extension, extensionId: extension.extensionId ? ComponentID.fromObject(extension.extensionId) : undefined });
  const consumer = sourceConsumer ?? await ConsumerComponent.fromObject({
    ...row.current, name: id.fullName, scope: row.scoped === false ? undefined : id.scope, version: Object.hasOwn(row,'trackingVersion') ? row.trackingVersion??undefined : row.version || undefined, schema: '2.0.0',
    dependencies: (row.current.dependencies ?? []).map((dependency) => Dependency.deserialize(dependency)),
    devDependencies: (row.current.devDependencies ?? []).map((dependency) => Dependency.deserialize(dependency)),
    peerDependencies: (row.peerDependencies ?? []).map((dependency) => Dependency.deserialize(dependency)),
    extensions: row.current.extensions.map(convert),
    files: row.files.map((file) => SourceFile.load(path.join(directory, file), directory, root)),
  });
  if (!sourceConsumer) {
  if (cliArguments[0] === 'stash' && row.scope?.currentVersion) {
    for (const field of ['log', 'docs', 'buildStatus', 'packageJsonChangedProps']) {
      if (Object.hasOwn(row.scope.currentVersion, field)) consumer[field] = row.scope.currentVersion[field];
    }
    const storedBuilder = row.scope.currentVersion.extensions?.find(extension => extension.name === 'teambit.pipelines/builder');
    const builder = consumer.extensions.findCoreExtension('teambit.pipelines/builder');
    if (storedBuilder && builder) builder.data = structuredClone(storedBuilder.data);
  }
  if ((identityMutationCommand || checkoutCommand || ['add','a'].includes(cliArguments[0])) && trackingDocumentation.size) {
    consumer.docs = row.files.flatMap((file) => trackingDocumentation.get(path.join(directory, file)) ?? []);
  }
  consumer.defaultScope = id.scope;
  consumer.writtenPath = directory;
  consumer.issues = IssuesList.deserialize((row.issues ?? []).filter((issue) => issue.type).map(serializedIssue));
  }
  const state = new State(new Config(consumer), await workspace.createAspectList(consumer.extensions), ComponentFS.fromVinyls(consumer.files), consumer.dependencies, consumer);
  const { WorkspaceComponent } = bitRequire('@teambit/workspace/dist/workspace-component/workspace-component.js');
  const headVersion = row.scope?.head;
  const log = headVersion?.[1]?.log;
  const head = headVersion ? Snap.fromObject({ hash: headVersion[0], timestamp: log.date, parents: headVersion[1].parents, author: { displayName: log.username ?? '', email: log.email ?? '' }, message: log.message }) : null;
  const tags = TagMap.fromArray(Object.entries(row.scope?.model?.versions ?? {}).map(([version, hash]) => Tag.fromObject({version, hash})));
  const component = new WorkspaceComponent(id, head, state, tags, workspace);
  component.__nativeRow = row;
  component.__nativeCurrent = row.current;
  component.__nativeSourceProofs = sourceProofs(consumer.files);
  component.__nativeOriginalFiles = consumer.files.map((file) => file.relative);
  component.__nativeOriginalDependencyIds = [...consumer.dependencies.get(), ...consumer.devDependencies.get(), ...consumer.peerDependencies.get()].map((dependency) => dependency.id.toString());
  return component;
}

async function statusLoadCallbacks({ components, directory, snapshot, checkout, configured, loadOrder }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  const envs = loaded.get('teambit.envs/envs');
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  if (snapshot) await loaded.get('teambit.harmony/application').loadAllAppsAsAspects();
  statusComponents = [];
  const loadOutput = [];
  let outputStart = capturedStdout?.length ?? 0;
  const importedClasses = await importHydrateClasses(components);
  const switchClasses = importedClasses ? undefined : await switchStatusHydrateClasses(components, workspace, checkout && configured, loadOrder, directory);
  if (importedClasses || switchClasses) {
    statusComponents = importedClasses ?? switchClasses;
  } else {
  const tracking=['add','a'].includes(cliArguments[0]);
  if(tracking && !snapshotContinuation) {
    for(const row of components) {
      if(checkout && row.dependencyCacheMiss && row.directory!=='.') await statusApplyLoadCallbacks(await hydrateStatusComponent(row),{workspace,envs,resolver});
    }
  }
  for (const row of components) {
    const retainedConsumer = identityConsumerOnly ? undefined : identityConsumers.get(row.identity);
    let component = await hydrateStatusComponent(row, retainedConsumer);
    const componentIndex = statusComponents.length;
    statusComponents.push(component);
    const trackedFork = await forkLoadTracked(component);
    if (trackedFork) {
      component = trackedFork;
      statusComponents[componentIndex] = component;
      continue;
    }
    // DependencyLoader's DevFiles adapter hydrates a separate Harmony class before
    // the actual workspace load. Workspace-root explicitly skips source detection.
    if (!snapshotContinuation) {
      if (!retainedConsumer && !tracking && (snapshot || (checkout && row.dependencyCacheMiss)) && row.directory !== '.') {
        const devComponent = await hydrateStatusComponent(row);
        await statusApplyLoadCallbacks(devComponent, { workspace, envs, resolver });
        if (identityMutationCommand) {
          component = await hydrateStatusComponent(row, devComponent.state._consumer);
          statusComponents[componentIndex] = component;
        }
      }
      if (identityConsumerOnly) {
        // Legacy ComponentLoader defaults loadExtensions:true and its subscriber
        // calls Workspace.get with this same Consumer and storeInCache:true.
        await statusApplyLoadCallbacks(component, { workspace, envs, resolver });
        workspace.componentLoader.saveInCache(component, { loadExtensions: true, executeLoadSlot: true });
        workspace.consumer.componentLoader.componentsCache.set(component.id.toString(), component.state._consumer);
        identityConsumers.set(row.identity, component.state._consumer);
      }
      else {
        await statusApplyLoadCallbacks(component, { workspace, envs, resolver });
        if (laneHistoryCommand || ['remove', 'rm', 'delete', 'merge'].includes(cliArguments[0])) {
          workspace.componentLoader.saveInCache(component, { loadExtensions: true, executeLoadSlot: true });
          workspace.consumer.componentLoader.componentsCache.set(component.id.toString(), component.state._consumer);
        }
        identityConsumers.delete(row.identity);
      }
    }
  }
  if (snapshot) loadOutput.push(capturedStdout?.slice(outputStart).join('') ?? '');
  outputStart = capturedStdout?.length ?? 0;
  // Canonical modification checks reload tagged consumers, retaining in-memory SourceFile mutations.
  for (const row of components.filter((row) => !checkout && (snapshot || row.version))) {
    const component = statusComponents.find((component) => component.id.toStringWithoutVersion() === row.identity);
    // DependencyLoader's DevFiles adapter hydrates a separate Harmony class before
    // the actual workspace load. Workspace-root explicitly skips source detection.
    if (snapshot && row.directory !== '.') await statusApplyLoadCallbacks(await hydrateStatusComponent(row), { workspace, envs, resolver });
    await statusApplyLoadCallbacks(component, { workspace, envs, resolver });
  }
  if (snapshot) loadOutput.push(capturedStdout?.slice(outputStart).join('') ?? '');
  }
  if (identityRenameCommand) {
    for (const component of statusComponents) identityLoadedComponents.set(component.id.toStringWithoutVersion(), component);
  }
  const results = components.map((row) => {
    const component = statusComponents.find((component) => component.id.toStringWithoutVersion() === row.identity);
    const consumer = component.state._consumer;
    const sources = statusSourceOverlays(component, directory, 'current');
    return { identity: row.identity, ...(snapshot ? {snapshotData: snapshotData(consumer), snapshotLoadOutput: loadOutput} : {}), current: statusMetadata(row.current, consumer), files: consumer.files.map(statusRelative), sourceOverlays: sources.overlays, sourceOverlayRoot: directory, issues: statusIssues(consumer.issues), readSet: sources.proofs, originalDependencyIdentities: component.__nativeOriginalDependencyIds, dependencyIdentities: [...consumer.dependencies.get(), ...consumer.devDependencies.get(), ...consumer.peerDependencies.get()].map((dependency) => dependency.id.toString()) };
  });
  return results;
}

function snapshotData(consumer) {
  return { rangeDependencies: consumer.getAllDependencies().map(dependency => dependency.serialize()), consumerMetadata: {
    log: consumer.log, docs: consumer.docs, buildStatus: consumer.buildStatus,
    packageJsonChangedProps: consumer.packageJsonChangedProps,
    ...(consumer.dependenciesGraph ? {dependenciesGraph: consumer.dependenciesGraph.serialize()} : {}),
  }, extensions: consumer.extensions.map((extension) => ({
    ...(extension.name ? { name: extension.name } : { extensionId: extension.extensionId.serialize() }),
    config: extension.rawConfig, data: extension.data,
  })) };
}

function statusRelative(file) { return file.relative.split(path.sep).join('/'); }

function statusSourceOverlays(component, directory, phase) {
  const overlays = {};
  const proofs = [...component.__nativeSourceProofs];
  for (const file of component.state._consumer.files) {
    const hash = require('crypto').createHash('sha256').update(file.contents).digest('hex');
    const original = component.__nativeSourceProofs.find((proof) => proof.path === file.path);
    if (original?.hash === hash && component.__nativeOriginalFiles.includes(file.relative)) continue;
    const key = require('crypto').createHash('sha256').update(component.id.toString() + ':' + file.relative).digest('hex');
    const filename = path.join(directory, phase + '-' + key);
    fs.writeFileSync(filename, file.contents, { flag: 'wx', mode: 0o600 });
    overlays[statusRelative(file)] = filename;
    proofs.push({ path: filename, hash });
  }
  return { overlays, proofs };
}

function statusMetadata(current, consumer) {
  return {
    ...current, mainFile: consumer.mainFile, bindingPrefix: consumer.bindingPrefix,
    dependencies: consumer.dependencies.get().map((dependency) => ({...dependency,id:dependency.id.serialize()})), devDependencies: consumer.devDependencies.get().map((dependency) => ({...dependency,id:dependency.id.serialize()})),
    packageDependencies: consumer.packageDependencies, devPackageDependencies: consumer.devPackageDependencies, peerPackageDependencies: consumer.peerPackageDependencies,
    overrides: consumer.overrides.componentOverridesData,
    extensions: consumer.extensions.map((extension) => ({
      ...(extension.name ? { name: extension.name } : { extensionId: extension.extensionId.serialize() }), config: extension.rawConfig,
    })),
  };
}

async function statusApplyLoadCallbacks(component, { workspace, envs, resolver }) {
    const policy = await resolver.mergeVariantPolicies(component.config.extensions, component.id, component.state._consumer.files);
    const dependencies = await resolver.extractDepsFromLegacy(component, policy);
    const envData = await envs.calcDescriptor(component, { skipWarnings: false });
    const resolvedEnvJsonc = await envs.calculateEnvManifest(component, component.state._consumer.files, component.state._consumer.dependencies.get());
    if (resolvedEnvJsonc) envData.resolvedEnvJsonc = resolvedEnvJsonc;
    await statusUpsert(component, 'teambit.envs/envs', envData);
    await statusUpsert(component, 'teambit.dependencies/dependency-resolver', {
      packageName: resolver.calcPackageName(component), dependencies: dependencies.serialize(), policy: policy.serialize(),
      componentRangePrefix: resolver.calcComponentRangePrefixByConsumerComponent(component.state._consumer),
    });
    for (const [id, callback] of workspace.onComponentLoadSlot.toArray()) {
      await statusUpsert(component, id, await callback(component, { loadExtensions: true, executeLoadSlot: true }));
    }

}

async function statusUpsert(component, id, data) {
  if (!data) return;
  const { ExtensionDataEntry } = bitRequire('@teambit/legacy.extension-data');
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const existing = component.state.config.extensions.findExtension(id);
  if (existing) Object.assign(existing.data, data);
  else component.state.config.extensions.push(new ExtensionDataEntry(undefined, undefined, id, undefined, data));
  component.state.aspects = await workspace.createAspectList(component.state.config.extensions);
}

function sourceProofs(files) {
  return files.map((file) => ({ path: file.path, hash: require('crypto').createHash('sha256').update(fs.readFileSync(file.path)).digest('hex') }));
}

async function statusIssueCallbacks({ rows, coreIds, ignored }) {
  if (!statusComponents.length) return rows;
  const components = snapshotCommand ? statusComponents.filter((component)=>rows.some((row)=>row.id===component.id.toStringWithoutVersion())) : statusComponents;
  const loaded = await loadHarmony();
  const { IssuesList, IssuesClasses } = bitRequire('@teambit/component-issues');
  for (const component of components) {
    const row = rows.find((row) => row.id === component.id.toStringWithoutVersion());
    const known = (row?.issues ?? []).filter((issue) => IssuesClasses[issue.type]);
    const existing = component.state.issues.getAllIssues();
    const extra = existing.filter((issue) => !IssuesClasses[issue.constructor.name]);
    const hydrated = IssuesList.deserialize(known.map(serializedIssue)).getAllIssues().map((issue) => {
      const original = existing.find((entry) => entry.constructor.name === issue.constructor.name);
      if (!original) return issue;
      original.data = issue.data;
      return original;
    });
    component.state._consumer.issues = new IssuesList([...hydrated, ...extra]);
  }
  const issues = loaded.get('teambit.component/issues');
  for (const [id, callback] of issues.addComponentsIssuesSlot.toArray()) {
    if (!coreIds.includes(id.split('@')[0])) await callback(components, ignored);
  }
  issues.removeIgnoredIssuesFromComponents(components);
  return components.map((component) => ({ id: component.id.toStringWithoutVersion(), issues: statusIssues(component.state.issues) }));
}

function statusIssues(issues) {
  return issues.getAllIssues().map((issue) => ({ ...issue.toObject(), dataAsString: issue.dataToString(), __callbackCLI: issue.outputForCLI() }));
}
