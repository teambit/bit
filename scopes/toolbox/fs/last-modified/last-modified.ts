import nodePath from 'path';
import globby from 'globby';
import type { Stats } from 'fs-extra';
import fs from 'fs-extra';
import { compact } from 'lodash';

type GlobbyStatEntry = { path: string; stats?: { mtimeMs: number } };

/**
 * check recursively all the sub-directories as well
 */
async function getLastModifiedDirTimestampMs(rootDir: string): Promise<number> {
  const allDirs = await globby(rootDir, {
    onlyDirectories: true,
    // ignore: ['**/node_modules/**'], // need to think about it more. sometimes we do want to invalidate cache upon node_modules changes inside component dir
    // stats: true // todo: consider retrieving the stats from here.
  });
  allDirs.push(rootDir);
  return getLastModifiedPathsTimestampMs(allDirs);
}

export async function getLastModifiedPathsTimestampMs(paths: string[]): Promise<number> {
  const pathsStats = await Promise.all(paths.map((dir) => getPathStatIfExist(dir)));
  const statsWithoutNull = compact(pathsStats);
  const timestamps = statsWithoutNull.map((stat) => stat.mtimeMs);
  return Math.max(...timestamps);
}

export async function getLastModifiedComponentTimestampMs(rootDir: string, files: string[]): Promise<number> {
  const lastModifiedDirs = await getLastModifiedDirTimestampMs(rootDir);
  const lastModifiedFiles = await getLastModifiedPathsTimestampMs(files);
  return Math.max(lastModifiedDirs, lastModifiedFiles);
}

export async function getPathStatIfExist(path: string): Promise<Stats | null> {
  try {
    return await fs.stat(path);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * find the directory in `dirSet` that owns `relPath` — the deepest dir that is a path-prefix of it.
 */
function ownerDir(relPath: string, dirSet: Set<string>): string | undefined {
  const parts = relPath.split('/');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const candidate = parts.slice(0, i).join('/');
    if (dirSet.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * build a last-modified index for many component dirs with a few batched filesystem scans, keyed by
 * each input dir (relative to `cwd`). replaces the old per-component recursive `globby` (the hot path
 * on large workspaces) while preserving the exact freshness signals the dependency cache depends on.
 *
 * what's scanned, and why (the dependency auto-detect — whose result is cached — never traverses
 * *into* a node_modules package, so the package internals and the transitive store are irrelevant):
 * - the component's own source files + dirs (catches import/source changes). the deep `node_modules`
 *   subtree is skipped here — a package's internals can't change the cached result.
 * - each component's `node_modules` and `node_modules/@scope` directory mtimes — these catch a direct
 *   dependency added / removed / version-relinked, which is how the meaningful node_modules changes
 *   reach a component (install/link rewrite the symlink entry, bumping the containing dir). a direct
 *   dep's `package.json` `componentId`/`name` change (package <-> component) likewise goes through a
 *   relink, so it's covered by the same dir-mtime signal without scanning every manifest.
 *
 * per-dir value = max mtime over all of the above, plus the dir's own mtime (deletion directly under it).
 */
export async function buildComponentDirsLastModifiedIndex(cwd: string, dirs: string[]): Promise<Map<string, number>> {
  const uniqDirs = [...new Set(dirs.filter(Boolean))];
  const dirSet = new Set(uniqDirs);
  const index = new Map<string, number>();
  const bump = (dir: string, mtimeMs: number) => {
    const current = index.get(dir);
    if (current === undefined || mtimeMs > current) index.set(dir, mtimeMs);
  };
  const collect = (entries: GlobbyStatEntry[]) => {
    for (const entry of entries) {
      const owner = ownerDir(entry.path, dirSet);
      if (owner) bump(owner, entry.stats?.mtimeMs ?? 0);
    }
  };

  // 1. source: recurse the component dirs, skipping the deep node_modules subtree.
  collect(
    (await globby(uniqDirs, {
      cwd,
      stats: true,
      onlyFiles: false,
      dot: true,
      ignore: ['**/node_modules/**'],
    })) as unknown as GlobbyStatEntry[]
  );

  // 2. the node_modules structure the deps cache depends on: the `@scope` dir mtimes (catch a scoped
  //    dep added/removed/relinked within an existing scope). single-segment globs — they return the
  //    scope dirs themselves, never recursing into them (a bare `node_modules` glob *would* recurse
  //    the whole symlinked tree, so the `node_modules` dir mtime is taken via a direct stat below).
  const scopeDirPatterns = uniqDirs.map((dir) => `${dir}/node_modules/@*`);
  collect(
    (await globby(scopeDirPatterns, {
      cwd,
      stats: true,
      onlyFiles: false,
      dot: true,
      followSymbolicLinks: false,
    })) as unknown as GlobbyStatEntry[]
  );

  // stat directly (not globbed): each rootDir — globby returns its *contents*, not the dir, so a
  // deletion directly under it would otherwise be missed; and each `node_modules` dir — its mtime
  // catches a top-level dep added/removed (a bare-dir glob would recurse the whole tree).
  await Promise.all(
    uniqDirs.flatMap((dir) => [
      getPathStatIfExist(nodePath.join(cwd, dir)).then((stat) => stat && bump(dir, stat.mtimeMs)),
      getPathStatIfExist(nodePath.join(cwd, dir, 'node_modules')).then((stat) => stat && bump(dir, stat.mtimeMs)),
    ])
  );
  return index;
}
