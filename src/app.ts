// import Bluebird from 'bluebird';
import harmony, { HarmonyError } from '@teambit/harmony';
import HooksManager from './hooks';
import defaultHandleError, { findErrorDefinition } from './cli/default-error-handler';
import { logErrAndExit } from './cli/command-registry';
import { ConfigExt } from './extensions/config';
import { BitExt } from './extensions/bit';
import { PaperError } from './extensions/cli';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// by default Bluebird enable the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// to override the default, uncomment the following, and set to true/false

// Bluebird.config({
//   longStackTraces: true
// });

// loudRejection();
HooksManager.init();
try {
  harmony
    .run(ConfigExt)
    .then(() => {
      return harmony.set([BitExt]);
    })
    .then(() => {
      const cli = harmony.get('CLIExtension');
      // @ts-ignore :TODO until refactoring cli extension to dynamically load extensions
      // eslint-disable-next-line no-console
      return cli?.run();
    })
    .catch(err => {
      const originalError = err.originalError || err;
      const errorHandlerExist = findErrorDefinition(originalError);
      let handledError;
      if (originalError instanceof PaperError) {
        // at this point CLI or Harmony might be broken. handling by paper
        PaperError.handleError(err);
      } else if (errorHandlerExist) {
        handledError = defaultHandleError(originalError);
      } else {
        handledError = err;
      }
      logErrAndExit(handledError, process.argv[1] || '');
    });
  // Catching errors from the load phase
} catch (err) {
  const handledError = err instanceof HarmonyError ? err.toString() : err;
  logErrAndExit(handledError, process.argv[1] || '');
}
