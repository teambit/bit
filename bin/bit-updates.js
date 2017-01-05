var Store = require('jfs');
var readline = require('readline');
var needle = require('needle');
var child_process = require('child_process');
var constants = require('../dist-legacy/constants');

var ONE_DAY = 1000 * 60 * 60 * 24;
var url = [constants.RELEASE_SERVER,constants.BIT_INSTALL_METHOD,constants.BIT_VERSION].join('/');
var db = new Store(constants.CACHE_ROOT + '/cache.json');

function _getCache(key) {
  var val = db.getSync(key);
  return (val.message === 'could not load data') ? undefined : val;
}

function _setCache(key, val) {
  db.saveSync(key,val);
}

function _askUser(cb) {
  var rl = require('readline').createInterface({input: process.stdin, output: process.stdout});
  rl.question('\u001b[1;36mThere is a new version of Bit, would you like to update? [Y/n]: \u001b[0m',
    function (answer) {
      cb(answer === 'y' || answer === 'Y')
      rl.close();
    });
}

function _exec(command,cb) {
  var ps = child_process.exec(command);
  ps.stdout.pipe(process.stdout);
  ps.stderr.pipe(process.stderr);
  ps.on('exit', function (code) {
    if (cb) cb();
  });
}
  
function runUpdate(updateCommand){
  var previousCommand = 'bit ' + process.argv.slice(2).join(' ');
  
  _askUser(function (shouldUpdate) {
    if (shouldUpdate) _exec(updateCommand, function() { _exec(previousCommand)});
    else _exec(previousCommand)
  });
}

/**
 * Check for updates every day and output a nag message if there's a newer version.
 */
function checkUpdate(cb) {
  var lastUpdateCheck = _getCache('lastUpdateCheck')
  if (lastUpdateCheck && Date.now() - lastUpdateCheck < ONE_DAY) cb();
  needle.get(url, function(err, res) {
    _setCache('lastUpdateCheck', Date.now());
    if (res.statusCode !== 200) cb();
    cb(getUpdateCommand());
  })
}

function getUpdateCommand() {
  if (constants.BIT_INSTALL_METHOD === 'brew') return 'brew upgrade bit';
  if (constants.BIT_INSTALL_METHOD === 'deb') return 'sudo apt-get update && sudo apt-get install bit';
  if (constants.BIT_INSTALL_METHOD === 'npm') return 'npm upgrade --global bit';
  if (constants.BIT_INSTALL_METHOD === 'choco') return 'choco upgrade bit';
}

module.exports = {
  checkUpdate,
  runUpdate
};