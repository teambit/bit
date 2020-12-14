import semver from 'semver';
import { InvalidVersion } from './exceptions';

export const LATEST = 'latest';

export default class Version {
  versionNum: string | null | undefined;
  latest: boolean;

  constructor(versionNum: string | null | undefined, latest: boolean) {
    this.versionNum = versionNum;
    this.latest = latest;
  }

  resolve(availableVersion: string[]) {
    const getLatest = () => semver.maxSatisfying(availableVersion, '*');

    if (this.latest) return getLatest();
    return this.versionNum;
  }

  toString() {
    if (!this.versionNum && this.latest) return 'latest';
    if (this.versionNum && this.latest) return `*${this.versionNum}`;
    if (this.versionNum && !this.latest) return this.versionNum.toString();
    throw new InvalidVersion(this.versionNum);
  }

  isLaterThan(otherVersion: Version): boolean {
    if (!this.versionNum || this.versionNum === LATEST) {
      return true;
    }
    if (!otherVersion.versionNum || otherVersion.versionNum === LATEST) {
      return false;
    }
    return semver.gt(this.versionNum, otherVersion.versionNum);
  }
}
