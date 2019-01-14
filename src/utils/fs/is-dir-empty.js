/** @flow */
import fs from 'fs-extra';

export default (async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await fs.readdir(dirPath);
  if (!files.length) {
    return true;
  }
  return false;
});
