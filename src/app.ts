// import Bluebird from 'bluebird';
import harmony, { HarmonyError } from '@teambit/harmony';
import HooksManager from './hooks';
import { logErrAndExit, handleErrorAndExit } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitExt } from './extensions/bit';
import { CLIExtension } from './extensions/cli';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// by default Bluebird enable the longStackTraces when env is `development`, or when
// BLUEBIRD_DEBUG is set.
// the drawback of enabling it all the time is a performance hit. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
// to override the default, uncomment the following, and set to true/false

// Bluebird.config({
//   longStackTraces: true
// });

initApp();

async function initApp() {
  HooksManager.init();
  await initHarmony();
  await initCLI();
}

async function initHarmony() {
  try {
    await harmony.run(ConfigExt);
    await harmony.set([BitExt]);
  } catch (err) {
    const handledError = err instanceof HarmonyError ? err.toString() : err;
    logErrAndExit(handledError, process.argv[2] || '');
  }
}
async function initCLI() {
  const cli: CLIExtension = harmony.get('CLIExtension');
  if (!cli) throw new Error(`failed to get CLIExtension from Harmony`);
  try {
    await cli.run();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
  }
}
