/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

import fs from 'fs';
consoleFileReadUsages();

import gracefulFs from 'graceful-fs';
// monkey patch fs module to avoid EMFILE error (especially when running watch operation)
gracefulFs.gracefulify(fs);

import './hook-require';
import { bootstrap } from './bootstrap';
import { handleErrorAndExit } from '@teambit/cli';
import type { Aspect } from '@teambit/harmony';
import { runCLI } from './load-bit';
import { autocomplete } from './autocomplete';
import { ServerCommander, shouldUseBitServer } from './server-commander';
import { spawnPTY } from './server-forever';

/**
 * run bit cli tool
 * @param additionalAspects optionally, add non-core aspects to the runtime.
 */
export async function runBit(additionalAspects?: Aspect[]) {
  if (process.argv.includes('--get-yargs-completions')) {
    autocomplete();
    process.exit(0);
  }
  if (process.argv.includes('server-forever')) {
    spawnPTY();
  } else if (shouldUseBitServer()) {
    new ServerCommander().execute().catch(async () => {
      await initApp(additionalAspects);
    });
  } else {
    await initApp(additionalAspects);
  }
}

async function initApp(additionalAspects?: Aspect[]) {
  try {
    await bootstrap();
    await runCLI(additionalAspects);
  } catch (err: any) {
    const originalError = err.originalError || err;
    await handleErrorAndExit(originalError, process.argv[2]);
  }
}

function consoleFileReadUsages() {
  if (!process.env.BIT_DEBUG_READ_FILE) {
    return;
  }
  let numR = 0;
  const print = (filename: string) => {
    // eslint-disable-next-line no-console
    console.log(`#${numR}`, filename);
  };
  const originalReadFile = fs.readFile;
  const originalReadFileSync = fs.readFileSync;
  // @ts-ignore
  fs.readFile = (...args) => {
    numR++;
    print(args[0]);
    // @ts-ignore
    return originalReadFile(...args);
  };

  fs.readFileSync = (...args) => {
    numR++;
    print(args[0]);
    // @ts-ignore
    return originalReadFileSync(...args);
  };
}
