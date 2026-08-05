import chalk from 'chalk';
import fs from 'fs-extra';
import semver from 'semver';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { Analytics } from '@teambit/legacy.analytics';
import { handleUnhandledRejection } from '@teambit/cli';
import path from 'path';
import { pathToFileURL } from 'url';
import { GLOBAL_CONFIG, GLOBAL_LOGS, NODE_PATH_SEPARATOR, WORKSPACE_JSONC } from '@teambit/legacy.constants';
import { printWarning, shouldDisableConsole, shouldDisableLoader } from '@teambit/legacy.logger';
import { loader } from '@teambit/legacy.loader';

const RECOMMENDED_NODE_VERSIONS = '>=20.0.0 <25.0.0';
const SUPPORTED_NODE_VERSIONS = '>=16.0.0 <25.0.0';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

require('events').EventEmitter.defaultMaxListeners = 100; // set max listeners to a more appropriate numbers

require('regenerator-runtime/runtime');

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('unhandledRejection', async (err: any) => handleUnhandledRejection(err));

const originalEmit = process.emit;
// @ts-ignore - TS complains about the return type of originalEmit.apply
process.emit = function (name, data) {
  // --------------------------------------------

  // 1. avoid punycode deprecation warning
  //
  // this fix is based on yarn fix for the similar issue, see code here:
  // https://github.com/yarnpkg/berry/blob/2cf0a8fe3e4d4bd7d4d344245d24a85a45d4c5c9/packages/yarnpkg-pnp/sources/loader/applyPatch.ts#L414-L435
  // ignore punycode deprecation warning
  // ignoring this warning for now, as the main issue is that
  // this package https://www.npmjs.com/package/uri-js?activeTab=readme is using it and it's deprecated
  // the package have the correct punycode version as a dependency from the user land
  // but it uses it incorrectly, it should use it with a trailing slash
  // the require in their code is require('punycode') and not require('punycode/') (with trailing slash)
  // As this package is not maintained anymore, we can't fix it from our side
  // see more at:
  // https://github.com/garycourt/uri-js/issues/97
  // https://github.com/garycourt/uri-js/pull/95
  // on the bit repo we overriding the uri-js package with a fixed version (see overrides in workspace.jsonc)
  // "uri-js": "npm:uri-js-replace"
  // but we don't want to override it automatically for all the users
  // there are many other packages (like webpack, eslint, etc) that are using this uri-js package
  // so if we won't ignore it, all users will get this warning
  //
  // 2. ignore util._extend deprecation warning
  //
  // this warning is coming from the http-proxy package
  // see: https://github.com/http-party/node-http-proxy/pull/1666
  if (
    // filter out the warning
    (name === `warning` &&
      typeof data === `object` &&
      ((data.name === `DeprecationWarning` && data.message.includes(`punycode`)) || data.code === `DEP0040`)) ||
    (data.name === `DeprecationWarning` && data.message.includes(`util._extend`)) ||
    data.code === `DEP0060`
  )
    return false;

  // --------------------------------------------

  // eslint-disable-next-line prefer-rest-params
  return originalEmit.apply(process, arguments as unknown as Parameters<typeof process.emit>);
};

export async function bootstrap() {
  enableHoistedDependencyResolution();
  enableLoaderIfPossible();
  printBitVersionIfAsked();
  warnIfRunningAsRoot();
  verifyNodeVersionCompatibility();
  await ensureDirectories();
  await Analytics.promptAnalyticsIfNeeded();
}

/**
 * Make the workspace's privately hoisted dependencies resolvable from the global virtual store.
 *
 * Under the project-local virtual store, a package in `node_modules/.pnpm` resolves anything it
 * requires without declaring it by walking *up* into the workspace - the hoisted
 * `node_modules/.pnpm/node_modules` first, then the workspace root. Under pnpm's global virtual
 * store the package lives in a store shared with every other project on the machine, with no
 * workspace above it, so every such require fails.
 *
 * This covers phantom dependencies generally, not one class of them. Bit's core aspects are the
 * case that motivated it - `@teambit/*` is required by every published env and aspect without being
 * declared, because it has to be the single copy from the running installation - but any
 * under-declared package in the graph resolves the same way, which is why the whole hoisted
 * directory goes on the path rather than a hand-picked list.
 *
 * pnpm's answer for this layout is `NODE_PATH` pointing at the hoisted directory, which stays
 * project-local under the global virtual store. pnpm sets it in the command shims it writes, but bit
 * runs from bvm rather than through a shim and loads aspects in its own process, so it has to do
 * this itself - and before any aspect is required, hence its place at the top of `bootstrap`.
 *
 * `NODE_PATH` only covers CommonJS; {@link registerEsmNodePathLoader} handles ESM.
 *
 * A no-op when the directory doesn't exist, which is every workspace not using the global virtual
 * store, and anything run outside a workspace.
 */
/**
 * Source of the ESM loader registered by {@link registerEsmNodePathLoader}, adapted from
 * `@pnpm/plugin-esm-node-path` (MIT). It reads `NODE_PATH` at load time and, when the default
 * resolution of a bare specifier fails, retries it from each entry.
 */
const ESM_NODE_PATH_LOADER = `
import { createRequire } from 'node:module'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'

const extraNodePaths = (process.env.NODE_PATH || '').split(delimiter).filter(Boolean)

export async function resolve (specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (originalError) {
    // Only bare specifiers can come from the hoisted directory; the rest are already anchored.
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
      throw originalError
    }
    for (const basePath of extraNodePaths) {
      try {
        const require = createRequire(pathToFileURL(basePath + '/').href)
        return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      } catch {}
    }
    throw originalError
  }
}
`;

