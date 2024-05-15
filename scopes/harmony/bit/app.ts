/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

import './hook-require';
import { bootstrap } from '@teambit/legacy/dist/bootstrap';
import { handleErrorAndExit } from '@teambit/legacy/dist/cli/handle-errors';
import { runCLI } from './load-bit';
import { autocomplete } from './autocomplete';

if (process.argv.includes('--get-yargs-completions')) {
  autocomplete();
  process.exit(0);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
initApp();

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
