/** @flow */
import { InvalidVersionChange, InvalidVersion } from './exceptions';
import versionParser from './version-parser';

export default class Version {
  versionNum: ?number;
  latest: boolean;

  constructor(versionNum: number, latest: boolean) {
    this.versionNum = versionNum;
    this.latest = latest;
  }

  increase(): Version {
    if (!this.versionNum) throw new InvalidVersionChange();
    this.versionNum = this.versionNum + 1;
    return this;
  }

  decrease() {
    if (!this.versionNum || this.versionNum <= 1) throw new InvalidVersionChange();
    this.versionNum = this.versionNum - 1;
    return this;
  }

  toString() {
    if (!this.versionNum && this.latest) return 'latest';
    if (this.versionNum && this.latest) return `*${this.versionNum}`;
    if (this.versionNum && !this.latest) return this.versionNum.toString();
    throw new InvalidVersion();
  }

  static parse(versionStr: string): Version {
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
