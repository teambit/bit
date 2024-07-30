/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

import './hook-require';
import { bootstrap } from './bootstrap';
import { handleErrorAndExit } from '@teambit/cli';
import { runCLI } from './load-bit';
import { autocomplete } from './autocomplete';
import { ServerCommander, shouldUseBitServer } from './server-commander';

if (process.argv.includes('--get-yargs-completions')) {
  autocomplete();
  process.exit(0);
}

if (shouldUseBitServer()) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  new ServerCommander().execute();
} else {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  initApp();
}

async function initApp() {
  try {
    await bootstrap();
    // registerCoreExtensions();
    // const harmony = await Harmony.load([ConfigExt], {});
    await runCLI();
  } catch (err: any) {
    const originalError = err.originalError || err;
    await handleErrorAndExit(originalError, process.argv[2]);
  }
}
