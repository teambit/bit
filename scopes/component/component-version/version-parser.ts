import semver from 'semver';
import { InvalidVersion } from './exceptions';
import { Version, LATEST_VERSION } from './version';

export const HASH_SIZE = 40;

function isLatest(versionStr: string): boolean {
  return versionStr === LATEST_VERSION;
}

function isSemverValid(versionStr: string) {
  return semver.valid(versionStr);
}

function returnSemver(versionStr: string): Version {
  return new Version(versionStr, false);
}

function returnLatest(): Version {
  return new Version(null, true);
}

function returnSnap(hash: string): Version {
  return new Version(hash, false);
}

export function isHash(str: string | null | undefined): boolean {
  return typeof str === 'string' && str.length === HASH_SIZE && !semver.valid(str);
}

/**
 * a component version can be a tag (semver) or a snap (hash)
 */
export function isTag(str: string | null | undefined): boolean {
  return !isHash(str);
}

/**
 * a component version can be a tag (semver) or a snap (hash)
 */
export function isSnap(str: string | null | undefined): boolean {
  return isHash(str);
}

export default function versionParser(versionStr: string | null | undefined): Version {
  if (!versionStr) return returnLatest();
  if (isLatest(versionStr)) return returnLatest();
  if (isSemverValid(versionStr)) return returnSemver(versionStr);
  if (isHash(versionStr)) return returnSnap(versionStr);

  throw new InvalidVersion(versionStr.toString());
}
