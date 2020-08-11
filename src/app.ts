import semver from 'semver';
import chalk from 'chalk';
import Bluebird from 'bluebird';
import fs from 'fs-extra';
import harmony from '@teambit/harmony';
import HooksManager from './hooks';
import { handleErrorAndExit, handleUnhandledRejection } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitExt, registerCoreExtensions } from './extensions/bit';
import { CLIExtension } from './extensions/cli';
import { Analytics } from './analytics/analytics';
import { GLOBAL_CONFIG, GLOBAL_LOGS, BIT_VERSION } from './constants';
import { printWarning } from './logger/logger';

const MINIMUM_NODE_VERSION = '10.13.0';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

require('events').EventEmitter.defaultMaxListeners = 100; // set max listeners to a more appropriate numbers

require('regenerator-runtime/runtime');

process.on('unhandledRejection', (err) => handleUnhandledRejection(err));

// by default Bluebird enables the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// some commands are slower by 20% with this enabled.
Bluebird.config({
  longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG || process.env.BIT_LOG),
});

initApp();

async function initApp() {
  try {
    printBitVersionIfAsked();
    warnIfRunningAsRoot();
    verifyNodeVersionCompatibility();
    await ensureDirectories();
    await Analytics.promptAnalyticsIfNeeded();
    registerCoreExtensions();
    HooksManager.init();
    await harmony.run(ConfigExt);
    await harmony.set([BitExt]);
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
  }
}

async function runCLI() {
  const cli: CLIExtension = harmony.get('CLIExtension');
  if (!cli) throw new Error(`failed to get CLIExtension from Harmony`);
  await cli.run();
}

async function ensureDirectories() {
  await fs.ensureDir(GLOBAL_CONFIG);
  await fs.ensureDir(GLOBAL_LOGS);
}

function verifyNodeVersionCompatibility() {
  const nodeVersion = process.versions.node.split('-')[0];
  const isCompatible = semver.satisfies(nodeVersion, `>=${MINIMUM_NODE_VERSION}`);
  if (!isCompatible) {
    // eslint-disable-next-line no-console
    console.log(
      chalk.red(
        `Node version ${nodeVersion} is not supported, please use Node.js ${MINIMUM_NODE_VERSION} or higher. If you must use legacy versions of Node.js, please use our binary installation methods. https://docs.bit.dev/docs/installation`
      )
    );
    process.exit(1);
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
      console.log(BIT_VERSION); // eslint-disable-line no-console
      process.exit();
    }
  }
}
