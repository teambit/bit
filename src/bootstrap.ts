import Bluebird from 'bluebird';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import semver from 'semver';

import { Analytics } from './analytics/analytics';
import { handleUnhandledRejection } from './cli/command-runner';
import { BIT_VERSION, GLOBAL_CONFIG, GLOBAL_LOGS } from './constants';
import HooksManager from './hooks';
import { printWarning } from './logger/logger';

const MINIMUM_NODE_VERSION = '12.15.0';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

require('events').EventEmitter.defaultMaxListeners = 100; // set max listeners to a more appropriate numbers

require('regenerator-runtime/runtime');

process.on('unhandledRejection', async (err) => handleUnhandledRejection(err));

// by default Bluebird enables the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// some commands are slower by 20% with this enabled.
Bluebird.config({
  longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG || process.env.BIT_LOG),
});

export async function bootstrap() {
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
      const harmonyVersion = getHarmonyVersion();
      if (harmonyVersion) {
        console.log(`${harmonyVersion} (bit-bin: ${BIT_VERSION})`); // eslint-disable-line no-console
      } else {
        console.log(BIT_VERSION); // eslint-disable-line no-console
      }
      process.exit();
    }
  }
}

// @todo: improve.
function getHarmonyVersion() {
  try {
    const teambitBit = require.resolve('@teambit/bit');
    // eslint-disable-next-line
    const packageJson = require(path.join(teambitBit, '../..', 'package.json'));
    if (packageJson.version) return packageJson.version;
    // this is running locally
    if (packageJson.componentId && packageJson.componentId.version) {
      return `last-tag ${packageJson.componentId.version}`;
    }
    return null;
  } catch (err) {
    return null;
  }
}
