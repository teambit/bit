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

async function readPackageDirsFromVirtualStore(virtualStoreDir: string): Promise<string[]> {
  const allDirs = await fs.readdir(virtualStoreDir);
  return allDirs.filter((dir) => dir !== 'lock.yaml' && dir !== 'node_modules');
}
