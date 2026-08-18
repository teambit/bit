import fs from 'fs-extra';
import path from 'path';
import type { Logger } from '@teambit/logger';
import { dirSpellings, loadedModuleFiles } from './loaded-module-files';
import { parsePkgDir } from './preserve-loaded-nested-pkg-dirs';

/**
 * Keeps the compiled output of workspace-component packages the running process has loaded
 * requireable across an install that rewrites those packages in place.
 *
 * A workspace component's package under node_modules (marked `_bit_local` by node-modules-linker)
 * holds links to the component's source files plus a real `dist/` that only `bit compile` writes -
 * the source directory has no dist, so the node_modules copy is the only one anywhere. An install
 * that changes the injected package's dependency set re-imports it from the source directory,
 * which drops `dist/` entirely. The package directory itself survives, so the removal-oriented
 * preservers (preserve-loaded-virtual-store-dirs.ts, preserve-loaded-nested-pkg-dirs.ts) see
 * nothing missing - yet node keeps only the loaded module objects, not the files, and any require
 * the loaded code deferred past load time now resolves into the wiped dist and throws
 * MODULE_NOT_FOUND. The install flow itself does exactly that right after the package-manager run:
 * reloading envs and loading components for the trailing compile executes deferred requires in
 * bit's own already-loaded code (e.g. `legacy.consumer-component` deferring
 * `require('./exceptions/main-file-removed')`), so the very install that would regenerate the
 * dists dies before reaching its compile step. In bit's own workspace this killed CI's
 * `bit install` outright, burying the error under "failed to log the error properly" because the
 * error handler's own fresh requires hit the same wiped dists.
 *
 * Unlike the removal cases there is no donor to restore from after the fact, so the snapshot has
 * to keep the files alive itself: it hard-links each loaded package's dist into a temporary
 * directory under node_modules before the engine runs (no data is copied - the clone pins the
 * inodes), and after the install any dist that vanished is moved back from its clone. The restored
 * files are exactly the ones the in-memory modules were loaded from, and the trailing compile
 * rewrites them fresh anyway. Best-effort throughout - a failure to preserve leaves things no
 * worse than without this module.
 */

/** where `bit compile` writes a component package's output; the only directory the rewrite drops */
const DIST_DIRNAME = 'dist';

const CLONE_ROOT_PREFIX = '.bit-preserved-dists-';

/** clone roots left behind by a crashed process are reclaimed once they are clearly abandoned */
const STALE_CLONE_ROOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface LoadedComponentDistDir {
  /** absolute path of the package's dist dir, e.g. <ws>/node_modules/@teambit/legacy.constants/dist */
  distPath: string;
  /** where the hard-link clone lives until the restore */
  clonePath: string;
}

export interface ComponentDistDirsSnapshot {
  /** the temporary directory holding all the clones, removed by the restore */
  cloneRootDir: string;
  dirs: LoadedComponentDistDir[];
}

/**
 * hard-link the dist of every loaded `_bit_local` package under the workspace's node_modules
 * (outside the virtual store, which is never rewritten in place) into a temporary clone root.
 * returns undefined when nothing qualifies - the common case in a workspace whose components were
 * not loaded by this process.
 */
export async function snapshotLoadedComponentDistDirs(
  rootDir: string,
  logger?: Logger
): Promise<ComponentDistDirsSnapshot | undefined> {
  const startTime = Date.now();
  const nodeModulesDir = path.join(path.resolve(rootDir), 'node_modules');
  const roots = dirSpellings(nodeModulesDir).map((dir) => `${dir}${path.sep}`);
  // cloneKey is the package dir relative to its node_modules root with separators escaped, so two
  // copies of the same package (the root one and a .bit_roots one, say) get distinct clone dirs
  const pkgDirs = new Map<string, { dirPath: string; cloneKey: string }>();
  for (const filename of loadedModuleFiles()) {
    const root = roots.find((prefix) => filename.startsWith(prefix));
    if (!root) continue;
    if (filename.slice(root.length).split(path.sep)[0] === '.pnpm') continue;
    const pkg = parsePkgDir(filename);
    if (!pkg || pkgDirs.has(pkg.dirPath)) continue;
    const cloneKey = pkg.dirPath.slice(root.length).split(path.sep).join('+');
    pkgDirs.set(pkg.dirPath, { dirPath: pkg.dirPath, cloneKey });
  }
  if (pkgDirs.size === 0) return undefined;
  const cloneRootDir = path.join(nodeModulesDir, `${CLONE_ROOT_PREFIX}${process.pid}`);
  await removeStaleCloneRoots(nodeModulesDir, cloneRootDir, logger);
  const dirs: LoadedComponentDistDir[] = [];
  for (const { dirPath, cloneKey } of pkgDirs.values()) {
    // eslint-disable-next-line no-await-in-loop
    const distPath = await distDirOfLocalPkg(dirPath);
    if (!distPath) continue;
    const clonePath = path.join(cloneRootDir, cloneKey, DIST_DIRNAME);
    try {
      // eslint-disable-next-line no-await-in-loop
      await cloneDirWithHardLinks(distPath, clonePath);
      dirs.push({ distPath, clonePath });
    } catch (err: any) {
      logger?.warn(`preserve-loaded-component-dist-dirs: failed cloning ${distPath}: ${err.message}`);
    }
  }
  if (dirs.length === 0) {
    await fs.remove(cloneRootDir).catch(() => {});
    return undefined;
  }
  logger?.debug(
    `preserve-loaded-component-dist-dirs: cloned the dist of ${dirs.length} loaded package(s) in ${
      Date.now() - startTime
    }ms`
  );
  return { cloneRootDir, dirs };
}

