import fs from 'fs-extra';

import logger from '../../logger/logger';
import isDirEmpty from './is-dir-empty';

export default (async function removeEmptyDir(dirPath: string): Promise<boolean> {
  const isExist = await fs.pathExists(dirPath);
  if (!isExist) {
    return false;
  }
  const isEmpty = await isDirEmpty(dirPath);
  if (isEmpty) {
    logger.info(`remove-empty-dir, deleting ${dirPath}`);
    await fs.remove(dirPath);
    return true;
  }
  return false;
});
