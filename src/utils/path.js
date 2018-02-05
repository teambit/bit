/** @flow */
import path from 'path';
import normalize from 'normalize-path';

export type PathLinux = string; // Linux format path (even when running on Windows)

export type PathOsBased = string; // OS based format. On Windows it's Windows format, on Linux it's Linux format.

export function pathJoinLinux(...paths): PathLinux {
  return normalize(path.join(...paths));
}
export function pathNormalizeToLinux(pathToNormalize?: PathOsBased): PathLinux {
  return pathToNormalize ? normalize(pathToNormalize) : pathToNormalize;
}
export function pathRelativeLinux(from: PathOsBased, to: PathOsBased): PathLinux {
  return normalize(path.relative(from, to));
}
export function pathResolveToLinux(arr: PathOsBased[]): PathLinux {
  return normalize(path.resolve(arr.join(',')));
}
