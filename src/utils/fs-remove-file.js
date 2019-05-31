/** @flow */
import fs from 'fs-extra';
import pathLib from 'path';
import logger from '../logger/logger';

export default (async function removeFile(path: string, propagateDirs: boolean = false): Promise<boolean> {
  try {
    await fs.unlink(path);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // the file doesn't exist, that's fine, no need to do anything
      return false;
    }
    throw err;
  }
  if (!propagateDirs) return true;
  const { dir } = pathLib.parse(path);
  const files = await fs.readdir(dir);
  if (files.length !== 0) return true;
  logger.info(`fs-remove-file, deleting empty directory ${dir}`);
  await fs.remove(dir);
  return true;
});
