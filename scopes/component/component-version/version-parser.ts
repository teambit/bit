import semver from 'semver';
import { InvalidVersion } from './exceptions';
import { Version, LATEST_VERSION } from './version';

export const HASH_SIZE = 40;

/**
 * because the directory structure is `XX/YY....`, it needs to have at least three characters.
 */
export const SHORT_HASH_MINIMUM_SIZE = 3;

function isLatest(versionStr: string): boolean {
  return versionStr === LATEST_VERSION;
}

function isSemverValid(versionStr: string) {
  return Boolean(semver.valid(versionStr));
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

/**
 * a snap is a 40 characters hash encoded in HEX. so it can be a-f and 0-9.
 * also, for convenience, a short-hash can be used, which is a minimum of 3 characters.
 */
export function isHash(str: string | null | undefined): boolean {
  return typeof str === 'string' && isHex(str) && str.length >= SHORT_HASH_MINIMUM_SIZE && str.length <= HASH_SIZE;
}

/**
 * a component version can be a tag (semver) or a snap (hash)
 */
export function isTag(str?: string): boolean {
  return typeof str === 'string' && isSemverValid(str);
}

/**
 * a component version can be a tag (semver) or a snap (hash)
 */
export function isSnap(str: string | null | undefined): boolean {
  return isHash(str) && typeof str === 'string' && str.length === HASH_SIZE;
}

export default function versionParser(versionStr: string | null | undefined): Version {
  if (!versionStr) return returnLatest();
  if (isLatest(versionStr)) return returnLatest();
  if (isSemverValid(versionStr)) return returnSemver(versionStr);
  if (isHash(versionStr)) return returnSnap(versionStr);

  throw new InvalidVersion(versionStr.toString());
}

/**
 * check if the string consists of valid hexadecimal characters
 */
function isHex(str: string) {
  const hexRegex = /^[0-9a-fA-F]+$/;
  return hexRegex.test(str);
}
