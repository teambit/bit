/** @flow */
import path from 'path';
import normalize from 'normalize-path';

export function pathJoin(paths:[], toLinux:boolean = true): string {
  return toLinux ? normalize(path.join(paths)) : path.join(paths);
}
export  function pathNormalizeToLinux(pathToNormalize:string): string {
  return normalize(pathToNormalize);
}
export  function pathRelative(from: string, to: string, toLinux:boolean = true): string {
  return toLinux ? normalize(path.relative(from, to)) : path.relative(from, to);
}
