import * as pathlib from 'path';
import * as fs from 'fs';
import { BIT_DIR_NAME } from '../constants';

export function composePath(path: string, inPath: string) {
  return pathlib.join(composeBoxPath(path), inPath); 
}

export function composeBoxPath(path: string) {
  return pathlib.join(path, BIT_DIR_NAME);
}

/**
 * determine whether given path has a box
 */
export function pathHasBox(path: string) {
  return fs.existsSync(composeBoxPath(path));
}

/**
 * recursively propogate the FS directory structure to find a box.
 */
export function locateBox(absPath: string): ?string {
  function buildPropogationPaths(): string[] {
    const paths: string[] = [];
    const pathParts = absPath.split(pathlib.sep);
      
    pathParts.forEach((val, index) => {
      const part = pathParts.slice(0, index).join('/');
      if (!part) return;
      paths.push(part);
    });

    return paths.reverse();
  }

  if (pathHasBox(absPath)) return absPath;
  const searchPaths = buildPropogationPaths();
  return searchPaths.find(searchPath => pathHasBox(searchPath));     
}