function enableHoistedDependencyResolution() {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (!workspaceRoot) return;
  const hoistedDir = path.join(workspaceRoot, 'node_modules', '.pnpm', 'node_modules');
  if (!fs.existsSync(hoistedDir)) return;
  const existing = process.env.NODE_PATH;
  if (!existing?.split(NODE_PATH_SEPARATOR).includes(hoistedDir)) {
    process.env.NODE_PATH = existing ? `${hoistedDir}${NODE_PATH_SEPARATOR}${existing}` : hoistedDir;
    // `NODE_PATH` is read once when the module system initializes, so a later assignment only takes
    // effect after re-deriving the global paths.
    (require('module') as { _initPaths(): void })._initPaths();
  }
  registerEsmNodePathLoader();
}

/**
 * The ESM half of {@link enableHoistedDependencyResolution}.
 *
 * Node consults `NODE_PATH` only for CommonJS; ESM resolution ignores it entirely. Bit supports ESM
 * components, so without this an ESM package in the store cannot reach the hoisted directory at all
 * and the CommonJS half above would only cover part of the problem.
 *
 * The fix is an ESM loader whose `resolve` hook falls back to the `NODE_PATH` entries when the
 * default resolution fails. Registered two ways, because both matter:
 *
 * - `module.register` for bit's own process, which is where aspects and envs are loaded.
 * - `NODE_OPTIONS`, so the processes bit spawns - env build steps, app servers, test workers -
 *   inherit it. They resolve their own dependencies and hit the same wall.
 *
 * The loader and the `--import` registration trick are adapted from pnpm's
 * `@pnpm/plugin-esm-node-path` (MIT), which exists for exactly this case; it is inlined as a data
 * URL rather than taken as a dependency so there is no file to ship and no install step to depend
 * on. `module.register` needs Node 20.6, so this is skipped on older runtimes - the CommonJS half
 * still applies there.
 */
function registerEsmNodePathLoader() {
  const nodeModule = require('module') as {
    register?: (specifier: string, parentURL: string) => void;
  };
  if (typeof nodeModule.register !== 'function') return;
  const loaderUrl = `data:text/javascript,${encodeURIComponent(ESM_NODE_PATH_LOADER)}`;
  const parentUrl = pathToFileURL(path.join(process.cwd(), '/')).href;
  try {
    nodeModule.register(loaderUrl, parentUrl);
  } catch {
    // A runtime that rejects the loader must not take the whole CLI down with it - the CommonJS
    // half of the workaround is unaffected, and only ESM packages relying on hoisting are lost.
    return;
  }
  const registration = `import{register}from'node:module';register(${JSON.stringify(loaderUrl)},${JSON.stringify(parentUrl)});`;
  const importFlag = `--import=data:text/javascript,${encodeURIComponent(registration)}`;
  if (process.env.NODE_OPTIONS?.includes('register')) return;
  process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} ${importFlag}`
    : importFlag;
}

function findWorkspaceRoot(from: string): string | undefined {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, WORKSPACE_JSONC))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function ensureDirectories() {
  await fs.ensureDir(GLOBAL_CONFIG);
  await fs.ensureDir(GLOBAL_LOGS);
}

function verifyNodeVersionCompatibility() {
  const nodeVersion = process.versions.node.split('-')[0];
  const isCompatible = semver.satisfies(nodeVersion, SUPPORTED_NODE_VERSIONS);
  if (!isCompatible) {
    // eslint-disable-next-line no-console
    console.log(
      chalk.red(
        `Node version ${nodeVersion} is not supported, please use Node.js ${SUPPORTED_NODE_VERSIONS}.
If you must use legacy versions of Node.js, please use our binary installation methods. https://docs.bit.dev/docs/installation`
      )
    );
    process.exit(1);
  }
  const isRecommended = semver.satisfies(nodeVersion, RECOMMENDED_NODE_VERSIONS);
  if (!isRecommended) {
    // eslint-disable-next-line no-console
    console.log(
      chalk.yellow(
        `warning - use Node ${RECOMMENDED_NODE_VERSIONS} for best performance. Using Node ${nodeVersion} may cause regressions.`
      )
    );
  }
}

function warnIfRunningAsRoot() {
  const isRoot = process.getuid && process.getuid() === 0;
  if (isRoot) {
    printWarning('running bit as root might cause permission issues later');
  }
}

export function printBitVersionIfAsked() {
  if (process.argv[2]) {
    if (['-V', '-v', '--version'].includes(process.argv[2])) {
      const harmonyVersion = getBitVersion();
      console.log(harmonyVersion); // eslint-disable-line no-console
      process.exit();
    }
  }
}

/**
 * once Yargs and Harmony are fully loaded we have all commands instances and we are able to
 * determine whether or not the loader should be loaded.
 * in this phase, all we have are the args from the cli, so we can only guess when it's ok to start
 * the loader. the reason we start it here is to have the loader report the progress of bit
 * bootstrap process, which can slow at times.
 */
function enableLoaderIfPossible() {
  const safeCommandsForLoader = [
    'status',
    's', // status alias
    'compile',
    'start',
    'add',
    'show',
    'tag',
    'build',
    'create',
    'test',
    'install',
    'update',
    'link',
    'import',
    'log',
    'checkout',
    'merge',
    'diff',
    'env',
    'envs',
  ];
  if (safeCommandsForLoader.includes(process.argv[2]) && !shouldDisableConsole && !shouldDisableLoader) {
    loader.on();
    // loader.start('loading bit...');
  }
}
