/* eslint-disable import/first, global-require */

import fs from 'fs';
consoleFileReadUsages();

import gracefulFs from 'graceful-fs';
// monkey patch fs module to avoid EMFILE error (especially when running watch operation)
gracefulFs.gracefulify(fs);

import type { Aspect } from '@teambit/harmony';
import { COMMAND_INDEX } from './command-index.generated';
import { formatHelpFromIndex, isStandaloneHelp, showInternalRequested } from './help-from-index';

/**
 * run bit cli tool
 * @param additionalAspects optionally, add non-core aspects to the runtime.
 */
export async function runBit(additionalAspects?: Aspect[]) {
  // Slice 5: short-circuit `bit --help` / `bit -h` without loading any
  // aspect. We render from the committed `COMMAND_INDEX`; the regular
  // bootstrap path validates the snapshot against the live `commandsSlot`
  // (see `command-index-assert.ts`) so the static output stays accurate.
  //
  // Done first — and the heavy imports below are deferred via `require()` —
  // so the help case pays only for parsing this file + COMMAND_INDEX. On
  // a M1 laptop that's ~80ms cold vs ~500ms for the full bootstrap.
  if (isStandaloneHelp(process.argv) && COMMAND_INDEX.length > 0) {
    process.stdout.write(`${formatHelpFromIndex(COMMAND_INDEX, showInternalRequested(process.argv))}\n`);
    process.exit(0);
  }

  // Lazy: only load these once we know we're going to actually run a command.
  // Top-level `import`s would defeat the help short-circuit above.
  require('./hook-require');
  const { autocomplete } = require('./autocomplete');
  const { ServerCommander, shouldUseBitServer } = require('./server-commander');
  const { spawnPTY } = require('./server-forever');

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
  // don't place this "process.on" block on the top. otherwise, "server-forever" will show "uncaughtException" on any error.
  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('uncaughtException', err);
    process.exit(1);
  });
  // Deferred imports — see runBit() for why.
  const { bootstrap } = require('./bootstrap');
  const { runCLI } = require('./load-bit');
  const { handleErrorAndExit } = require('@teambit/cli');
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
  const print = (filename: string | URL) => {
    const path = filename instanceof URL ? filename.pathname : String(filename);
    // eslint-disable-next-line no-console
    console.log(`#${numR}`, path);
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
