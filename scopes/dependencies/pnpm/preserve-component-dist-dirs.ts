import fs from 'fs-extra';
import path from 'path';
import type { Logger } from '@teambit/logger';

/**
 * Keeps the compiled output of workspace-component packages requireable across an install that
 * rewrites those packages in place.
 *
 * A workspace component's package under node_modules holds links to the component's source files
 * plus a real `dist/` that only `bit compile` writes - the component's source directory has no
 * dist, so the node_modules copies are the only ones anywhere. An install that changes the
 * injected package's dependency set re-imports every copy from the source directory, which drops
 * `dist/` while leaving the package directory itself in place. The removal-oriented preservers
 * (preserve-loaded-virtual-store-dirs.ts, preserve-loaded-nested-pkg-dirs.ts) see nothing missing,
 * yet everything that resolves into the wiped dists afterwards throws MODULE_NOT_FOUND: deferred
 * requires of bit's own already-loaded code, and equally fresh loads of packages this process
 * never touched before - the install flow itself does both right after the package-manager run,
 * when it reloads envs and loads components for the trailing compile that would have regenerated
 * the dists. In bit's own workspace this killed CI's `bit install` outright, and where the errors
 * were caught it pushed env loading into the recompile cascade that OOM-killed smaller containers.
 *
 * A component's dist lives in up to three kinds of places, all covered here:
 * - the root copy: `node_modules/<pkg>`;
 * - injected virtual-store slots: `node_modules/.pnpm/<escaped-pkg>@file+<dir>_<peers>/node_modules/<pkg>`,
 *   one per peer-variant, which other packages' dependency symlinks point into;
 * - root-component roots: `node_modules/.bit_roots/<env>/node_modules/<pkg>`.
 *
 * There is no donor to restore from after the fact, so the snapshot keeps the files alive itself:
 * before the engine runs it hard-links one copy of each component's dist (data is not copied - the
 * clone pins the inodes) into a temporary directory under node_modules. After the install, every
 * copy location that lost its dist gets it back by hard-linking from the clone - the locations are
 * re-discovered post-install, so a slot the install re-keyed to a new peer hash is served too. The
 * peer set never affects the compiled output (it only changes the sibling dependency symlinks), so
 * one clone serves every variant. The set of component packages comes from the install's own
 * project manifests rather than from what the process happens to have loaded - a fresh load after
 * the install breaks on a wiped dist just as hard as a deferred require in loaded code. Restored
 * files are exactly what the pre-install state held, and the trailing compile rewrites them fresh
 * anyway. Best-effort throughout - a failure to preserve leaves things no worse than without this
 * module.
 */

/** where `bit compile` writes a component package's output; the only directory the rewrite drops */
const DIST_DIRNAME = 'dist';

const CLONE_ROOT_PREFIX = '.bit-preserved-dists-';

/** clone roots left behind by a crashed process are reclaimed once they are clearly abandoned */
const STALE_CLONE_ROOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PreservedComponentDist {
  /** package name, e.g. "@teambit/legacy.constants" */
  pkgName: string;
  /** where the hard-link clone of the package's dist lives until the restore */
  clonePath: string;
}

export interface ComponentDistDirsSnapshot {
  /** the workspace's node_modules the copies live under */
  nodeModulesDir: string;
  /** the temporary directory holding all the clones, removed by the restore */
  cloneRootDir: string;
  packages: PreservedComponentDist[];
}

/**
 * hard-link the dist of every given component package that has one under the workspace's
 * node_modules into a temporary clone root. returns undefined when nothing qualifies - the common
 * case in a workspace whose components were never compiled into node_modules.
 */
