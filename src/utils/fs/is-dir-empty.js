/** @flow */
import fs from 'fs-extra';

export default (async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await fs.readdir(dirPath);
  return !files.length;
});
