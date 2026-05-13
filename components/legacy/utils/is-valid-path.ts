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
 * 5) it can't contain a NUL byte (would truncate path handling in C-level callers)
 * 6) no `.` or `..` segment anywhere — `path.join(base, ".")` is a no-op
 *    and resolves to `base` itself (`..` would escape upward), so callers
 *    that join a request-supplied id into a base dir would land on the
 *    base dir rather than a per-client subdir
 */
export default function isValidPath(pathStr: string): boolean {
  if (
    !pathStr ||
    typeof pathStr !== 'string' ||
    INVALID_CHARS.some((c) => pathStr.includes(c)) ||
    pathStr.length > MAX_LENGTH ||
    pathStr.includes('\0') ||
    path.isAbsolute(pathStr) ||
    pathStr.startsWith('./') ||
    pathStr.includes('\\') ||
    pathStr.split('/').some((seg) => seg === '..' || seg === '.')
  ) {
    return false;
  }
  return true;
}
