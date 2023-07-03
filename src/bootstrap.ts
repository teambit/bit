import Bluebird from 'bluebird';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import semver from 'semver';

import { Analytics } from './analytics/analytics';
import { handleUnhandledRejection } from './cli/handle-errors';
import { BIT_VERSION, GLOBAL_CONFIG, GLOBAL_LOGS } from './constants';
import HooksManager from './hooks';
import { printWarning } from './logger/logger';
import loader from './cli/loader';

const RECOMMENDED_NODE_VERSIONS = '>=18.12.0 <21.0.0';
const SUPPORTED_NODE_VERSIONS = '>=16.0.0 <21.0.0';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

require('events').EventEmitter.defaultMaxListeners = 100; // set max listeners to a more appropriate numbers

require('regenerator-runtime/runtime');

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('unhandledRejection', async (err) => handleUnhandledRejection(err));

// by default Bluebird enables the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// some commands are slower by 20% with this enabled.
Bluebird.config({
  longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG || process.env.BIT_LOG),
});

export async function bootstrap() {
  enableLoaderIfPossible();
  printBitVersionIfAsked();
  warnIfRunningAsRoot();
  verifyNodeVersionCompatibility();
  await ensureDirectories();
  await Analytics.promptAnalyticsIfNeeded();
  HooksManager.init();
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

function printBitVersionIfAsked() {
  if (process.argv[2]) {
    if (['-V', '-v', '--version'].includes(process.argv[2])) {
      const harmonyVersion = getHarmonyVersion();
      if (harmonyVersion) {
        console.log(harmonyVersion); // eslint-disable-line no-console
      } else {
        console.log(BIT_VERSION); // eslint-disable-line no-console
      }
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
  if (
    safeCommandsForLoader.includes(process.argv[2]) &&
    !process.argv.includes('--json') &&
    !process.argv.includes('-j')
  ) {
    loader.on();
    // loader.start('loading bit...');
  }
}

export function getHarmonyVersion(showValidSemver = false) {
  try {
    const teambitBit = require.resolve('@teambit/bit');
    // eslint-disable-next-line
    const packageJson = require(path.join(teambitBit, '../..', 'package.json'));
    if (packageJson.version) return packageJson.version;
    // this is running locally
    if (packageJson.componentId && packageJson.componentId.version) {
      return showValidSemver ? packageJson.componentId.version : `last-tag ${packageJson.componentId.version}`;
    }
    if (showValidSemver) throw new Error(`unable to find Bit version`);
    return null;
  } catch (err: any) {
    if (showValidSemver) throw err;
    return null;
  }
}
