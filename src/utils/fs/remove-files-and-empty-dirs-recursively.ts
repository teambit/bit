import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';

import logger from '../../logger/logger';
import removeEmptyDir from './remove-empty-dir';

/**
 * This function will remove the list of files from fs
 * Then go to the folder of each file and remove it as well if it's empty
 */
export default (async function removeFilesAndEmptyDirsRecursively(filesPaths: string[]): Promise<boolean> {
  const dirs = filesPaths.map((filePath) => path.dirname(filePath));
  const deleteP = filesPaths.map((filePath) => fs.remove(filePath));
  logger.info(`remove-files-and-empty-dirs-recursively deleting the following paths: ${filesPaths.join(', ')}`);
  await Promise.all(deleteP);
  // Sorting it to make sure we will delete the inner dirs first
  const sortedDirs = dirs.sort().reverse();
  await mapSeries(sortedDirs, (dir) => removeEmptyDir(dir));
  return true;
});
