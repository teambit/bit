import fs from 'fs-extra';
import { isDirEmpty } from '@teambit/toolbox.fs.is-dir-empty';

export async function removeEmptyDir(dirPath: string): Promise<boolean> {
  let isEmpty: boolean;
  try {
    isEmpty = await isDirEmpty(dirPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  if (isEmpty) {
    await fs.remove(dirPath);
    return true;
  }
  return false;
}
