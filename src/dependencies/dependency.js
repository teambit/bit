/** @flow */
import Version from '../version';
import { DEPENDENCY_DELIMITER } from '../constants';
import { InvalidDependency } from './exceptions';

export default class Dependency {
  name: string;
  remote: string;
  version: Version;

  constructor(name: string, remote: string, version: Version) {
    this.name = name;
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
    const [remote, name] = depName.split(DEPENDENCY_DELIMITER);
    return new Dependency(name, remote, Version.parse(version));
  }
}
