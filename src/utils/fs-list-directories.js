/** @flow */
import path from 'path';
import fs from 'fs';

/**
 * list given dir path contents
 * @param {string} dirPath target dir
 * @returns [string]
 *
 * @example
 *
 */
export default function listDirectories(dirPath: string): string[] {
  return fs.readdirSync(dirPath).filter((file) => {
    return fs.statSync(path.join(dirPath, file)).isDirectory();
  });
}