/**
 * restore every snapshotted dist the install wiped, then drop the clone root. a dist still present
 * was not rewritten (the engine drops the directory wholesale or leaves the package alone), so it
 * is left untouched.
 */
export async function restoreWipedLoadedComponentDistDirs(
  snapshot: ComponentDistDirsSnapshot | undefined,
  logger?: Logger
): Promise<void> {
  if (!snapshot) return;
  const startTime = Date.now();
  let restored = 0;
  for (const { distPath, clonePath } of snapshot.dirs) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await isGone(distPath))) continue;
    // the package path may now hold a symlink (an install that switched the component to a plain
    // link); restoring "into" it would write through to the target, which is not ours to touch
    // eslint-disable-next-line no-await-in-loop
    const pkgDirStat = await fs.lstat(path.dirname(distPath)).catch(() => undefined);
    if (pkgDirStat && !pkgDirStat.isDirectory()) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.move(clonePath, distPath);
      restored += 1;
    } catch (err: any) {
      logger?.warn(`preserve-loaded-component-dist-dirs: failed restoring ${distPath}: ${err.message}`);
    }
  }
  await fs.remove(snapshot.cloneRootDir).catch(() => {});
  if (restored > 0) {
    logger?.debug(
      `preserve-loaded-component-dist-dirs: the install wiped ${restored} loaded dist dir(s), restored them in ${
        Date.now() - startTime
      }ms`
    );
  }
}

/** whether nothing at all occupies the path anymore - a symlink left pointing anywhere still counts as kept */
async function isGone(dirPath: string): Promise<boolean> {
  try {
    await fs.lstat(dirPath);
    return false;
  } catch {
    return true;
  }
}

/** the package's dist dir when the package is a workspace component's local copy, else undefined */
async function distDirOfLocalPkg(pkgDir: string): Promise<string | undefined> {
  let manifest: { _bit_local?: unknown };
  try {
    manifest = await fs.readJson(path.join(pkgDir, 'package.json'));
  } catch {
    return undefined;
  }
  if (manifest?._bit_local !== true) return undefined;
  const distPath = path.join(pkgDir, DIST_DIRNAME);
  try {
    const stat = await fs.lstat(distPath);
    return stat.isDirectory() ? distPath : undefined;
  } catch {
    return undefined;
  }
}

/**
 * clone a directory tree by hard-linking its files - dir entries only, no data copies, so cloning
 * is cheap and the clone keeps the inodes alive if the install unlinks the originals. entries run
 * in parallel per directory; dist trees are shallow and wide, which this shape fits.
 */
async function cloneDirWithHardLinks(src: string, dest: string): Promise<void> {
  await fs.mkdirp(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) return cloneDirWithHardLinks(srcPath, destPath);
      if (entry.isFile()) {
        // a filesystem refusing the link (or a file racing away) falls back to a real copy
        return fs.link(srcPath, destPath).catch(() => fs.copy(srcPath, destPath).catch(() => {}));
      }
      if (entry.isSymbolicLink()) {
        // not expected inside a dist; preserved as a link for completeness
        return fs.copy(srcPath, destPath, { dereference: false }).catch(() => {});
      }
      return undefined;
    })
  );
}

/**
 * reclaim clone roots a previous process left behind: always this process's own (a pid reuse is a
 * dead owner by definition), and any other's once it is old enough to be clearly abandoned - a
 * fresher one may belong to a concurrently running install.
 */
async function removeStaleCloneRoots(nodeModulesDir: string, ownCloneRootDir: string, logger?: Logger): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(nodeModulesDir);
  } catch {
    return;
  }
  const staleBefore = Date.now() - STALE_CLONE_ROOT_MAX_AGE_MS;
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(CLONE_ROOT_PREFIX))
      .map(async (entry) => {
        const fullPath = path.join(nodeModulesDir, entry);
        try {
          if (fullPath !== ownCloneRootDir) {
            const stat = await fs.lstat(fullPath);
            if (stat.mtimeMs >= staleBefore) return;
          }
          await fs.remove(fullPath);
        } catch (err: any) {
          logger?.debug(
            `preserve-loaded-component-dist-dirs: failed removing stale clone root ${fullPath}: ${err.message}`
          );
        }
      })
  );
}
