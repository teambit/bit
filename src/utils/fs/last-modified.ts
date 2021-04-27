import glob from 'glob';
import fs, { Stats } from 'fs-extra';
import { compact } from 'lodash';

/**
 * check recursively all the sub-directories as well
 */
export async function getLastModifiedDirTimestampMs(rootDir: string): Promise<number> {
  const allDirs = glob.sync(`${rootDir}/**/`); // the trailing slash instructs glob to show only dirs
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

async function getPathStatIfExist(path: string): Promise<Stats | null> {
  try {
    return await fs.stat(path);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
