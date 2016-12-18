/** @flow */
import Version from '../version';
import { Remote, remoteResolver, Remotes } from '../remotes';
import { InvalidBitId } from './exceptions';

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

  static parse(id: string, version: string = 'latest', remotes: ?Remotes): BitId {
    const splited = id.split('/'); 
    if (splited.length === 3) {
      const [scope, box, name] = splited;
      return new BitId({
        scope: remoteResolver(scope, remotes),
        box,
        name,
        version: Version.parse(version)
      });
    }

    if (splited.length === 2) {
      const [scope, name] = splited;
      return new BitId({
        scope: remoteResolver(scope, remotes),
        name,
        version: Version.parse(version)
      });
    }

    throw new InvalidBitId();
  }
}
