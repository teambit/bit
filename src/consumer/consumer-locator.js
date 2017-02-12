/** 
 * @flow
 * @deprecated
 * @TODO deprecated and should be removed from here and use fs-propogate-until instead...
*/
import * as pathlib from 'path';
import * as fs from 'fs';
import { BIT_JSON, BIT_HIDDEN_DIR } from '../constants';

function composeBitHiddenDirPath(path: string) {
  return pathlib.join(path, BIT_HIDDEN_DIR);
}

function composeBitJsonPath(path: string) {
  return pathlib.join(path, BIT_JSON);
}

/**
 * determine whether given path has a consumer
 */
export function pathHasConsumer(path: string) {
  return fs.existsSync(composeBitHiddenDirPath(path)) &&
  fs.existsSync(composeBitJsonPath(path));
}

/**
 * determine whether given path has a bit.Json
 */
export function pathHasBitJson(path: string) {
  return fs.existsSync(composeBitJsonPath(path));
}

/**
 * determine whether given path has .bit
 */
export function pathHasLocalScope(path: string) {
  return fs.existsSync(composeBitHiddenDirPath(path));
}

/**
 * recursively propogate the FS directory structure to find a box.
 */
export function locateConsumer(absPath: string): ?string {
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

  if (pathHasConsumer(absPath)) return absPath;
  const searchPaths = buildPropogationPaths();
  return searchPaths.find(searchPath => pathHasConsumer(searchPath));     
}
