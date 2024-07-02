import fs from 'fs-extra';

import logger from '@teambit/legacy/dist/logger/logger';
import isDirEmpty from './is-dir-empty';

export async function removeEmptyDir(dirPath: string): Promise<boolean> {
  let isEmpty: boolean;
  try {
    isEmpty = await isDirEmpty(dirPath);
  } catch (err: any) {
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
