/** @flow */
import path from 'path';

/**
 * get the current working dir name of file and file name.
 * @name fileInfo
 * @param file relative path
 * @returns {object}
 * @example
 * ```js
 *  currentDirName() // => 'bit'
 * ```
 */
export default function calculateFileInfo(relativePath: string) {
  const fileInfo = path.parse(relativePath);
  const fullPath = path.dirname(relativePath);
  const rootDir = path.dirname(fullPath);
  const parentDir = path.relative(rootDir, fullPath);
  return { PARENT_FOLDER: parentDir, FILE_NAME: fileInfo.name };
}
