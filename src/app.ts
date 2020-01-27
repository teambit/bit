import 'reflect-metadata';
import * as BPromise from 'bluebird';
import { Harmony } from './harmony';
import HooksManager from './hooks';
import { BitCliExt } from './cli';
import defaultHandleError from './cli/default-error-handler';
import { logErrAndExit } from './cli/command-registry';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
BPromise.config({
  longStackTraces: true
});

// loudRejection();
HooksManager.init();
Harmony.load(BitCliExt)
  .run()
  .then(() => {})
  .catch(err => {
    const handledError = defaultHandleError(err);
    logErrAndExit(handledError || err, process.argv[1] || '');
  });
