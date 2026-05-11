import * as path from 'path';

const MAX_LENGTH = 4096;
/**
 * most are invalid for Windows, but it's a good idea to be compatible with both
 */
const INVALID_CHARS = ['<', '>', '|', '?', '*', ':', '"'];

/**
 * relevant for mainFile, rootDir and files relative-paths. Either in bitmap or in the model.
 * 1) it can't be absolute
 * 2) it must be linux format (`\` is forbidden)
 * 3) it can't start with `./` (current directory)
 * 4) it can't point to a parent directory — neither a leading `../` nor an
 *    embedded `foo/../../` segment (parent traversal via intermediate segments)
 */
export default function isValidPath(pathStr: string): boolean {
  if (
    !pathStr ||
    typeof pathStr !== 'string' ||
    INVALID_CHARS.some((c) => pathStr.includes(c)) ||
    pathStr.length > MAX_LENGTH ||
    path.isAbsolute(pathStr) ||
    pathStr.startsWith('./') ||
    pathStr.includes('\\') ||
    pathStr.split('/').some((seg) => seg === '..')
  ) {
    return false;
  }
  return true;
}
