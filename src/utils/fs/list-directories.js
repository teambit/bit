/** @flow */
import path from 'path';
import fs from 'fs';

/**
 * synchronous component for listing directory contents.
 * @param {string} dirPath target dir
 * @returns {string[]} array representing directory contents
 * @example
 * ```js
 *  listDirectories('/usr/local/foo/bar') //=> ['foo.html', 'bar.css']
 * ```
 */
export default function listDirectories(dirPath: string): string[] {
  return fs.readdirSync(dirPath).filter((file) => {
    return fs.statSync(path.join(dirPath, file)).isDirectory();
  });
}
