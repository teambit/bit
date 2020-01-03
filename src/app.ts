import * as BPromise from 'bluebird';
import loudRejection from 'loud-rejection';
import loadExtensions from './extensions/extensions-loader';
import { Harmony } from './harmony';
import HooksManager from './hooks';
import capsuleOrchestrator from './orchestrator/orchestrator';
import { BitCli, Bit } from './bit';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
BPromise.config({
  longStackTraces: process.env.BLUEBIRD_DEBUG
});

loudRejection();
HooksManager.init();

BitCli.load(Harmony.load())
  .then(async () => {
    if (capsuleOrchestrator) await capsuleOrchestrator.buildPools();
  })
  .catch(err => console.error('loud rejected:', err));
