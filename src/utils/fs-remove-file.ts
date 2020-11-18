import fs from 'fs-extra';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import pathLib from 'path';
import removeEmptyDir from './fs/remove-empty-dir';

export default async function removeFile(path: string, propagateDirs = false): Promise<boolean> {
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
  await removeEmptyDir(dir);
  return true;
}
