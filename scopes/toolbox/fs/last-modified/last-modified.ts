import globby from 'globby';
import type { Stats, Dirent } from 'fs-extra';
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
  // node_modules/@scope dirs (catch a scoped dep changing within an already-existing scope). the
  // `node_modules` dir itself is stat'd directly rather than globbed — a bare `node_modules` glob would
  // recurse the whole symlinked tree.
  const scopeDirs = await getNodeModulesScopeDirs(rootDir);
  return getLastModifiedPathsTimestampMs([...sourceDirs, ...scopeDirs, `${rootDir}/node_modules`]);
}

/**
 * the top-level `@scope` entries directly under a component's `node_modules`. a shallow `readdir` is
 * used (not globby) so a scope that happens to be a symlink is still included — globby's
 * `onlyDirectories` would drop it, missing relinks that happen within that scope.
 */
async function getNodeModulesScopeDirs(rootDir: string): Promise<string[]> {
  const nodeModulesPath = `${rootDir}/node_modules`;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink()))
    .map((entry) => `${nodeModulesPath}/${entry.name}`);
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
