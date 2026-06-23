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
 * build a last-modified index for many directories with a *single* filesystem scan, keyed by each
 * input dir (relative to `cwd`). the value is the max mtime over every file and nested directory
 * under that dir, plus the dir's own mtime. equivalent to calling `getLastModifiedComponentTimestampMs`
 * per dir, but replaces N recursive `globby` scans with one — the hot path on large workspaces.
 *
 * the per-dir value catches content edits (file mtime), additions/deletions in nested dirs (the
 * nested dir's own mtime), and deletions directly under the dir (the dir's own mtime).
 *
 * `node_modules` is ignored by default: component dirs symlink it to the shared workspace
 * `node_modules`, so following it makes the scan ~60x larger and slower. Its contents are also
 * irrelevant to source-derived caches (e.g. auto-detected dependencies come from source imports;
 * install flows clear those caches explicitly).
 */
export async function buildDirsLastModifiedIndex(
  cwd: string,
  dirs: string[],
  ignore: string[] = ['**/node_modules/**']
): Promise<Map<string, number>> {
  const uniqDirs = [...new Set(dirs.filter(Boolean))];
  const dirSet = new Set(uniqDirs);
  const index = new Map<string, number>();
  const bump = (dir: string, mtimeMs: number) => {
    const current = index.get(dir);
    if (current === undefined || mtimeMs > current) index.set(dir, mtimeMs);
  };
  // one recursive scan of all dirs, returning files + nested dirs together with their stats.
  const entries = (await globby(uniqDirs, {
    cwd,
    stats: true,
    onlyFiles: false,
    dot: true,
    ignore,
  })) as unknown as GlobbyStatEntry[];
  for (const entry of entries) {
    const owner = ownerDir(entry.path, dirSet);
    if (owner) bump(owner, entry.stats?.mtimeMs ?? 0);
  }
  // globby returns the *contents* of each dir, not the dir itself; stat the dirs so a deletion
  // directly under one (which only bumps that dir's own mtime) is still reflected.
  await Promise.all(
    uniqDirs.map(async (dir) => {
      const stat = await getPathStatIfExist(nodePath.join(cwd, dir));
      if (stat) bump(dir, stat.mtimeMs);
    })
  );
  return index;
}
