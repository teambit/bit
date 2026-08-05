import chalk from 'chalk';
import fs from 'fs-extra';
import semver from 'semver';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { Analytics } from '@teambit/legacy.analytics';
import { handleUnhandledRejection } from '@teambit/cli';
import path from 'path';
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
  addHoistedStoreToNodePath();
  enableLoaderIfPossible();
  printBitVersionIfAsked();
  warnIfRunningAsRoot();
  verifyNodeVersionCompatibility();
  await ensureDirectories();
  await Analytics.promptAnalyticsIfNeeded();
}

/**
 * Put the workspace's privately hoisted directory on `NODE_PATH`.
 *
 * The core aspects are phantom dependencies of every published env and aspect - required without
 * being declared, and provided by the running bit installation. Under the project-local virtual
 * store an env resolves them by walking up out of `node_modules/.pnpm` into the workspace's root
 * `node_modules`. Under pnpm's global virtual store the env lives in the shared store instead, with
 * no workspace above it to walk into, so that resolution fails.
 *
 * pnpm's answer for hoisted dependencies in that layout is `NODE_PATH`, pointing at
 * `<workspace>/node_modules/.pnpm/node_modules`, which stays project-local under the global virtual
 * store. That is where `DependencyLinker.linkCoreAspectsToHoistedStore` puts the core aspects, so
 * adding it here is what makes them resolvable from a store slot.
 *
 * pnpm sets `NODE_PATH` in the command shims it writes, but bit runs from bvm rather than through a
 * shim and loads aspects in its own process, so it has to do this itself - and before any aspect is
 * required, hence its place at the top of `bootstrap`.
 *
 * Node only consults `NODE_PATH` for CommonJS. Core aspects and published env dists are CommonJS
 * today; an ESM env importing an undeclared `@teambit/*` would still fail, for which pnpm offers the
 * `@pnpm/plugin-esm-node-path` config dependency.
 *
 * A no-op when the directory doesn't exist, which is every workspace not using the global virtual
 * store, and anything run outside a workspace.
 */
function addHoistedStoreToNodePath() {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (!workspaceRoot) return;
  const hoistedDir = path.join(workspaceRoot, 'node_modules', '.pnpm', 'node_modules');
  if (!fs.existsSync(hoistedDir)) return;
  const existing = process.env.NODE_PATH;
  if (existing?.split(NODE_PATH_SEPARATOR).includes(hoistedDir)) return;
  process.env.NODE_PATH = existing ? `${hoistedDir}${NODE_PATH_SEPARATOR}${existing}` : hoistedDir;
  // `NODE_PATH` is read once when the module system initializes, so a later assignment only takes
  // effect after re-deriving the global paths.
  (require('module') as { _initPaths(): void })._initPaths();
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
