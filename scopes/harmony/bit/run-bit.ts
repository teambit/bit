/* eslint-disable import/first, global-require */

import fs from 'fs';
consoleFileReadUsages();

import gracefulFs from 'graceful-fs';
// monkey patch fs module to avoid EMFILE error (especially when running watch operation)
gracefulFs.gracefulify(fs);

import type { Aspect } from '@teambit/harmony';
import { COMMAND_INDEX } from './command-index.generated';
import {
  buildKnownNameSet,
  enteredCommandName,
  formatHelpFromIndex,
  isStandaloneHelp,
  isStandaloneVersion,
  showInternalRequested,
} from './help-from-index';

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
  // Same trick for `bit --version` — read the version string directly without
  // touching aspects.
  if (isStandaloneVersion(process.argv)) {
    const { getBitVersion } = await import('@teambit/bit.get-bit-version');
    process.stdout.write(`${getBitVersion()}\n`);
    process.exit(0);
  }
  // And for unknown commands: if the entered command isn't in the static
  // index, no aspect can ever register it. Print the familiar suggestion
  // line and exit 1 without booting Harmony.
  if (COMMAND_INDEX.length > 0) {
    const entered = enteredCommandName(process.argv);
    if (entered && entered !== 'server-forever' && !process.argv.includes('--get-yargs-completions')) {
      const known = buildKnownNameSet(COMMAND_INDEX);
      if (!known.has(entered)) {
        const chalkMod = await import('chalk');
        const chalk: any = (chalkMod as any).default || chalkMod;
        const allNames = [...known];
        const didYouMeanMod = await import('didyoumean');
        const didYouMean: any = (didYouMeanMod as any).default || didYouMeanMod;
        didYouMean.returnFirstMatch = true;
        const suggestion = didYouMean(entered, allNames);
        const tail = suggestion
          ? `\nDid you mean ${chalk.bold(Array.isArray(suggestion) ? suggestion[0] : suggestion)}?`
          : "\nsee 'bit help' for additional information.";
        process.stderr.write(`warning: '${chalk.bold(entered)}' is not a valid command.${tail}\n`);
        process.exit(1);
      }
    }
  }

  // Lazy: only load these once we know we're going to actually run a command.
  // Static dynamic imports so the bundler emits a chunk per module while
  // still keeping the help short-circuit fast.
  await import('./hook-require');
  const { autocomplete } = await import('./autocomplete');
  const { ServerCommander, shouldUseBitServer } = await import('./server-commander');
  const { spawnPTY } = await import('./server-forever');

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
  // Deferred dynamic imports — Rollup recognises these as code-split
  // boundaries so the heavy bootstrap lives in its own chunk(s) instead
  // of inlining into the entry.
  const { bootstrap } = await import('./bootstrap');
  const { runCLI } = await import('./load-bit');
  const { handleErrorAndExit } = await import('@teambit/cli');
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
