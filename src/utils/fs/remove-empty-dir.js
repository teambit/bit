/** @flow */
import fs from 'fs-extra';
import isDirEmpty from './is-dir-empty';

export default (async function removeEmptyDir(dirPath: string): Promise<boolean> {
  const isEmpty = await isDirEmpty(dirPath);
  if (isEmpty) {
    await fs.remove(dirPath);
    return true;
  }
  return false;
});
