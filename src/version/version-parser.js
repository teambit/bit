// @flow
import semver from 'semver';
import Version from './version';
import { LATEST, LATEST_TESTED_MARK } from '../constants';
import { contains } from '../utils';
import { InvalidVersion } from './exceptions';

function isLatest(versionStr: string): boolean {
  return versionStr === LATEST;
}

function isLatestTested(versionStr: string) {
  if (!contains(versionStr, LATEST_TESTED_MARK)) return false;
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

function returnRegular(versionStr: string) {
  return new Version(versionStr, false);
}

function returnLatestTestedVersion(versionStr: string): Version {
  const [, numberStr] = versionStr.split(LATEST_TESTED_MARK);
  return new Version(numberStr, true);
}

function returnLatest(): Version {
  return new Version(null, true);
}

export default function versionParser(versionStr: string): Version {
  if (!versionStr) return returnLatest();
  if (isLatest(versionStr)) return returnLatest();
  if (isLatestTested(versionStr)) return returnLatestTestedVersion(versionStr);
  if (isRegular(versionStr)) return returnRegular(versionStr);
  throw new InvalidVersion();
}
