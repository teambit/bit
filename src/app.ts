import 'reflect-metadata';
import * as BPromise from 'bluebird';
import loudRejection from 'loud-rejection';
import { Harmony, Extension, ExtensionProvider } from './harmony';
import HooksManager from './hooks';
import capsuleOrchestrator from './orchestrator/orchestrator';
import { Bit } from './bit';
import { BitCliExt } from './cli';
import { Pipes } from './pipes';
import { PaperExt } from './paper';

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

Harmony.load(PaperExt)
  .run()
  .then(() => {})
  .catch(err => {
    console.error(err, err.stack);
  });

// BitCli.load(Harmony.load(PaperExt))
//   .then(async () => {
//     // if (capsuleOrchestrator) await capsuleOrchestrator.buildPools();
//   })
//   .catch(err => console.error('loud rejected:', err));
