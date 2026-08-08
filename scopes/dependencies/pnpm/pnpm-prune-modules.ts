import fs from 'fs-extra';
import path from 'path';
import { difference } from 'lodash';
import type * as LockfileFs from '@pnpm/lockfile.fs';
import { depPathToDirName } from '@teambit/dependencies.pnpm.dep-path';

type LockfileFsModule = typeof LockfileFs;
let lockfileFsPromise: Promise<LockfileFsModule> | undefined;

function loadLockfileFs(): Promise<LockfileFsModule> {
  lockfileFsPromise ??= (async () => {
    const { loadEsm } = require('./load-pnpm-esm.cjs') as {
      loadEsm: () => Promise<{ lockfileFs: LockfileFsModule }>;
    };
    const { lockfileFs } = await loadEsm();
    return lockfileFs;
  })();
  return lockfileFsPromise;
}

/**
 * Reads the private lockfile at node_modules/.pnpm/lock.yaml
 * and removes any directories from node_modules/.pnpm that are not listed in the lockfile.
 */
export async function pnpmPruneModules(rootDir: string): Promise<void> {
  const virtualStoreDir = path.join(rootDir, 'node_modules/.pnpm');
  const pkgDirs = await readPackageDirsFromVirtualStore(virtualStoreDir);
  if (pkgDirs.length === 0) return;
  const { readCurrentLockfile } = await loadLockfileFs();
  const lockfile = await readCurrentLockfile(virtualStoreDir, { ignoreIncompatible: false });
  const dirsShouldBePresent = Object.keys(lockfile?.packages ?? {}).map((depPath) => depPathToDirName(depPath));
  await Promise.all(difference(pkgDirs, dirsShouldBePresent).map((dir) => fs.remove(path.join(virtualStoreDir, dir))));
}

/**
 * The project-local virtual store may hold no package directories at all: with the global virtual
 * store enabled the packages live under `<storeDir>/links` (pruned by the engine itself) and only
 * `lock.yaml` and the hoisted `node_modules` remain here. A `lockfileOnly` install leaves the
 * directory missing entirely. Both cases mean "nothing for us to prune".
 */
async function readPackageDirsFromVirtualStore(virtualStoreDir: string): Promise<string[]> {
  let allDirs: string[];
  try {
    allDirs = await fs.readdir(virtualStoreDir);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return allDirs.filter((dir) => dir !== 'lock.yaml' && dir !== 'node_modules');
}
