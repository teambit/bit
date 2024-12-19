/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

import fs from 'fs';
import gracefulFs from 'graceful-fs';
// monkey patch fs module to avoid EMFILE error (especially when running watch operation)
gracefulFs.gracefulify(fs);

import './hook-require';
import { bootstrap } from './bootstrap';
import { handleErrorAndExit } from '@teambit/cli';
import { runCLI } from './load-bit';
import { autocomplete } from './autocomplete';
import { ServerCommander, shouldUseBitServer } from './server-commander';
import { spawnPTY } from './server-forever';

if (process.argv.includes('--get-yargs-completions')) {
  autocomplete();
  process.exit(0);
}

// Export APIs from all core aspects to be used in the bundled app
export * from './core-aspects-exports';

if (process.argv.includes('server-forever')) {
  spawnPTY();
} else if (shouldUseBitServer()) {
  new ServerCommander().execute().catch(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initApp();
  });
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
