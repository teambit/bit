/** @flow */
import path from 'path';
import type { PathOsBased } from '../path';

/**
 * get the current working dir name of file and file name.
 * @name fileInfo
 * @param relativePath
 * @returns {object}
 * @example
 * ```js
 *  currentDirName() // => 'bit'
 * ```
 */
export default function calculateFileInfo(relativePath: string): PathOsBased {
  const fileInfo = path.parse(relativePath);
  const fullPath = path.dirname(relativePath);
  const rootDir = path.dirname(fullPath);
  const parentDir = path.relative(rootDir, fullPath);
  return { PARENT: parentDir, FILE_NAME: fileInfo.name };
}
