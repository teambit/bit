import { invertBy, uniq } from 'lodash';
import { dirname } from 'path';
import { PathLinuxRelative } from '@teambit/legacy.utils';
import { CompPathExtendingHashMap, EnvCompsDirsMap } from './workspace-config-files.main.runtime';
import { ExtendingConfigFilesMap } from './writers';

export type DedupedPaths = Array<{
  fileHash: string;
  paths: string[];
}>;

function getAllPossibleDirsFromPaths(paths: PathLinuxRelative[]): PathLinuxRelative[] {
  const dirs = paths.map((p) => getAllParentsDirOfPath(p)).flat();
  dirs.push('.'); // add the root dir
  return uniq(dirs);
}

function getAllParentsDirOfPath(p: PathLinuxRelative): PathLinuxRelative[] {
  const all: string[] = [];
  let current = p;
  while (current !== '.') {
    all.push(current);
    current = dirname(current);
  }
  return all;
}

export function buildCompPathExtendingHashMap(
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  envCompsDirsMap: EnvCompsDirsMap
): CompPathExtendingHashMap {
  const map = Object.entries(extendingConfigFilesMap).reduce((acc, [hash, { envIds }]) => {
    envIds.forEach((envId) => {
      const envCompDirs = envCompsDirsMap[envId];
      envCompDirs.paths.forEach((compPath) => {
        acc[compPath] = hash;
      });
    });
    return acc;
  }, {});
  return map;
}

/**
 * easier to understand by an example:
 * input:
 * [
 *   { fileHash: hash1, paths: [ui/button, ui/form] },
 *   { fileHash: hash2, paths: [p/a1, p/a2] },
 *   { fileHash: hash3, paths: [p/n1] },
 * ]
 *
 * output:
 * [
 *   { fileHash: hash1, paths: [ui] },
 *   { fileHash: hash2, paths: [p] },
 *   { fileHash: hash3, paths: [p/n1] },
 * ]
 *
 * the goal is to minimize the amount of files to write per env if possible.
 * when multiple components of the same env share a root-dir, then, it's enough to write a file in that shared dir.
 * if in a shared-dir, some components using env1 and some env2, it finds the env that has the max number of
 * components, this env will be optimized. other components, will have the files written inside their dirs.
 */
export function dedupePaths(
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  envCompsDirsMap: EnvCompsDirsMap
): DedupedPaths {
  const rootDir = '.';

  const compPathExtendingHashMap = buildCompPathExtendingHashMap(extendingConfigFilesMap, envCompsDirsMap);
  const allPaths = Object.keys(compPathExtendingHashMap);
  const allPossibleDirs = getAllPossibleDirsFromPaths(allPaths);

  const allPathsPerFileHash: { [path: string]: string | null } = {}; // null when parent-dir has same amount of comps per env.

  const calculateBestFileForDir = (dir: string) => {
    if (compPathExtendingHashMap[dir]) {
      // it's the component dir, so it's the file that should be written.
      allPathsPerFileHash[dir] = compPathExtendingHashMap[dir];
      return;
    }
    const allPathsShareSameDir = dir === rootDir ? allPaths : allPaths.filter((p) => p.startsWith(`${dir}/`));
    const countPerFileHash: { [fileHash: string]: number } = {};
    allPathsShareSameDir.forEach((p) => {
      const fileHash = compPathExtendingHashMap[p];
      if (countPerFileHash[fileHash]) countPerFileHash[fileHash] += 1;
      else countPerFileHash[fileHash] = 1;
    });
    const max = Math.max(...Object.values(countPerFileHash));
    const fileHashWithMax = Object.keys(countPerFileHash).filter((fileHash) => countPerFileHash[fileHash] === max);
    if (!fileHashWithMax.length) throw new Error(`must be at least one fileHash related to path "${dir}"`);
    if (fileHashWithMax.length > 1) allPathsPerFileHash[dir] = null;
    else allPathsPerFileHash[dir] = fileHashWithMax[0];
  };

  allPossibleDirs.forEach((dirPath) => {
    calculateBestFileForDir(dirPath);
  });

  // this is the actual deduping. if found a shorter path with the same env, then no need for this path.
  // in other words, return only the paths that their parent is null or has a different env.
  const dedupedPathsPerFileHash = Object.keys(allPathsPerFileHash).reduce((acc, current) => {
    if (allPathsPerFileHash[current] && allPathsPerFileHash[dirname(current)] !== allPathsPerFileHash[current]) {
      acc[current] = allPathsPerFileHash[current];
    }

    return acc;
  }, {});
  // rootDir parent is always rootDir, so leave it as is.
  if (allPathsPerFileHash[rootDir]) dedupedPathsPerFileHash[rootDir] = allPathsPerFileHash[rootDir];

  const fileHashPerDedupedPaths = invertBy(dedupedPathsPerFileHash);

  const dedupedPaths = Object.keys(fileHashPerDedupedPaths).map((fileHash) => ({
    fileHash,
    paths: fileHashPerDedupedPaths[fileHash],
  }));
  return dedupedPaths;
}
