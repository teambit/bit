/** @flow */
import path from 'path';
import normalize from 'normalize-path';

export function pathJoin(paths:[]): string {
  return normalize(path.join(paths));
}
export  function pathNormalize(pathToNormalize:string): string {
  return normalize(pathToNormalize);
}
