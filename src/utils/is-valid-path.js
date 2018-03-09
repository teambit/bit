// @flow
import path from 'path';

/**
 * relevant for mainFile, rootDir and files relative-paths. Either in bitmap or in the model.
 * 1) it can't be absolute
 * 2) it must be linux format (`\` is forbidden)
 * 3) it can't point to a parent directory (`../`) or current directory (`./`)
 */
export default function isValidPath(pathStr: string): boolean {
  if (path.isAbsolute(pathStr) || pathStr.startsWith('./') || pathStr.startsWith('../') || pathStr.includes('\\')) { return false; }
  return true;
}
