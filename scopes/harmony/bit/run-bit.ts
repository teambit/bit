/* eslint-disable import/first */

import fs from 'fs';
consoleFileReadUsages();

import gracefulFs from 'graceful-fs';
// monkey patch fs module to avoid EMFILE error (especially when running watch operation)
gracefulFs.gracefulify(fs);

import './hook-require';
import { bootstrap } from './bootstrap';
import { handleErrorAndExit } from '@teambit/cli/dist/handle-errors.js';
import type { Aspect } from '@teambit/harmony';
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
  // don't place this "process.on" block on the top. otherwise, "server-forever" will show "uncaughtException" on any error.
  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('uncaughtException', err);
    process.exit(1);
  });
  try {
    await bootstrap();
    if (
      !additionalAspects?.length &&
      process.env.BIT_RUST_CLIENT_VCS === 'on' &&
      process.argv.length === 4 &&
      ['mini-status', 'ms', 'status', 's'].includes(process.argv[2]) &&
      ['--json', '-j'].includes(process.argv[3])
    ) {
      if (['status', 's'].includes(process.argv[2])) {
        const { runRustStatus } = await import('./rust-status');
        if (await runRustStatus()) return;
      } else {
        const { runRustMiniStatus } = await import('./rust-mini-status');
        if (await runRustMiniStatus()) return;
      }
    }
    if (!additionalAspects?.length && ['install', 'in'].includes(process.argv[2])) {
      const { runRustInstall } = await import('./rust-install');
      if (await runRustInstall()) return;
    }
    if (
      !additionalAspects?.length &&
      process.env.BIT_RUST_CLIENT_VCS === 'on' &&
      process.argv[2] === 'diff' &&
      [4, 5].includes(process.argv.length) &&
      ['--json', '-j'].includes(process.argv.at(-1)!)
    ) {
      const { runRustDiff } = await import('./rust-diff');
      if (await runRustDiff()) return;
    }
    if (
      !additionalAspects?.length &&
      process.env.BIT_RUST_CLIENT_VCS === 'on' &&
      (['checkout', 'U', 'merge', 'snap', 'tag', 't', 'fetch', 'import', 'export', 'e'].includes(process.argv[2]) ||
        (process.argv[2] === 'lane' && ['merge', 'merge-abort'].includes(process.argv[3])))
    ) {
      if (['export', 'e'].includes(process.argv[2])) {
        const { runRustWorkspaceOutbound } = await import('./rust-workspace-outbound');
        if (await runRustWorkspaceOutbound()) return;
      } else if (['fetch', 'import'].includes(process.argv[2])) {
        const { runRustWorkspaceInbound } = await import('./rust-workspace-inbound');
        if (await runRustWorkspaceInbound()) return;
      } else {
        const { runRustWorkspaceCommand } = await import('./rust-workspace-command');
        if (await runRustWorkspaceCommand()) return;
      }
    }
    const { runCLI } = await import('./load-bit');
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
