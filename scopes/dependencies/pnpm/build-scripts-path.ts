import { createHash } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { delimiter, dirname, join } from 'path';
import { CACHE_ROOT } from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';

/**
 * pnpm's engine spawns dependency lifecycle scripts with the PATH of this
 * process, extended only with the relevant `node_modules/.bin` directories, and
 * its install binding takes no `extraBinPaths` or env overrides — so `process.env`
 * is the one place to shape what those scripts find. Two things go there.
 *
 * The directory of the Node running Bit goes *first*. `node` in a build script
 * — `"install": "node install.js"`, `node-gyp-build`, `prebuild-install` — is
 * whatever PATH resolves, and a native addon built against that Node's headers
 * (ssh2 passes `--target=${process.version}` to node-gyp explicitly) only loads
 * into that Node. What loads the dependency afterwards is this process — `bit
 * run`, envs, `bit build` all `require` it — so the addon has to match this
 * process's Node, and a machine whose own `node` is older than Bit's otherwise
 * segfaults there. The engine also identifies the host Node by `node --version`
 * on PATH and keys the store's side-effects cache and the global virtual store
 * by it, so this keeps those keys matching what Bit loads. npm always prepends
 * `dirname(process.execPath)` for the same reason, and the `bit` wrapper bvm
 * writes exports the same PATH for the whole process.
 *
 * A `node-gyp` wrapper goes *last*. The engine ships no `node-gyp` of its own,
 * so a native package that shells out to `node-gyp rebuild` — `node-gyp-build`,
 * `node-pre-gyp`, or a plain `"install": "node-gyp rebuild"` — fails with
 * `spawn node-gyp ENOENT` unless something else put `node-gyp` on PATH. npm
 * solves this with a wrapper script directory of its own; reproduce it here over
 * the `node-gyp` that Bit depends on. Appended, so a `node-gyp` the user
 * installed themselves still takes precedence.
 */
export function prepareBuildScriptsPath(logger?: Logger): void {
  addNodeToPath();
  addNodeGypToPath(logger);
}

function addNodeToPath(): void {
  const nodeDir = dirname(process.execPath);
  const currentPath = process.env.PATH ?? '';
  if (currentPath.split(delimiter)[0] === nodeDir) return;
  // The inherited value is kept as is after the prefix: an empty component in
  // it means the working directory, so it must not be dropped as noise.
  process.env.PATH = currentPath === '' ? nodeDir : `${nodeDir}${delimiter}${currentPath}`;
}

function addNodeGypToPath(logger?: Logger): void {
  let dir: string;
  try {
    dir = writeShims();
  } catch (err: any) {
    // Not fatal on its own: only a dependency that actually builds with
    // node-gyp will fail, and it may well find one elsewhere on PATH. Warn
    // rather than throw, but warn loudly enough to explain that failure.
    logger?.consoleWarning(`failed to set up node-gyp, packages that build with it may fail to install: ${err}`);
    logger?.warn('failed to set up the node-gyp wrapper', err);
    return;
  }
  const currentPath = process.env.PATH ?? '';
  if (currentPath.split(delimiter).includes(dir)) return;
  process.env.PATH = currentPath === '' ? dir : `${currentPath}${delimiter}${dir}`;
}

/** Writes the wrappers if they are not already there, and returns their directory. */
function writeShims(): string {
  const nodeGypJs = require.resolve('node-gyp/bin/node-gyp.js');
  const node = process.execPath;
  // The wrappers hardcode the two paths, so the directory is keyed by them:
  // another Bit install, or the same one under a different Node, resolves to a
  // directory of its own instead of overwriting this one — which would point
  // concurrent installs at the wrong node-gyp, and would make two Bit versions
  // used side by side rewrite the wrapper on every install. What accumulates is
  // two ~100-byte files per distinct pair, so nothing needs pruning.
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
  if (readIfExists(target) === content) return;
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
    // Losing that race is a success, not a failure — on Windows the other
    // process's rename would have thrown.
    if (readIfExists(target) !== content) throw err;
  }
}

function readIfExists(target: string): string | undefined {
  try {
    return readFileSync(target, 'utf8');
  } catch (err: any) {
    // Read and handle the absence, rather than testing for it first: another
    // Bit process replacing the wrapper could remove it between the two.
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
