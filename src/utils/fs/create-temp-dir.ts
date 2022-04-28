import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import generateRandomStr from '../string/generate-random';

export const BIT_TEMP_ROOT = path.join(fs.realpathSync(os.tmpdir()), 'bit');

/**
 * Create a random directory inside the OS temp folder.
 *
 * @param size The length of the randomly generated temp dir
 * @returns The path to the random directory
 */
export function createTempDir(size = 8): string {
  const tmpDir = path.join(BIT_TEMP_ROOT, generateRandomStr(size));
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}
