import Bluebird from 'bluebird';
import harmony from '@teambit/harmony';
import HooksManager from './hooks';
import { handleErrorAndExit, handleUnhandledRejection } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitExt, registerCoreExtensions } from './extensions/bit';
import { CLIExtension } from './extensions/cli';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// by default Bluebird enables the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// some commands are slower by 20% with this enabled.
Bluebird.config({
  longStackTraces: Boolean(process.env.BLUEBIRD_DEBUG || process.env.BIT_LOG)
});

initApp();

async function initApp() {
  try {
    registerCoreExtensions();
    HooksManager.init();
    await harmony.run(ConfigExt);
    await harmony.set([BitExt]);
    const cli: CLIExtension = harmony.get('CLIExtension');
    if (!cli) throw new Error(`failed to get CLIExtension from Harmony`);
    await cli.run();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
  }
}

process.on('unhandledRejection', err => handleUnhandledRejection(err));
