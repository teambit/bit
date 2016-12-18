/** @flow */
import Version from '../version';
import { Remote, remoteResolver, Remotes } from '../remotes';

export type BitIdProps = {
  remote: Remote;  
  box?: string;
  name: string;
  version: Version;
};

export default class BitId {
  remote: Remote;
  box: ?string;
  name: string;
  version: Version;

  constructor({ remote, box, name, version }: BitIdProps) {
    this.remote = remote;
    this.box = box || 'global';
    this.name = name;
    this.version = version;
  }

  toString() {
    const { name, box, version, remote } = this;
    return [remote, box, name, version].join('/');
  }

  static parse(str: string, remotes: ?Remotes): BitId {
    let remote;
    let box;
    let name;
    let version;
    const splited = str.split('/');

    if (splited.length === 2) { 
      remote = splited[0];
      name = splited[1];
    } else if (splited.length === 3) { 
      remote = splited[0];

      if (Version.validate(splited[2])) {
        name = splited[1];
        version = splited[2];
      } else {
        box = splited[1];
        name = splited[2];
      }
      // @POTENTIAL BUG
      // @TODO - name can not be latest because of that feature
    } else {
      remote = splited[0];
      box = splited[1];
      name = splited[2];
      version = splited[3];
    }

    return new BitId({
      remote: remoteResolver(remote, remotes),
      name,
      box,
      version: Version.parse(version)
    });
  }
}
