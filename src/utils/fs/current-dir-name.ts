import * as path from 'path';

/**
 * get the current working dir name.
 * @name currentDirName
 * @returns {string} current working dir name
 * @example
 * ```js
 *  currentDirName() // => 'bit'
 * ```
 */
export default function currentDirName(): string {
  const currentDir = process.cwd();
  return path.basename(currentDir);
}
