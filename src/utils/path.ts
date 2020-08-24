import normalize from 'normalize-path';
import * as path from 'path';

export type PathLinux = string; // Linux format path (even when running on Windows)
export type PathLinuxRelative = string;
export type PathLinuxAbsolute = string;

export type PathOsBased = string | PathOsBasedRelative | PathOsBasedAbsolute; // OS based format. On Windows it's Windows format, on Linux it's Linux format.
export type PathOsBasedRelative = string;
export type PathOsBasedAbsolute = string;

export type PathRelative = string;
export type PathAbsolute = string;

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

/**
 * path.resolve uses current working dir.
 * sometimes the cwd is not important. a user may running bit command from an inner dir.
 */
export function getPathRelativeRegardlessCWD(from: PathOsBasedRelative, to: PathOsBasedRelative): PathLinuxRelative {
  const fromLinux = pathNormalizeToLinux(from);
  const toLinux = pathNormalizeToLinux(to);
  // change them to absolute so path.relative won't consider the cwd
  return pathRelativeLinux(`/${fromLinux}`, `/${toLinux}`);
}
