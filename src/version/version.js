/** @flow */
import semver from 'semver';
import { InvalidVersionChange, InvalidVersion } from './exceptions';
import versionParser from './version-parser';
import { DEFAULT_BIT_RELEASE_TYPE } from '../constants';

export default class Version {
  versionNum: ?string;
  latest: boolean;

  constructor(versionNum: ?string, latest: boolean) {
    this.versionNum = versionNum;
    this.latest = latest;
  }

  increase(releaseType: string = DEFAULT_BIT_RELEASE_TYPE): Version {
    if (!this.versionNum) throw new InvalidVersionChange();
    this.versionNum = semver.inc(this.versionNum, releaseType);
    return this;
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
    throw new InvalidVersion();
  }

  static parse(versionStr: string): Version {
    // $FlowFixMe unclear error, might be a bug, try to remove with next Flow version
    return versionParser(versionStr);
  }

  static validate(versionStr: string): boolean {
    try {
      versionParser(versionStr);
      return true;
    } catch (err) {
      return false;
    }
  }
}
