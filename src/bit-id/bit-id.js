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
    const splited = str.split('/'); 
    if (splited.length === 3 || splited.length === 2) {
      const [scope, name, version] = splited; 
      return new BitId({
        scope: remoteResolver(scope, remotes),
        name, 
        version: Version.parse(version)
      });
    }

    const [scope, box, name, version] = splited;
    return new BitId({
      scope: remoteResolver(scope, remotes),
      name,
      box,
      version: Version.parse(version)
    });
  }
}
