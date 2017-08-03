/** @flow */
import * as path from 'path';
import * as fs from 'fs';

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
 * propogates the FS from given path and until passing pattern function test.
 * @name propogateUntil
 * @param {string} fromPath 
 * @param {(path: string) => boolean} pattern 
 * @returns {string|null} first path to pass the test.
 * @example
 * ```js
 *  propogateUntil('/usr/local/var', (path) => path.indexOf('/usr') !== -1); 
 *  // => '/usr/local/var'
 * ```
 */
export function propogateUntil(fromPath: string, pattern: (path: string) => boolean): ?string {
  function buildPropogationPaths(): string[] {
    const paths: string[] = [];
    const pathParts = fromPath.split(path.sep);

    pathParts.forEach((val, index) => {
      const part = pathParts.slice(0, index).join('/');
      if (!part) return;
      paths.push(part);
    });

    return paths.reverse();
  }

  if (pattern(fromPath)) return fromPath;
  const searchPaths = buildPropogationPaths();
  return searchPaths.find(searchPath => pattern(searchPath));
}
