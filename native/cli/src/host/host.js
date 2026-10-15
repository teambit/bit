'use strict';
// The JavaScript host of the Rust `bit` CLI (native/cli/src/host.rs). It serves the behavior
// that components and aspects implement in JavaScript to commands that otherwise run in Rust,
// using only modules the published `@teambit/bit` package ships. The Rust CLI passes it to the
// Node.js CLI's own Node with `-e`, so nothing is written to disk.
//
//   node -e <this script> <@teambit/bit dir> <Node.js CLI entry> <workspace root>
//
// One JSON request per stdin line, `{id, method, params}`; one JSON response per stdout line,
// `{id, result}` or `{id, error}`. Aspect output normally goes to stderr so stdout stays
// the protocol stream. `afterInstall` returns its stdout to Rust for the command's stdout.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const [bitDir, entry, root] = process.argv.slice(-3);
const bitRequire = createRequire(path.join(bitDir, 'package.json'));
const respond = process.stdout.write.bind(process.stdout);
let capturedStdout = null;
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
    if (request.method === 'afterInstall') capturedStdout = [];
    const result = await handler(request.params ?? {});
    const output = capturedStdout?.join('');
    capturedStdout = null;
    const value = request.method === 'afterInstall' ? { value: result ?? null, stdout: output } : result ?? null;
    respond(`${JSON.stringify({ id: request.id, result: value })}\n`);
  } catch (error) {
    if (capturedStdout) process.stderr.write(capturedStdout.join(''));
    capturedStdout = null;
    respond(`${JSON.stringify({ id: request.id, error: error?.message ?? String(error) })}\n`);
  }
}

const handlers = {
  hostInfo,
  envPolicy: ({ envId }) => envPolicy(envId),
  registeredEnvPolicy: ({ envId, aspectIds }) => registeredEnvPolicy(envId, aspectIds),
  devPatterns: ({ envId }) => devPatterns(envId),
  dependencyPolicies: ({ extensionIds }) => dependencyPolicies(extensionIds),
  detectDependencies: ({ envId, files, componentDir, aspectIds }) =>
    detectDependencies(envId, files, componentDir, aspectIds),
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
  const { GLOBAL_CONFIG } = bitRequire('@teambit/legacy.constants');
  const { getBitVersion } = bitRequire('@teambit/bit.get-bit-version');
  const { findBvmDir } = bitRequire('@teambit/bvm.path/dist/path.js');
  // Recent Bit releases shape PATH for lifecycle scripts with a pnpm helper.
  // Older releases do not ship it; their CLI wrapper already puts this Node on PATH.
  let buildScriptsPath;
  try {
    buildScriptsPath = bitRequire.resolve('@teambit/pnpm/dist/build-scripts-path.js');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  if (buildScriptsPath) bitRequire(buildScriptsPath).prepareBuildScriptsPath();
  const nodeDir = path.dirname(process.execPath);
  if ((process.env.PATH ?? '').split(path.delimiter)[0] !== nodeDir) {
    process.env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
  return {
    ...coreAspectsInfo(),
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
 * The dependency policies aspects registered (`registerDependenciesPolicies`), as
 * `[[registrar, policy], ...]`, once the aspects the components configure are loaded.
 */
async function dependencyPolicies(extensionIds) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  await workspace.loadAspects(extensionIds, false, undefined, { throwOnError: false, hideMissingModuleError: true });
  return loaded.get('teambit.dependencies/dependency-resolver').policiesRegistry.toArray();
}

/**
 * The import specifiers custom detectors find in `files`: the env's `getDepDetectors()`, then
 * the detectors aspects registered (`registerDetector`); `null` when there are none. `aspectIds`
 * are the workspace aspects the CLI loads on start (`getNotLoadedConfiguredExtensions`), which
 * `loadBit` does not.
 */
async function detectDependencies(envId, files, componentDir, aspectIds) {
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
  await loadWorkspaceAspects(aspectIds);
  const definition = (await loadHarmony()).get('teambit.envs/envs').getEnvDefinitionByStringId(envId);
  const policy = await definition?.env?.getDependencies?.();
  return policy ?? null;
}

let workspaceAspectsLoaded = false;

/** The workspace aspects the CLI loads on start (`getNotLoadedConfiguredExtensions`), once. */
async function loadWorkspaceAspects(aspectIds) {
  if (workspaceAspectsLoaded || !aspectIds?.length) return;
  workspaceAspectsLoaded = true;
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  await workspace.loadAspects(aspectIds, false, undefined, { throwOnError: false, hideMissingModuleError: true });
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
    const detection = { dependencies: [], typescript: Boolean(fromHook) };
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
  const component = await workspace.get(await workspace.resolveComponentId(componentId));
  const env = loaded.get('teambit.envs/envs').getOrCalculateEnv(component).env;
  return env.modifyPackageJson(component, manifest);
}

async function loadEnv(envId) {
  const loaded = await loadHarmony();
  const envs = loaded.get('teambit.envs/envs');
  let definition = envs.getEnvDefinitionByStringId(envId);
  if (!definition) {
    const workspace = loaded.get('teambit.workspace/workspace');
    await workspace.loadAspects([envId], false, undefined, { throwOnError: false, hideMissingModuleError: true });
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
  workspace.inInstallContext = true;
  workspace.inInstallAfterPmContext = true;
  try {
    await workspace.clearCache();
    await install.reloadMovedEnvs();
    await install.reloadNonLoadedEnvs();
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
