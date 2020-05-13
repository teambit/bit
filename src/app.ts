import Bluebird from 'bluebird';
import harmony, { HarmonyError } from '@teambit/harmony';
import HooksManager from './hooks';
import defaultHandleError, { findErrorDefinition } from './cli/default-error-handler';
import { logErrAndExit } from './cli/command-registry';
import { ConfigExt } from './extensions/config';
import { BitExt } from './extensions/bit';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
Bluebird.config({
  longStackTraces: true
  // longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG)
});
// loudRejection();
HooksManager.init();
try {
  harmony
    .run([ConfigExt, BitExt])
    .then(() => {
      const cli = harmony.get('cli');
      // @ts-ignore :TODO until refactoring cli extension to dynamically load extensions
      return cli?.instance.run();
    })
    .catch(err => {
      const originalError = err.originalError || err;
      const errorHandlerExist = findErrorDefinition(originalError);
      const handledError = errorHandlerExist ? defaultHandleError(originalError) : err;
      logErrAndExit(handledError, process.argv[1] || '');
    });
  // Catching errors from the load phase
} catch (err) {
  const handledError = err instanceof HarmonyError ? err.toString() : err;
  logErrAndExit(handledError, process.argv[1] || '');
}
