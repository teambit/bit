import semver from 'semver';
import Version from './version';
import { LATEST, LATEST_TESTED_MARK } from '../constants';
import { InvalidVersion } from './exceptions';

function isLatest(versionStr: string): boolean {
  return versionStr === LATEST;
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

function convertToSemVer(versionStr: number) {
  return returnRegular(`0.0.${versionStr}`);
}

export default function versionParser(versionStr: string | number | null | undefined): Version {
  if (!versionStr) return returnLatest();
  if (typeof versionStr === 'string' && isLatest(versionStr)) return returnLatest();
  if (typeof versionStr === 'string' && isLatestTested(versionStr)) return returnLatestTestedVersion(versionStr);
  if (typeof versionStr === 'string' && isRegular(versionStr)) return returnRegular(versionStr);
  if (typeof versionStr !== 'string' && Number.isInteger(versionStr)) return convertToSemVer(versionStr);

  throw new InvalidVersion(versionStr.toString());
}
