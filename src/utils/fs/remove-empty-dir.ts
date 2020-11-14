import fs from 'fs-extra';

import logger from '../../logger/logger';
import isDirEmpty from './is-dir-empty';

export default async function removeEmptyDir(dirPath: string): Promise<boolean> {
  let isEmpty: boolean;
  try {
    isEmpty = await isDirEmpty(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  if (isEmpty) {
    logger.info(`remove-empty-dir, deleting ${dirPath}`);
    await fs.remove(dirPath);
    return true;
  }
  return false;
}
