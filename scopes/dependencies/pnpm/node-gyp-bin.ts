import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { delimiter, dirname, join } from 'path';
import { CACHE_ROOT } from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';

/**
 * pnpm's engine spawns dependency lifecycle scripts with the PATH of this
 * process, extended only with the relevant `node_modules/.bin` directories. It
 * ships no `node-gyp` of its own, so a native package that shells out to
 * `node-gyp rebuild` — `node-gyp-build`, `node-pre-gyp`, or a plain
 * `"install": "node-gyp rebuild"` — fails with `spawn node-gyp ENOENT` unless
 * something else put `node-gyp` on PATH.
 *
 * npm solves this with a wrapper script directory it prepends to PATH, and Bit
 * used to inherit that wrapper from `@pnpm/npm-lifecycle`. Reproduce it here
 * over the `node-gyp` that Bit depends on.
 *
 * The directory is *appended*, so a `node-gyp` the user installed themselves
 * still takes precedence, and it goes on `process.env` because the N-API
 * install binding accepts no `extraBinPaths`.
 */
export function addNodeGypToPath(logger?: Logger): void {
  const dir = getShimDir(logger);
  if (!dir) return;
  const currentPath = process.env.PATH ?? '';
  if (currentPath.split(delimiter).includes(dir)) return;
  process.env.PATH = currentPath === '' ? dir : `${currentPath}${delimiter}${dir}`;
}

/** `undefined` before the first attempt, `null` once an attempt has failed. */
let shimDir: string | null | undefined;

function getShimDir(logger?: Logger): string | null {
  if (shimDir === undefined) {
    try {
      shimDir = createShimDir();
    } catch (err: any) {
      shimDir = null;
      logger?.debug(`failed to set up the node-gyp shim, native packages may fail to build: ${err.message}`);
    }
  }
  return shimDir;
}

function createShimDir(): string {
  const nodeGypJs = require.resolve('node-gyp/bin/node-gyp.js');
  const node = process.execPath;
  // Keyed by the paths baked into the wrappers, so a Bit upgrade (new node-gyp)
  // or a different Node interpreter gets its own directory rather than
  // rewriting scripts that a concurrent install may be executing.
  const key = createHash('sha1').update(`${node}\n${nodeGypJs}`).digest('hex').slice(0, 12);
  const dir = join(CACHE_ROOT, 'node-gyp-bin', key);
  // Written on Windows too: the default shell there is cmd.exe, but a
  // `scriptShell` pointing at bash needs the POSIX wrapper.
  writeShim(join(dir, 'node-gyp'), `#!/bin/sh\nexec ${shQuote(node)} ${shQuote(nodeGypJs)} "$@"\n`);
  if (process.platform === 'win32') {
    writeShim(join(dir, 'node-gyp.cmd'), `@echo off\r\n"${node}" "${nodeGypJs}" %*\r\n`);
  }
  return dir;
}

function writeShim(target: string, content: string): void {
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  // Write and rename, so the wrapper only ever appears at its final path fully
  // written and executable, whichever of several concurrent Bit processes wins.
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, content);
    chmodSync(tmp, 0o755); // not umask-masked, unlike writeFileSync's `mode`
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    // On Windows a rename over an existing file throws; another process getting
    // there first is a success, not a failure.
    if (!existsSync(target)) throw err;
  }
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
