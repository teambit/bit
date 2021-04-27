import semver from 'semver';
import { InvalidVersion } from './exceptions';
import { Version, LATEST_VERSION } from './version';

export const HASH_SIZE = 40;
export const LATEST_TESTED_MARK = '*';

function isLatest(versionStr: string): boolean {
  return versionStr === LATEST_VERSION;
}

function isLatestTested(versionStr: string) {
  if (!versionStr.includes(LATEST_TESTED_MARK)) return false;
  const splited = versionStr.split(LATEST_TESTED_MARK);
  if (splited.length !== 2) return false;
  const [, numberStr] = splited;
  const version = isRegular(numberStr);
  if (!version) return false;
  return true;
}

function isRegular(versionStr: string) {
  return semver.valid(versionStr);
}

function returnRegular(versionStr: string): Version {
  return new Version(versionStr, false);
}

function returnLatestTestedVersion(versionStr: string): Version {
  const [, numberStr] = versionStr.split(LATEST_TESTED_MARK);
  return new Version(numberStr, true);
}

function returnLatest(): Version {
  return new Version(null, true);
}

function returnSnap(hash: string): Version {
  return new Version(hash, false);
}

function convertToSemVer(versionStr: number) {
  return returnRegular(`0.0.${versionStr}`);
}

export function isHash(str: string | null | undefined): boolean {
  return typeof str === 'string' && str.length === HASH_SIZE;
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

export default function versionParser(versionStr: string | number | null | undefined): Version {
  if (!versionStr) return returnLatest();
  if (typeof versionStr === 'string' && isLatest(versionStr)) return returnLatest();
  if (typeof versionStr === 'string' && isLatestTested(versionStr)) return returnLatestTestedVersion(versionStr);
  if (typeof versionStr === 'string' && isRegular(versionStr)) return returnRegular(versionStr);
  if (typeof versionStr !== 'string' && Number.isInteger(versionStr)) return convertToSemVer(versionStr);
  // @ts-ignore
  if (isHash(versionStr)) return returnSnap(versionStr);
  throw new InvalidVersion(versionStr.toString());
}
