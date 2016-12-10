/** @flow */
import Version from '../version';
import { DEPENDENCY_DELIMITER } from '../constants';
import { InvalidDependency } from './exceptions';
import parseDepName from './name-parser';
import Box from '../box';

export default class Dependency {
  name: string;
  remote: string;
  box: ?string;
  version: Version;

  constructor(name: string, box: string, remote: string, version: Version) {
    this.name = name;
    this.box = box;
    this.version = version;
    this.remote = remote;
  }

  import() {
    this.remote
      .connect()
      .get(this.name, this.version)
      .persist();
  }

  flatten() {

  }

  static load(depName: string, version: string) {
    if (!depName) throw new InvalidDependency();
    const { name, boxName, remote } = parseDepName(depName);
    return new Dependency(name, boxName, remote, Version.parse(version));
  } 
}
