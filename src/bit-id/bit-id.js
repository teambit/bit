/** @flow */
import Version from '../version';
import { remoteResolver, Remotes } from '../remotes';
import { InvalidBitId } from './exceptions';
import { LATEST_BIT_VERSION } from '../constants';
import { Scope } from '../scope';

export type BitIdProps = {
  scope: string;  
  box?: string;
  name: string;
  version: string;
};

export default class BitId {
  name: string;
  box: ?string;
  version: string;
  scope: string;

  constructor({ scope, box, name, version }: BitIdProps) {
    this.scope = scope;
    this.box = box || 'global';
    this.name = name;
    this.version = version;
  }

  getVersion() {
    return Version.parse(this.version);
  }

  getRemote(localScope: Scope, remotes: Remotes) {
    return remoteResolver(this.scope, remotes, localScope);
  }

  toString() {
    const { name, box, version, scope } = this;
    return [scope, box, name, version].join('/');
  }

  static parse(id: string, version: string = LATEST_BIT_VERSION): BitId {
    const splited = id.split('/'); 
    if (splited.length === 3) {
      const [scope, box, name] = splited;
      return new BitId({
        scope,
        box,
        name,
        version
      });
    }

    if (splited.length === 2) {
      const [scope, name] = splited;
      return new BitId({
        scope,
        name,
        version
      });
    }

    throw new InvalidBitId();
  }
}
