/** @flow */
import path from 'path';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { removeEmptyDir } from '..';
import logger from '../../logger/logger';

/**
 * This function will remove the list of files from fs
 * Then go to the folder of each file and remove it as well if it's empty
 */
export default (async function removeFilesAndEmptyDirsRecursively(filesPaths: string[]): Promise<boolean> {
  const deleteP = [];
  const dirs = [];
  filesPaths.forEach((filePath) => {
    dirs.push(path.dirname(filePath));
    deleteP.push(fs.remove(filePath));
  });
  logger.info(`remove-files-and-empty-dirs-recursively deleting the following paths: ${filesPaths.join(', ')}`);
  await Promise.all(deleteP);
  // Sorting it to make sure we will delete the inner dirs first
  const sortedDirs = dirs.sort().reverse();
  const deleteDirsP = pMapSeries(sortedDirs, removeEmptyDir);
  await deleteDirsP;
  return true;
});
