import fs from 'fs-extra';
import path from 'path';
import { difference } from 'lodash';
import * as nodeApi from '@pnpm/napi';
import { depPathToDirName } from '@teambit/dependencies.pnpm.dep-path';
import { loadedVirtualStoreDirNames } from './preserve-loaded-virtual-store-dirs';

/**
 * Reads the private lockfile at node_modules/.pnpm/lock.yaml
 * and removes any directories from node_modules/.pnpm that are not listed in the lockfile.
 */
export async function pnpmPruneModules(rootDir: string): Promise<void> {
  const virtualStoreDir = path.join(rootDir, 'node_modules/.pnpm');
  const pkgDirs = await readPackageDirsFromVirtualStore(virtualStoreDir);
  if (pkgDirs.length === 0) return;
  const lockfile = await nodeApi.readLockfile({ dir: rootDir, kind: 'current' });
  // No current lockfile means nothing is known about what was materialized,
  // not that nothing belongs here — pruning against an empty set would empty
  // the virtual store and leave the workspace needing a reinstall.
  if (lockfile == null) return;
  // The virtual store's directory names come from the peer-suffixed dep
  // paths, which is what `snapshots` is keyed by; `packages` is keyed
  // without the suffix and would not match.
  const snapshots = (lockfile.snapshots ?? {}) as Record<string, unknown>;
  const dirsShouldBePresent = Object.keys(snapshots).map((depPath) => depPathToDirName(depPath));
  const extraneous = difference(pkgDirs, dirsShouldBePresent);
  // the usual case, and the one worth keeping cheap: scanning the loaded modules below is
  // proportional to how much this process has loaded, and with nothing to remove it decides nothing
  if (extraneous.length === 0) return;
  // never remove a directory the running process has loaded modules from. an install that re-keys
  // a loaded package to a new peer hash restores the old directory so deferred requires keep
  // working (see preserve-loaded-virtual-store-dirs.ts); that directory is intentionally absent
  // from the lockfile, and deleting it here would re-break exactly what the restore fixed. a later
  // command's prune, whose process has nothing loaded from it, cleans it up.
  const loadedByThisProcess = loadedVirtualStoreDirNames(virtualStoreDir);
  await Promise.all(
    extraneous.filter((dir) => !loadedByThisProcess.has(dir)).map((dir) => fs.remove(path.join(virtualStoreDir, dir)))
  );
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
