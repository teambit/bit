#!/usr/bin/env node
'use strict'; // eslint-disable-line
// set max listeners to a more appripriate numbers
require('events').EventEmitter.defaultMaxListeners = 100;
require('regenerator-runtime/runtime');

/* eslint-disable no-var */
const semver = require('semver');
const mkdirp = require('mkdirp');
const yn = require('yn');
const R = require('ramda');
const uniqid = require('uniqid');
const roadRunner = require('roadrunner');
const constants = require('../dist/constants');
const bitUpdates = require('./bit-updates');
const { getSync, setSync } = require('../dist/api/consumer/lib/global-config');

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
  return () => bitUpdates.checkUpdate(cb);
}

function updateOrLaunch(updateCommand) {
  return updateCommand ? bitUpdates.runUpdate(updateCommand) : loadCli();
}

function loadCli() {
  return require('../dist/app.js');
}
function promptAnalyticsIfNeeded(cb) {
  // do not prompt analytics approval for bit config command (so you can configure it in CI envs)
  // this require is needed here beacuse bit caches are not created yet and will cause exception
  const { analyticsPrompt, errorReportingPrompt } = require('../dist/prompts');
  const cmd = process.argv.slice(2);
  if (cmd.length && cmd[0] !== 'config') {
    const analytics = getSync(constants.CFG_ANALYTICS_REPORTING_KEY);
    const error_reporting = getSync(constants.CFG_ANALYTICS_ERROR_REPORTS_KEY);
    const analyticsAnswer = !R.isNil(analytics) ? yn(analytics, { default: false }) : undefined;
    const errorsAnswer = !R.isNil(error_reporting) ? yn(error_reporting, { default: false }) : undefined;
    if (R.isNil(analyticsAnswer) && R.isNil(errorsAnswer)) {
      const uniqId = uniqid();
      if (!getSync(constants.CFG_ANALYTICS_USERID_KEY)) setSync(constants.CFG_ANALYTICS_USERID_KEY, uniqId);
      return analyticsPrompt().then(({ analyticsResponse }) => {
        setSync(constants.CFG_ANALYTICS_REPORTING_KEY, yn(analyticsResponse));
        if (yn(analyticsResponse)) return cb();
        return errorReportingPrompt().then(({ errResponse }) => {
          setSync(constants.CFG_ANALYTICS_ERROR_REPORTS_KEY, yn(errResponse));
          return cb();
        });
      });
    }
  }
  return cb();
}
verifyCompatibility();
ensureDirectories();
initCache();
promptAnalyticsIfNeeded(checkForUpdates(updateOrLaunch));
