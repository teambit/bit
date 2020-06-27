#!/usr/bin/env node
'use strict'; // eslint-disable-line
// require('v8-compile-cache');

const constants = require('../dist/constants');
const { printWarning } = require('../dist/logger/logger');

const MINIMUM_NODE_VERSION = '10.0.0';

// set max listeners to a more appropriate numbers
require('events').EventEmitter.defaultMaxListeners = 100;
require('regenerator-runtime/runtime');

bitVersion();

/* eslint-disable no-var */
const semver = require('semver');
const fs = require('fs-extra');
const chalk = require('chalk');
// const bitUpdates = require('./bit-updates');

const nodeVersion = process.versions.node.split('-')[0];
const compatibilityStatus = getCompatibilityStatus();

warnIfRunningAsRoot();

function ensureDirectories() {
  fs.ensureDirSync(constants.GLOBAL_CONFIG);
  fs.ensureDirSync(constants.GLOBAL_LOGS);
}

function warnIfRunningAsRoot() {
  const isRoot = process.getuid && process.getuid() === 0;
  if (isRoot) {
    printWarning('running bit as root might cause permission issues later');
  }
}

function verifyCompatibility() {
  if (compatibilityStatus === 'unsupported') {
    console.log(
      // eslint-disable-line
      require('chalk').red(
        `Node version ${nodeVersion} is not supported, please use Node.js ${MINIMUM_NODE_VERSION} or higher. If you must use legacy versions of Node.js, please use our binary installation methods. https://docs.bit.dev/docs/installation`
      )
    );
    return process.exit();
  }

  return true;
}

function bitVersion() {
  if (process.argv[2]) {
    if (['-V', '-v', '--version'].includes(process.argv[2])) {
      console.log(constants.BIT_VERSION); // eslint-disable-line no-console
      process.exit();
    }
  }
}

function getCompatibilityStatus() {
  if (semver.satisfies(nodeVersion, `>=${MINIMUM_NODE_VERSION}`)) {
    return 'current';
  }

  return 'unsupported';
}

// function checkForUpdates(cb) {
//   return () => bitUpdates.checkUpdate(cb);
// }

// function updateOrLaunch(updateCommand) {
//   return updateCommand ? bitUpdates.runUpdate(updateCommand) : loadCli();
// }

function loadCli() {
  return require('../dist/app.js');
}

function promptAnalyticsIfNeeded(cb) {
  // this require is needed here because bit caches are not created yet and will cause exception
  const { Analytics } = require('../dist/analytics/analytics');
  return Analytics.promptAnalyticsIfNeeded(process.argv.slice(2)).then(() => cb());
  // .catch(() => console.log(chalk.yellow('\noperation aborted')));
}
verifyCompatibility();
ensureDirectories();
promptAnalyticsIfNeeded(loadCli);
