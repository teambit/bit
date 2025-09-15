import type { ReleaseType } from 'semver';
import { valid, maxSatisfying, minVersion, gt } from 'semver';
import { InvalidVersion } from '@teambit/component-version';

export function isStrReleaseType(str: string): boolean {
  const releaseTypes = ['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'];
  return releaseTypes.includes(str);
}

export function isReleaseTypeSupported(str: string): boolean {
  const supportedReleaseTypes = ['patch', 'minor', 'major', 'prerelease'];
  return supportedReleaseTypes.includes(str);
}

export function throwForUnsupportedReleaseType(str: ReleaseType) {
  if (!isReleaseTypeSupported(str)) {
    throw new Error(`the release-type "${str}" is not supported`);
  }
}

export function validateVersion(version: string | undefined): string | undefined {
  if (version) {
    // it also changes to a valid string (e.g. from v1.0.0 to 1.0.0)
    const validVersion = valid(version);
    if (!validVersion) throw new InvalidVersion(version);
    return validVersion;
  }
  return undefined;
}

export function getValidVersionOrReleaseType(str: string): { releaseType?: ReleaseType; exactVersion?: string } {
  if (isStrReleaseType(str)) {
    const releaseType = str as ReleaseType;
    throwForUnsupportedReleaseType(releaseType);
    return { releaseType };
  }
  const exactVersion = validateVersion(str);
  return { exactVersion };
}

export function getLatestVersion(versions: string[]): string {
  const max = maxSatisfying(versions, '*', { includePrerelease: true });
  if (!max) throw new Error(`unable to find the latest version from ${versions.join(', ')}`);
  return max;
}

/**
 * if both versions are ranges, it's hard to check which one is bigger. sometimes it's even impossible.
 * remember that a range can be something like `1.2 <1.2.9 || >2.0.0`.
 * this check is naive in a way that it assumes the range is simple, such as "^1.2.3" or "~1.2.3.
 * in this case, it's possible to check for the minimum version and compare it.
 */
export function isRange1GreaterThanRange2Naively(range1: string, range2: string): boolean {
  const minVersion1 = minVersion(range1);
  const minVersion2 = minVersion(range2);
  if (!minVersion1 || !minVersion2) return false;
  return gt(minVersion1, minVersion2);
}
