// @flow
import path from 'path';
import R from 'ramda';

const MAX_LENGTH = 4096;
/**
 * most are invalid for Windows, but it's a good idea to be compatible with both
 */
const INVALID_CHARS = ['<', '>', '|', '?', '*', ':', '"'];

// TODO: // rename this function, it's very confusing!
// it's not check if path is valid but if path follow specific rules.
// We have also installed the is-valid-path package (which really check if path is valid - like not number and not start with !)
/**
 * relevant for mainFile, rootDir and files relative-paths. Either in bitmap or in the model.
 * 1) it can't be absolute
 * 2) it must be linux format (`\` is forbidden)
 * 3) it can't point to a parent directory (`../`) or current directory (`./`)
 */
export default function isValidPath(pathStr: string): boolean {
  if (
    !pathStr ||
    !R.is(String, pathStr) ||
    INVALID_CHARS.some(c => pathStr.includes(c)) ||
    pathStr.length > MAX_LENGTH ||
    path.isAbsolute(pathStr) ||
    pathStr.startsWith('./') ||
    pathStr.startsWith('../') ||
    pathStr.includes('\\')
  ) {
    return false;
  }
  return true;
}