export async function snapshotComponentDistDirs(
  rootDir: string,
  componentPkgNames: string[],
  logger?: Logger
): Promise<ComponentDistDirsSnapshot | undefined> {
  const startTime = Date.now();
  const nodeModulesDir = path.join(path.resolve(rootDir), 'node_modules');
  const pkgNames = [...new Set(componentPkgNames.filter(Boolean))];
  if (pkgNames.length === 0 || !(await fs.pathExists(nodeModulesDir))) return undefined;
  const cloneRootDir = path.join(nodeModulesDir, `${CLONE_ROOT_PREFIX}${process.pid}`);
  await removeStaleCloneRoots(nodeModulesDir, cloneRootDir, logger);
  const packages: PreservedComponentDist[] = [];
  // slots are consulted only for a package whose root copy has no dist, so compute them lazily
  let slotDirsByPkg: Map<string, string[]> | undefined;
  for (const pkgName of pkgNames) {
    const copyDirs = [path.join(nodeModulesDir, pkgName)];
    // eslint-disable-next-line no-await-in-loop
    let sourceDist = await distDirOf(copyDirs[0]);
    if (!sourceDist) {
      // eslint-disable-next-line no-await-in-loop
      slotDirsByPkg ??= await injectedSlotDirsByPkg(nodeModulesDir);
      for (const slotDir of slotDirsByPkg.get(pkgName) ?? []) {
        // eslint-disable-next-line no-await-in-loop
        sourceDist = await distDirOf(path.join(slotDir, 'node_modules', pkgName));
        if (sourceDist) break;
      }
    }
    if (!sourceDist) continue;
    const clonePath = path.join(cloneRootDir, pkgName.replace(/\//g, '+'), DIST_DIRNAME);
    try {
      // eslint-disable-next-line no-await-in-loop
      await cloneDirWithHardLinks(sourceDist, clonePath);
      packages.push({ pkgName, clonePath });
    } catch (err: any) {
      logger?.warn(`preserve-component-dist-dirs: failed cloning ${sourceDist}: ${err.message}`);
    }
  }
  if (packages.length === 0) {
    await fs.remove(cloneRootDir).catch(() => {});
    return undefined;
  }
  logger?.debug(
    `preserve-component-dist-dirs: cloned the dist of ${packages.length} component package(s) in ${
      Date.now() - startTime
    }ms`
  );
  return { nodeModulesDir, cloneRootDir, packages };
}

/**
 * restore the dist into every copy location the install left without one, then drop the clone
 * root. the locations are discovered now rather than taken from the snapshot, so slots the install
 * re-keyed to a new peer hash are covered. a copy that still has its dist was not rewritten and is
 * left untouched.
 */
export async function restoreWipedComponentDistDirs(
  snapshot: ComponentDistDirsSnapshot | undefined,
  logger?: Logger
): Promise<void> {
  if (!snapshot) return;
  const startTime = Date.now();
  const { nodeModulesDir, cloneRootDir, packages } = snapshot;
  const slotDirsByPkg = await injectedSlotDirsByPkg(nodeModulesDir);
  const bitRootsNodeModules = await bitRootsNodeModulesDirs(nodeModulesDir);
  let restored = 0;
  for (const { pkgName, clonePath } of packages) {
    const copyDirs = [
      path.join(nodeModulesDir, pkgName),
      ...(slotDirsByPkg.get(pkgName) ?? []).map((slotDir) => path.join(slotDir, 'node_modules', pkgName)),
      ...bitRootsNodeModules.map((dir) => path.join(dir, pkgName)),
    ];
    for (const copyDir of copyDirs) {
      // only fill in a dist inside an existing real package directory: a missing dir means the
      // install dropped the copy altogether, and a symlink means the content lives elsewhere -
      // writing "into" it would write through to the target, which is not ours to touch
      // eslint-disable-next-line no-await-in-loop
      const copyDirStat = await fs.lstat(copyDir).catch(() => undefined);
      if (!copyDirStat?.isDirectory()) continue;
      const distPath = path.join(copyDir, DIST_DIRNAME);
      // eslint-disable-next-line no-await-in-loop
      if (!(await isGone(distPath))) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await cloneDirWithHardLinks(clonePath, distPath);
        restored += 1;
      } catch (err: any) {
        logger?.warn(`preserve-component-dist-dirs: failed restoring ${distPath}: ${err.message}`);
      }
    }
  }
  await fs.remove(cloneRootDir).catch(() => {});
  if (restored > 0) {
    logger?.debug(
      `preserve-component-dist-dirs: the install wiped ${restored} component dist cop(ies), restored them in ${
        Date.now() - startTime
      }ms`
    );
  }
}

/**
 * the injected virtual-store slot directories under node_modules/.pnpm, keyed by the package each
 * one holds. an injected slot is named `<escaped-pkg-name>@file+<escaped-dir>[_<peer-suffix>]`
 * (the escaping turns `/` into `+`), so the owner is read straight off the name - pnpm may
 * truncate a long directory name, but the cut lands in the path-and-peers tail, after the name.
 * a slot whose name doesn't parse is simply not served, in line with best-effort.
 */
async function injectedSlotDirsByPkg(nodeModulesDir: string): Promise<Map<string, string[]>> {
  const virtualStoreDir = path.join(nodeModulesDir, '.pnpm');
  let entries: string[];
  try {
    entries = await fs.readdir(virtualStoreDir);
  } catch {
    return new Map();
  }
  const byPkg = new Map<string, string[]>();
  for (const entry of entries) {
    const fileMarkerIndex = entry.indexOf('@file+');
    if (fileMarkerIndex <= 0) continue;
    const pkgName = entry.slice(0, fileMarkerIndex).replace(/\+/g, '/');
    const dirs = byPkg.get(pkgName) ?? [];
    dirs.push(path.join(virtualStoreDir, entry));
    byPkg.set(pkgName, dirs);
  }
  return byPkg;
}

/** the node_modules directory of every root-components root under node_modules/.bit_roots */
async function bitRootsNodeModulesDirs(nodeModulesDir: string): Promise<string[]> {
  const bitRootsDir = path.join(nodeModulesDir, '.bit_roots');
  let entries: string[];
  try {
    entries = await fs.readdir(bitRootsDir);
  } catch {
    return [];
  }
  return entries.map((entry) => path.join(bitRootsDir, entry, 'node_modules'));
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

/** the package copy's dist dir when it is a real directory inside a real package directory */
async function distDirOf(pkgDir: string): Promise<string | undefined> {
  try {
    const pkgDirStat = await fs.lstat(pkgDir);
    if (!pkgDirStat.isDirectory()) return undefined;
    const distPath = path.join(pkgDir, DIST_DIRNAME);
    const distStat = await fs.lstat(distPath);
    return distStat.isDirectory() ? distPath : undefined;
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
          logger?.debug(`preserve-component-dist-dirs: failed removing stale clone root ${fullPath}: ${err.message}`);
        }
      })
  );
}
