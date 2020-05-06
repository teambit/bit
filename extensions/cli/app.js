'use strict';

var _interopRequireWildcard = require('@babel/runtime/helpers/interopRequireWildcard');

var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault');

function _bluebird() {
  const data = _interopRequireDefault(require('bluebird'));

  _bluebird = function() {
    return data;
  };

  return data;
}

function _harmony() {
  const data = _interopRequireWildcard(require('@teambit/harmony'));

  _harmony = function() {
    return data;
  };

  return data;
}

function _hooks() {
  const data = _interopRequireDefault(require('bit-bin/hooks'));

  _hooks = function() {
    return data;
  };

  return data;
}

function _defaultErrorHandler() {
  const data = _interopRequireWildcard(require('bit-bin/cli/default-error-handler'));

  _defaultErrorHandler = function() {
    return data;
  };

  return data;
}

function _commandRegistry() {
  const data = require('bit-bin/cli/command-registry');

  _commandRegistry = function() {
    return data;
  };

  return data;
}

function _bit() {
  const data = require('@bit/bit.core.bit');

  _bit = function() {
    return data;
  };

  return data;
}

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs
// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)

_bluebird().default.config({
  longStackTraces: true // longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG)
}); // loudRejection();

_hooks().default.init();

try {
  _harmony()
    .default.run(_bit().BitExt)
    .then(() => {
      // harmony.set([BitCliExt]);
    })
    .then(() => {
      const cli = _harmony().default.get('BitCli'); // @ts-ignore :TODO until refactoring cli extension to dynamiclly load extensions

      return cli === null || cli === void 0 ? void 0 : cli.instance.run();
    })
    .catch(err => {
      const originalError = err.originalError || err;
      const errorHandlerExist = (0, _defaultErrorHandler().findErrorDefinition)(originalError);
      const handledError = errorHandlerExist ? (0, _defaultErrorHandler().default)(originalError) : err;
      (0, _commandRegistry().logErrAndExit)(handledError, process.argv[1] || '');
    }); // Catching errors from the load phase
} catch (err) {
  const handledError = err instanceof _harmony().HarmonyError ? err.toString() : err;
  (0, _commandRegistry().logErrAndExit)(handledError, process.argv[1] || '');
}
//# sourceMappingURL=app.js.map
