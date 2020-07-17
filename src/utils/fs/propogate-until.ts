import * as path from 'path';
import * as fs from 'fs-extra';
import findUp from 'find-up';
import { BIT_GIT_DIR, DOT_GIT_DIR, OBJECTS_DIR, BIT_HIDDEN_DIR } from '../../constants';

function composePath(patternPath: string, patterns: string[]): string[] {
  return patterns.map((pattern) => {
    return path.join(patternPath, pattern);
  });
}

/**
 * determine whether given path matches patterns
 */
export function pathHas(patterns: string[]): (absPath: string) => boolean {
  return (absPath: string) => {
    let state = false;
    const paths = composePath(absPath, patterns);
    for (const potentialPath of paths) {
      if (state) return state;
      state = fs.existsSync(potentialPath);
    }

    return state;
  };
}

/**
 * determine whether given path have all files/dirs
 */
export function pathHasAll(patterns: string[]): (absPath: string) => boolean {
  return (absPath: string) => {
    let state = true;
    const paths = composePath(absPath, patterns);
    for (const potentialPath of paths) {
      if (!state) return false;
      state = fs.existsSync(potentialPath);
    }

    return state;
  };
}

/**
 * propogates the FS from given path and until passing pattern function test.
 * @name propogateUntil
 * @param {string} fromPath
 * @param {(path: string) => boolean} pattern
 * @returns {string|null} first path to pass the test.
 * @example
 * ```js
 *  propogateUntil('/usr/local/var', (path) => path.includes('/usr'));
 *  // => '/usr/local/var'
 * ```
 */
export function propogateUntil(fromPath: string): string | null | undefined {
  if (!fromPath) return null;
  if (!fs.existsSync(fromPath)) return null;
  const filePath = findUp.sync(
    [OBJECTS_DIR, path.join(BIT_HIDDEN_DIR, OBJECTS_DIR), path.join(DOT_GIT_DIR, BIT_GIT_DIR, OBJECTS_DIR)],
    { cwd: fromPath }
  );
  if (!filePath) return null;
  return path.dirname(filePath);
}
