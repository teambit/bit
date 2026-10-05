/* eslint-disable no-console */
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import type { BundlePaths } from './config';
import { APP_FILE_BASE_NAME } from './config';
import { runEsbuild } from './run-esbuild';

const execFileP = promisify(execFile);

/**
 * Node's Single Executable Application: the CLI as one binary.
 *
 * What "single" does and does not mean here. The *JavaScript* is fully embedded - the binary carries
 * the whole 67 MB bundle. It still needs `bundle/` on disk next to it, for two reasons that are
 * properties of bit, not of SEA:
 *   - the externals (`@pnpm/napi`, `@rspack/core`, ...) are native or per-platform packages, so they
 *     could never be inlined into any bundle;
 *   - bit reads data files (`workspace-template.jsonc`, typescript's `lib.*.d.ts`, the worker entry)
 *     from disk with `fs`, keyed off `__dirname`.
 * Embedding those too would mean routing every such read through `sea.getAsset()`, which is a
 * source-level change to a dozen call sites. See `bundle-plan.md` §10.
 */
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

async function run(cmd: string, args: string[], cwd: string) {
  try {
    return await execFileP(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch (err: any) {
    throw new Error(`[bundle:sea] "${cmd} ${args.join(' ')}" failed: ${err.stderr || err.message}`);
  }
}

export async function buildSea(
  paths: BundlePaths,
  seaEntryFilePath: string,
  opts: { minify?: boolean; externals: string[]; uiBundling?: boolean }
) {
  const seaJsPath = join(paths.bundleDir, `${APP_FILE_BASE_NAME}.sea.js`);
  const blobPath = join(paths.bundleDir, `${APP_FILE_BASE_NAME}.blob`);
  const exePath = join(paths.rootOutDir, 'bit-app');

  const result = await runEsbuild({
    entryFilePath: seaEntryFilePath,
    outFilePath: seaJsPath,
    repoRoot: paths.packagesRoot,
    minify: opts.minify,
    externals: opts.externals,
    seaWrapper: true,
    label: 'bit sea bundle',
    uiBundling: opts.uiBundling,
  });
  if (result.errors.length) throw new Error(`[bundle:sea] esbuild reported ${result.errors.length} errors`);

  const seaConfigPath = join(paths.bundleDir, 'sea-config.json');
  await fs.writeJson(
    seaConfigPath,
    {
      main: seaJsPath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      // startup snapshot of a bundle this size is the difference between ~1s and ~0.6s; same trick
      // the `bin/bit` launcher gets from `module.enableCompileCache()`
      useCodeCache: true,
    },
    { spaces: 2 }
  );

  console.log('[bundle:sea] generating blob...');
  await run(process.execPath, ['--experimental-sea-config', seaConfigPath], paths.bundleDir);

  console.log('[bundle:sea] injecting into a copy of node...');
  await fs.copy(process.execPath, exePath, { dereference: true });
  await fs.chmod(exePath, 0o755);

  const isMac = process.platform === 'darwin';
  if (isMac) await run('codesign', ['--remove-signature', exePath], paths.rootOutDir);

  const postjectArgs = [
    'postject',
    exePath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    SENTINEL_FUSE,
    ...(isMac ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ];
  await run('npx', ['--yes', ...postjectArgs], paths.rootOutDir);

  if (isMac) await run('codesign', ['--sign', '-', exePath], paths.rootOutDir);

  const { size } = await fs.stat(exePath);
  return { exePath, sizeMb: +(size / 1024 / 1024).toFixed(2), nodeVersion: process.version };
}
