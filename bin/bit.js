#!/usr/bin/env node
'use strict'; // eslint-disable-line
// set max listeners to a more appripriate numbers
require('events').EventEmitter.defaultMaxListeners = 100;
require('regenerator-runtime/runtime');
/* eslint-disable no-var */
const semver = require('semver');
const mkdirp = require('mkdirp');
const constants = require('../dist/constants');
const roadRunner = require('roadrunner');
const bitUpdates = require('./bit-updates');

const nodeVersion = process.versions.node.split('-')[0];
const compatibilityStatus = getCompatibilityStatus();

function ensureDirectories() {
  mkdirp.sync(constants.MODULES_CACHE_DIR);
  mkdirp.sync(constants.GLOBAL_CONFIG);
  mkdirp.sync(constants.GLOBAL_LOGS);
}

function verifyCompatibility() {
  if (compatibilityStatus === 'unsupported') {
    console.log(
      require('chalk').red(`Node version ${nodeVersion} is not supported, please use Node.js 4.0 or higher.`)
    ); // eslint-disable-line
    return process.exit();
  }

  return true;
}

function getCompatibilityStatus() {
  if (semver.satisfies(nodeVersion, '>=5.0.0')) {
    return 'current';
  }

  if (semver.satisfies(nodeVersion, '>=4.0.0')) {
    return 'legacy';
  }

  return 'unsupported';
}

function initCache() {
  roadRunner.load(constants.MODULES_CACHE_FILENAME);
  var cacheVersion = roadRunner.get('CACHE_BREAKER').version; // eslint-disable-line
  if (!cacheVersion || cacheVersion !== constants.BIT_VERSION) {
    roadRunner.reset(constants.MODULES_CACHE_FILENAME);
  }

  roadRunner.set('CACHE_BREAKER', { version: constants.BIT_VERSION });
  roadRunner.setup(constants.MODULES_CACHE_FILENAME);
}

function checkForUpdates(cb) {
  return bitUpdates.checkUpdate(cb);
}

function updateOrLaunch(updateCommand) {
  return updateCommand ? bitUpdates.runUpdate(updateCommand) : loadCli();
}

function loadCli() {
  return require('../dist/app.js');
}

verifyCompatibility();
ensureDirectories();
initCache();
checkForUpdates(updateOrLaunch);
