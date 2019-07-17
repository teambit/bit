#!/usr/bin/env node
'use strict'; // eslint-disable-line
// require('v8-compile-cache');

const constants = require('../dist/constants');

// set max listeners to a more appripriate numbers
require('events').EventEmitter.defaultMaxListeners = 100;
require('regenerator-runtime/runtime');

bitVersion();

/* eslint-disable no-var */
const semver = require('semver');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
// const bitUpdates = require('./bit-updates');

const nodeVersion = process.versions.node.split('-')[0];
const compatibilityStatus = getCompatibilityStatus();

function ensureDirectories() {
  mkdirp.sync(constants.GLOBAL_CONFIG);
  mkdirp.sync(constants.GLOBAL_LOGS);
}

function verifyCompatibility() {
  if (compatibilityStatus === 'unsupported') {
    console.log(
      require('chalk').red(
        `Node version ${nodeVersion} is not supported, please use Node.js 8.0 or higher. If you must use legacy versions of Node.js, please use our binary installation methods. https://docs.bit.dev/docs/installation.html`
      )
    ); // eslint-disable-line
    return process.exit();
  }

  return true;
}

function bitVersion() {
  if (process.argv[2]) {
    if (process.argv[2] === '-V' || process.argv[2] === '-v' || process.argv[2] === '--version') {
      console.log(constants.BIT_VERSION); // eslint-disable-line no-console
      process.exit();
    }
  }
}

function getCompatibilityStatus() {
  if (semver.satisfies(nodeVersion, '>=8.0.0')) {
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
  return Analytics.promptAnalyticsIfNeeded(process.argv.slice(2))
    .then(() => cb())
    .catch(() => console.log(chalk.yellow('\noperation aborted')));
}
verifyCompatibility();
ensureDirectories();
promptAnalyticsIfNeeded(loadCli);
