const Store = require('jfs');
const readline = require('readline');
const needle = require('needle');
const child_process = require('child_process');
const constants = require('../dist/constants');

const ONE_DAY = 1000 * 60 * 60 * 24;
const url = [constants.RELEASE_SERVER, constants.BIT_INSTALL_METHOD, constants.BIT_VERSION].join('/');
const db = new Store(`${constants.CACHE_ROOT}/cache.json`);

function _getCache(key) {
  const val = db.getSync(key);
  return val.message === 'could not load data' ? undefined : val;
}

function _setCache(key, val) {
  db.saveSync(key, val);
}

function _askUser(cb) {
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\u001b[1;36mThere is a new version of Bit, would you like to update? [Y/n]: \u001b[0m', function (
    answer
  ) {
    cb(answer === 'y' || answer === 'Y');
    rl.close();
  });
}

function _exec(command, cb) {
  const ps = child_process.exec(command);
  ps.stdout.pipe(process.stdout);
  ps.stderr.pipe(process.stderr);
  ps.on('exit', function (code) {
    if (cb) cb();
  });
}

function runUpdate(updateCommand) {
  const previousCommand = `bit ${process.argv.slice(2).join(' ')}`;

  _askUser(function (shouldUpdate) {
    if (shouldUpdate) {
      _exec(updateCommand, function () {
        _exec(previousCommand);
      });
    } else _exec(previousCommand);
  });
}

function shouldSkipUpdate() {
  const cmd = `bit ${process.argv.slice(2).join(' ')}`;
  return !!~cmd.indexOf(constants.SKIP_UPDATE_FLAG);
}

/**
 * Check for updates every day and output a nag message if there's a newer version.
 */
function checkUpdate(cb) {
  if (shouldSkipUpdate()) return cb();
  const lastUpdateCheck = _getCache('lastUpdateCheck');
  if (lastUpdateCheck && Date.now() - lastUpdateCheck < ONE_DAY) cb();
  else {
    needle.get(url, function (err, res) {
      _setCache('lastUpdateCheck', Date.now());
      err || res.statusCode !== 200 ? cb() : cb(clearCachePrefix + getUpdateCommand());
    });
  }
}

var clearCachePrefix = 'bit cc && ';

function getUpdateCommand() {
  if (constants.BIT_INSTALL_METHOD === 'yum') return 'yum clean all && yum upgrade bit -y';
  if (constants.BIT_INSTALL_METHOD === 'deb') return 'sudo apt-get update && sudo apt-get install bit';
  if (constants.BIT_INSTALL_METHOD === 'npm') return 'npm install --global bit-bin';
  if (constants.BIT_INSTALL_METHOD === 'choco') return 'choco upgrade bit';
}

module.exports = {
  checkUpdate,
  runUpdate
};
