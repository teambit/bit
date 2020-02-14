import 'reflect-metadata';
import Bluebird from 'bluebird';
import { Harmony } from './harmony';
import HooksManager from './hooks';
import { BitCliExt } from './extensions/cli';
import defaultHandleError, { findErrorDefinition } from './cli/default-error-handler';
import { logErrAndExit } from './cli/command-registry';
import { BitExt } from './extensions/bit';
import HarmonyError from './harmony/exceptions/harmony-error';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
Bluebird.config({
  longStackTraces: true
});

// loudRejection();
HooksManager.init();

const config = {
  workspace: {
    components: '*'
  }
};

try {
  const harmony = Harmony.load([BitCliExt, BitExt], config);
  harmony
    .run()
    .then(() => {
      const cli = harmony.get('BitCli');
      // @ts-ignore
      if (cli && cli.instance) return cli.instance.run([], harmony);
      throw new Error('failed to load CLI');
    })
    .catch(err => {
      const errorHandlerExist = findErrorDefinition(err.originalError);
      const handledError = errorHandlerExist ? defaultHandleError(err.originalError) : err;
      logErrAndExit(handledError, process.argv[1] || '');
    });
  // Catching errors from the load phase
} catch (err) {
  const handledError = err instanceof HarmonyError ? err.toString() : err;
  logErrAndExit(handledError, process.argv[1] || '');
}
