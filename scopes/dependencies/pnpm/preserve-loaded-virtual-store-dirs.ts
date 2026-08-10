import fs from 'fs-extra';
import path from 'path';
import type { Logger } from '@teambit/logger';

/**
 * Keeps packages the running process has loaded from `node_modules/.pnpm` requireable across an
 * install that relocates them.
 *
 * pnpm keys a virtual-store directory by the package's peer-resolution hash, so an install that
 * changes the dependency set gives the same name@version a NEW directory and deletes the one this
 * process loaded its modules from. Node keeps the loaded module objects, but not the files - so any
 * require the loaded code deferred past load time resolves against the deleted directory and throws
 * MODULE_NOT_FOUND. The envs that used to be core aspects made this fatal: they are now ordinary
 * packages resolved out of the workspace's virtual store (on master they were core aspects,
 * resolved from bit's own installation, which no workspace install relocates), and e.g.
 * `@teambit/aspect` defers `require('./babel/babel-config')` until `getCompiler()` is called -
 * which the install flow itself does right after the package-manager run, when it compiles
 * components and reloads envs. The whole install then dies with
 * `Cannot find module './babel/babel-config'`.
 *
 * Replacing the in-memory instances instead is not an option: every reload path (reloadMovedEnvs,
 * loading components as aspects) has to consult the registered env to do its work, and consulting
 * it is exactly what throws. So the fix follows the same rule an OS applies to a running binary's
 * deleted files: what the process has loaded stays available for the process's lifetime. The
 * snapshot records which virtual-store directories back modules in `require.cache`; after the
 * install, any of them that vanished is restored from its re-keyed twin - same name@version, new
 * peer hash - whose package content is identical (it comes from the same tarball; the peer set only
 * affects the dependency symlinks alongside it, which are relative and stay valid from the restored
 * location).
 *
 * The restored directory is intentionally absent from the lockfile. `pnpmPruneModules` skips
 * directories that back `require.cache` entries for the same reason this module exists, and a later
 * command's prune - whose process has nothing loaded from it - removes it.
 *
 * Limitation: only CJS modules appear in `require.cache`, so only they are protected. That covers
 * the legacy core envs, which are all CJS.
 */
export interface LoadedVirtualStoreDir {
  /** directory name directly under node_modules/.pnpm, e.g. "@teambit+aspect@1.0.1042_<peers>" */
  dirName: string;
  /** absolute path of that directory */
  dirPath: string;
  /** name of the package the cached modules belong to, e.g. "@teambit/aspect" */
  pkgName: string;
}

/**
 * the virtual-store directories currently backing entries in require.cache, with the package each
 * one holds. require.cache keys are realpaths, so a module reached through a dependency symlink is
 * attributed to the directory that really owns it.
 */
export function snapshotLoadedVirtualStoreDirs(rootDir: string): LoadedVirtualStoreDir[] {
  const virtualStoreDir = path.join(path.resolve(rootDir), 'node_modules', '.pnpm');
  const prefix = `${virtualStoreDir}${path.sep}`;
  const byDirName = new Map<string, LoadedVirtualStoreDir>();
  for (const filename of Object.keys(require.cache)) {
    if (!filename.startsWith(prefix)) continue;
    const relative = filename.slice(prefix.length).split(path.sep);
    const dirName = relative[0];
    if (!dirName || byDirName.has(dirName)) continue;
    const pkgName = parsePkgName(relative);
    if (!pkgName) continue;
    byDirName.set(dirName, { dirName, dirPath: path.join(virtualStoreDir, dirName), pkgName });
  }
  return [...byDirName.values()];
}

/**
 * restore every snapshotted directory the install removed, copying it from a directory holding the
 * same name@version under a different peer hash. best-effort: a failure to restore leaves things no
 * worse than without this module.
 */
