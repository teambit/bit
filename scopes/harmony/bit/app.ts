/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

require('v8-compile-cache');

import './hook-require';
import { bootstrap } from '@teambit/legacy/dist/bootstrap';
import { handleErrorAndExit } from '@teambit/legacy/dist/cli/command-runner';
import { runCLI } from './load-bit';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
initApp();

async function initApp() {
  try {
    await bootstrap();
    // registerCoreExtensions();
    // const harmony = await Harmony.load([ConfigExt], {});
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    await handleErrorAndExit(originalError, process.argv[2]);
  }
}
