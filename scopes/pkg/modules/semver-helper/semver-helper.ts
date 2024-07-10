import { ReleaseType, valid, maxSatisfying } from 'semver';
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
