import globby from 'globby';
import type { Stats } from 'fs-extra';
import fs from 'fs-extra';
import { compact } from 'lodash';

/**
 * last-modified mtime of a component's directory structure (recursively), used as the dependency
 * fs-cache freshness signal.
 *
 * the source tree is scanned recursively, but the scan stops at the `node_modules` boundary: the
 * dependency auto-detect (whose cached result this guards) never traverses *into* a package, so the
 * package internals and the transitive store are irrelevant — recursing `node_modules` followed the
 * symlinked store and made this scan ~60x larger. Instead only the `node_modules` dir and its
 * `@scope` dirs' mtimes are taken: a direct dep added / removed / version-relinked / componentId-
 * changed all go through a relink that rewrites the symlink entry, bumping the containing dir.
 */
async function getLastModifiedDirTimestampMs(rootDir: string): Promise<number> {
  // source subdirectories, excluding the deep node_modules subtree.
  const sourceDirs = await globby(rootDir, {
    onlyDirectories: true,
    ignore: ['**/node_modules/**'],
  });
  sourceDirs.push(rootDir);
  // node_modules/@scope dirs (catch a scoped dep changing within an already-existing scope). a *bare*
  // `node_modules` glob would recurse the whole symlinked tree, so its own dir mtime is taken via the
  // direct stat in getLastModifiedPathsTimestampMs below, not globbed.
  const scopeDirs = await globby(`${rootDir}/node_modules/@*`, {
    onlyDirectories: true,
    followSymbolicLinks: false,
  });
  return getLastModifiedPathsTimestampMs([...sourceDirs, ...scopeDirs, `${rootDir}/node_modules`]);
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
