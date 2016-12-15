/** @flow */
import Version from '../version';
import { Remote, remoteResolver, Remotes } from '../remotes';

export type BitIdProps = {
  scope: Remote;  
  box?: string;
  name: string;
  version: Version;
};

export default class BitId {
  name: string;
  box: ?string;
  version: Version;
  scope: Remote;

  constructor({ scope, box, name, version }: BitIdProps) {
    this.scope = scope;
    this.box = box || 'global';
    this.name = name;
    this.version = version;
  }

  toString() {
    const { name, box, version, scope } = this;
    return [scope, box, name, version].join('/');
  }

  static parse(str: string, remotes: ?Remotes): BitId {
    let scope;
    let box;
    let name;
    let version;
    const splited = str.split('/');

    if (splited.length === 2) { 
      scope = splited[0];
      name = splited[1];
    } else if (splited.length === 3) { 
      scope = splited[0];

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
      scope = splited[0];
      box = splited[1];
      name = splited[2];
      version = splited[3];
    }

    return new BitId({
      scope: remoteResolver(scope, remotes),
      name,
      box,
      version: Version.parse(version)
    });
  }
}
