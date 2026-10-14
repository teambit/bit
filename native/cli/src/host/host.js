'use strict';
// The JavaScript host of the Rust `bit` CLI (native/cli/src/host.rs). It serves the behavior
// that components and aspects implement in JavaScript to commands that otherwise run in Rust,
// using only modules the published `@teambit/bit` package ships. The Rust CLI passes it to the
// Node.js CLI's own Node with `-e`, so nothing is written to disk.
//
//   node -e <this script> <@teambit/bit dir> <Node.js CLI entry> <workspace root>
//
// One JSON request per stdin line, `{id, method, params}`; one JSON response per stdout line,
// `{id, result}` or `{id, error}`. Everything the aspects print goes to stderr, so stdout stays
// the protocol stream.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const [bitDir, entry, root] = process.argv.slice(-3);
const bitRequire = createRequire(path.join(bitDir, 'package.json'));
const respond = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => process.stderr.write(chunk, encoding, callback);

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
    const result = await handler(request.params ?? {});
    respond(`${JSON.stringify({ id: request.id, result: result ?? null })}\n`);
  } catch (error) {
    respond(`${JSON.stringify({ id: request.id, error: error?.message ?? String(error) })}\n`);
  }
}

const handlers = {
  hostInfo,
  envPolicy: ({ envId }) => envPolicy(envId),
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
  const { GLOBAL_CONFIG } = bitRequire('@teambit/legacy.constants');
  const { getBitVersion } = bitRequire('@teambit/bit.get-bit-version');
  const { findBvmDir } = bitRequire('@teambit/bvm.path/dist/path.js');
  const { prepareBuildScriptsPath } = bitRequire('@teambit/pnpm/dist/build-scripts-path.js');
  // Shapes PATH for the lifecycle scripts the engine runs: this Node first, a node-gyp wrapper last.
  prepareBuildScriptsPath();
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
    const { getNodeDependencyPolicy } = bitRequire('@teambit/node/dist/default-dependency-policy.js');
    return getNodeDependencyPolicy();
  }
  const env = await loadEnv(envId);
  const policy = await env?.getDependencies?.();
  return policy ?? null;
}

async function appTypes() {
  return (await loadHarmony()).get('teambit.harmony/application').getAppPatterns();
}

/** The env's `getPackageJsonProps()` and whether it implements `modifyPackageJson()`. */
async function packageJsonProps(envId) {
  if (envId === 'teambit.harmony/node') {
    const { getCjsPackageJsonProps } = bitRequire('@teambit/typescript/dist/cjs-package-json-props.js');
    return { props: getCjsPackageJsonProps(), modifiesPackageJson: false };
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
  const { shouldDisableLoader } = bitRequire('@teambit/legacy.logger');
  if (!shouldDisableLoader) bitRequire('@teambit/legacy.loader').loader.on();
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
    if (request.compile) {
      const { CompilationInitiator } = bitRequire('@teambit/compiler');
      const logger = loaded.get('teambit.harmony/logger').createLogger('teambit.workspace/install');
      const started = process.hrtime();
      logger.setStatusLine('compiling components');
      const results = await loaded
        .get('teambit.compilation/compiler')
        .compileOnWorkspace([], { initiator: CompilationInitiator.Install });
      compiled = results.length;
      logger.consoleSuccess('compiling components', started);
    }
    if (request.writeConfigFiles) await install.tryWriteConfigFiles(false);
    return { oldNonLoadedEnvs: envs.getFailedToLoadEnvs(), compiled };
  } finally {
    workspace.inInstallContext = false;
  }
}

function loadHarmony() {
  if (!harmony) {
    const { loadBit } = require(path.join(bitDir, 'dist', 'load-bit.js'));
    harmony = loadBit(root);
  }
  return harmony;
}
