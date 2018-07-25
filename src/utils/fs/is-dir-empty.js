/** @flow */
import fs from 'fs-extra';
import util from 'util';

const readdir = util.promisify(fs.readdir);

export default (async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await readdir(dirPath);
  if (!files.length) {
    return true;
  }
  return false;
});
