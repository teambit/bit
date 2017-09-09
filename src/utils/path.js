/** @flow */
import path from 'path';
import normalize from 'normalize-path';

export function pathJoinLinux(...paths): string {
  return normalize(path.join(...paths));
}
export function pathJoinOs(...paths): string {
  return path.join(paths);
}
export function pathNormalizeToLinux(pathToNormalize?: string): ?string {
  return pathToNormalize ? normalize(pathToNormalize) : pathToNormalize;
}
export function pathRelative(from: string, to: string, toLinux: boolean = true): string {
  return toLinux ? normalize(path.relative(from, to)) : path.relative(from, to);
}
export function pathResolve(arr: [], toLinux: boolean = true): string {
  return toLinux ? normalize(path.resolve(arr.join(','))) : path.resolve(arr);
}
