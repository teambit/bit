import 'reflect-metadata';
import * as BPromise from 'bluebird';
import { Harmony } from './harmony';
import HooksManager from './hooks';
import capsuleOrchessrator from './capsule/orchestrator/orchestrator';
import { Bit } from './bit';
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

// const defaultExtensions: ExtensionProvider<any, any>[] = [
//   Paper
// ];

Harmony.load(BitCliExt)
  .run()
  .then(() => {})
  .catch(err => {
    const handledError = defaultHandleError(err);
    logErrAndExit(handledError || err, process.argv[1] || '');
  });

// BitCli.load(Harmony.load(PaperExt))
//   .then(async () => {
//     // if (capsuleOrchestrator) await capsuleOrchestrator.buildPools();
//   })
//   .catch(err => console.error('loud rejected:', err));
