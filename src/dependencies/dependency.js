/** @flow */
import Version from '../version';
// import { DEPENDENCY_DELIMITER } from '../constants';
import { InvalidDependency } from './exceptions';
import parseDepName from './name-parser';
// import Box from '../box';

export default class Dependency {
  name: string;
  remote: string;
  box: ?string;
  version: Version;

  constructor(name: string, box: ?string, remote: string, version: Version) {
    this.name = name;
    this.box = box;
    this.version = version;
    this.remote = remote;
  }

  import() {
    // this.remote
    //   .connect()
    //   .get(this.name, this.version)
    //   .persist();
  }

  flatten() {

  }

  fetch() {
    return this.remote.fetch();
  }

  static load(depName: string, version: string) {
    if (!depName) throw new InvalidDependency();
    const { name, box, remote } = parseDepName(depName);
    return new Dependency(name, box, remote, Version.parse(version));
  } 
}
