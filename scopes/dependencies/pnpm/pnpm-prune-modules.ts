import fs from 'fs-extra';
import path from 'path';
import { difference } from 'lodash';
import { readCurrentLockfile } from '@pnpm/lockfile-file';
import { depPathToDirName } from '@teambit/dependencies.pnpm.dep-path';

/**
 * Reads the private lockfile at node_modules/.pnpm/lock.yaml
 * and removes any directories from node_modules/.pnpm that are not listed in the lockfile.
 */
export async function pnpmPruneModules(rootDir: string): Promise<void> {
  const virtualStoreDir = path.join(rootDir, 'node_modules/.pnpm');
  const pkgDirs = await readPackageDirsFromVirtualStore(virtualStoreDir);
  if (pkgDirs.length === 0) return;
  const lockfile = await readCurrentLockfile(virtualStoreDir, { ignoreIncompatible: false });
  const dirsShouldBePresent = Object.keys(lockfile?.packages ?? {}).map((depPath) => depPathToDirName(depPath));
  await Promise.all(difference(pkgDirs, dirsShouldBePresent).map((dir) => fs.remove(path.join(virtualStoreDir, dir))));
}

async function readPackageDirsFromVirtualStore(virtualStoreDir: string): Promise<string[]> {
  const allDirs = await fs.readdir(virtualStoreDir);
  return allDirs.filter((dir) => dir !== 'lock.yaml' && dir !== 'node_modules');
}
