#!/usr/bin/env node
'use strict'; // eslint-disable-line

/* eslint-disable no-var */
var semver = require('semver');
var mkdirp = require('mkdirp');
var constants = require('../dist-legacy/constants');
var roadRunner = require('roadrunner');
var bitUpdates = require('./bit-updates')
var nodeVersion = process.versions.node.split('-')[0]; 
var compatibilityStatus = getCompatibilityStatus();

function getBuildDir() {
  var map = {
    current: 'dist',
    legacy: 'dist-legacy'
  };

  return `../${map[compatibilityStatus]}`;
} 

function ensureDirectories() {
  mkdirp.sync(constants.MODULES_CACHE_DIR);
  mkdirp.sync(constants.GLOBAL_BIT_CACHE);
  mkdirp.sync(constants.GLOBAL_CONFIG);
}

function verifyCompatibility() {
  if (compatibilityStatus === 'unsupported') {
    console.log(require('chalk').red('Node version ' + nodeVersion + ' is not supported, please use Node.js 4.0 or higher.')); // eslint-disable-line
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
  (updateCommand) ? bitUpdates.runUpdate(updateCommand) : loadCli();
}

function loadCli() {
  return require(`${getBuildDir()}/app.js`);
}

verifyCompatibility();
ensureDirectories();
initCache();
loadCli();
// checkForUpdates(updateOrLaunch);
