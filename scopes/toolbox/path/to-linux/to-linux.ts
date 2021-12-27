import * as path from 'path';
import { normalizePath } from './normalize-path';

export type PathLinux = string; // Linux format path (even when running on Windows)
export type PathLinuxRelative = string;
export type PathLinuxAbsolute = string;

// OS based format. On Windows it is Windows format, on Linux it is Linux format.
export type PathOsBased = string | PathOsBasedRelative | PathOsBasedAbsolute;
export type PathOsBasedRelative = string;
export type PathOsBasedAbsolute = string;

export function pathJoinLinux(...paths): PathLinux {
  return normalizePath(path.join(...paths));
}
export function pathNormalizeToLinux(pathToNormalize?: PathOsBased): PathLinux {
  return pathToNormalize ? normalizePath(pathToNormalize) : (pathToNormalize as PathLinux);
}
export function pathRelativeLinux(from: PathOsBased, to: PathOsBased): PathLinux {
  return normalizePath(path.relative(from, to));
}
export function pathResolveToLinux(arr: PathOsBased[]): PathLinux {
  return normalizePath(path.resolve(arr.join(',')));
}

/**
 * path.resolve uses current working dir.
 * sometimes the cwd is not important. a user may run a Bit command from an inner dir.
 */
export function getPathRelativeRegardlessCWD(from: PathOsBasedRelative, to: PathOsBasedRelative): PathLinuxRelative {
  const fromLinux = pathNormalizeToLinux(from);
  const toLinux = pathNormalizeToLinux(to);
  // change them to absolute so path.relative won't consider the cwd
  return pathRelativeLinux(`/${fromLinux}`, `/${toLinux}`);
}
