/** @flow */
import fs from 'fs-extra';
import promisify from '../promisify';

const readdir = promisify(fs.readdir);

export default (async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await readdir(dirPath);
  if (!files.length) {
    return true;
  }
  return false;
});
