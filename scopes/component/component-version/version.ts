import semver from 'semver';
import { InvalidVersion } from './exceptions';

export const LATEST_VERSION = 'latest';

export class Version {
  versionNum: string | null | undefined;
  latest: boolean;

  constructor(versionNum: string | null | undefined, latest: boolean) {
    this.versionNum = versionNum;
    this.latest = latest;
  }

  /**
   * @deprecated this is super old method, which is not relevant anymore.
   */
  resolve(availableVersion: string[]): string {
    const getLatest = () => semver.maxSatisfying(availableVersion, '*', { includePrerelease: true });

    if (this.latest) return getLatest() as string;
    return this.versionNum as string;
  }

  toString() {
    if (!this.versionNum && this.latest) return 'latest';
    if (this.versionNum && this.latest) return `*${this.versionNum}`;
    if (this.versionNum && !this.latest) return this.versionNum.toString();
    throw new InvalidVersion(this.versionNum);
  }

  isLaterThan(otherVersion: Version): boolean {
    if (!this.versionNum || this.versionNum === LATEST_VERSION) {
      return true;
    }
    if (!otherVersion.versionNum || otherVersion.versionNum === LATEST_VERSION) {
      return false;
    }
    return semver.gt(this.versionNum, otherVersion.versionNum);
  }
}