export async function restoreRemovedLoadedVirtualStoreDirs(
  snapshot: LoadedVirtualStoreDir[],
  logger?: Logger
): Promise<void> {
  if (snapshot.length === 0) return;
  const removed: LoadedVirtualStoreDir[] = [];
  for (const dir of snapshot) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await fs.pathExists(dir.dirPath))) removed.push(dir);
  }
  if (removed.length === 0) return;
  const virtualStoreDir = path.dirname(removed[0].dirPath);
  let currentDirs: string[];
  try {
    currentDirs = await fs.readdir(virtualStoreDir);
  } catch {
    return; // no virtual store left (e.g. hoisted install) - nothing to restore from
  }
  await Promise.all(
    removed.map(async ({ dirName, dirPath, pkgName }) => {
      const donorDirName = findDonorDirName(dirName, pkgName, currentDirs);
      if (!donorDirName) {
        logger?.debug(
          `preserve-loaded-virtual-store-dirs: ${dirName} was removed by the install and no same-version donor exists; ` +
            `modules loaded from it may fail deferred requires`
        );
        return;
      }
      const donorPath = path.join(virtualStoreDir, donorDirName);
      try {
        // guard against a donor that does not actually hold the package's files
        if (!(await fs.pathExists(path.join(donorPath, 'node_modules', pkgName)))) return;
        // dereference:false keeps the donor's dependency symlinks as symlinks; they are relative
        // (../<other-dir>/node_modules/<dep>) and stay valid from the restored location.
        await fs.copy(donorPath, dirPath, { dereference: false, overwrite: false, errorOnExist: false });
        logger?.debug(
          `preserve-loaded-virtual-store-dirs: restored ${dirName} (loaded by this process, removed by the install) from ${donorDirName}`
        );
      } catch (err: any) {
        logger?.warn(`preserve-loaded-virtual-store-dirs: failed restoring ${dirName}: ${err.message}`);
      }
    })
  );
}

/**
 * the directory names under the given virtual store that back entries in require.cache. used by
 * pnpmPruneModules to leave alone what the running process is using.
 */
export function loadedVirtualStoreDirNames(virtualStoreDir: string): Set<string> {
  const prefix = `${path.resolve(virtualStoreDir)}${path.sep}`;
  const dirNames = new Set<string>();
  for (const filename of Object.keys(require.cache)) {
    if (!filename.startsWith(prefix)) continue;
    const [dirName] = filename.slice(prefix.length).split(path.sep);
    if (dirName) dirNames.add(dirName);
  }
  return dirNames;
}

/**
 * a directory holding the same name@version as the missing one, under a different peer hash.
 * exported for tests.
 *
 * the version is read off the missing directory's own name rather than parsed structurally: the
 * name is `<escaped-pkg-name>@<version>[_<peer-hash>]` where the escaped name (\/ replaced by +) is
 * known exactly, and `_` cannot appear in a semver version, so everything between the name's `@`
 * and the first `_` after it is the version.
 */
export function findDonorDirName(missingDirName: string, pkgName: string, currentDirs: string[]): string | undefined {
  const escapedName = pkgName.replace(/\//g, '+');
  const namePrefix = `${escapedName}@`;
  if (!missingDirName.startsWith(namePrefix)) return undefined;
  const version = missingDirName.slice(namePrefix.length).split('_')[0];
  const exact = `${namePrefix}${version}`;
  return currentDirs.find((dir) => dir !== missingDirName && (dir === exact || dir.startsWith(`${exact}_`)));
}

/** the package name owning a file at .pnpm/<dir>/node_modules/<pkgName>/..., or undefined */
function parsePkgName(relativeSegments: string[]): string | undefined {
  // relativeSegments: [<dirName>, 'node_modules', <segment>, ...]
  if (relativeSegments[1] !== 'node_modules') return undefined;
  const first = relativeSegments[2];
  if (!first) return undefined;
  if (first.startsWith('@')) {
    const second = relativeSegments[3];
    return second ? `${first}/${second}` : undefined;
  }
  return first;
}
