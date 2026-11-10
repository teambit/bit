import fs from 'fs-extra';
import pMap from 'p-map';
import mapSeries from 'p-map-series';
import * as path from 'path';
import { uniq } from 'lodash';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import { removeEmptyDir } from '@teambit/toolbox.fs.remove-empty-dir';
import { logger } from '@teambit/legacy.logger';

/**
 * This function will remove the list of files from fs
 * Then go to the folder of each file and remove it as well if it's empty.
 * when `stopAtDir` is given, it continues up and removes the empty parent dirs as well, up to (not including) `stopAtDir`.
 */
export async function removeFilesAndEmptyDirsRecursively(filesPaths: string[], stopAtDir?: string): Promise<boolean> {
  const dirs = uniq(filesPaths.map((filePath) => path.dirname(filePath)));
  logger.info(`remove-files-and-empty-dirs-recursively deleting the following paths: ${filesPaths.join(', ')}`);
  const concurrency = concurrentIOLimit();
  await pMap(filesPaths, (filePath) => fs.remove(filePath), { concurrency });
  // Sorting it to make sure we will delete the inner dirs first
  const sortedDirs = dirs.sort().reverse();
  await mapSeries(sortedDirs, async (dir) => {
    if (!stopAtDir) {
      await removeEmptyDir(dir);
      return;
    }
    let currentDir = dir;
    while (isInsideDir(currentDir, stopAtDir) && (await removeEmptyDir(currentDir))) {
      currentDir = path.dirname(currentDir);
    }
  });
  return true;
}

function isInsideDir(dir: string, parentDir: string): boolean {
  const relativePath = path.relative(parentDir, dir);
  const isOutside = relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
  return Boolean(relativePath) && !isOutside;
}
