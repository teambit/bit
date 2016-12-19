/** @flow */
import Version from '../version';
import { remoteResolver, Remotes } from '../remotes';
import { InvalidBitId } from './exceptions';
import { LATEST_BIT_VERSION, VERSION_DELIMITER, LOCAL_SCOPE_NOTATION } from '../constants';
import { Scope } from '../scope';
import { contains } from '../utils';

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

  isLocal() {
    return this.scope === LOCAL_SCOPE_NOTATION;
  }

  toStringWithRemote() {
    // return this.getRemote();
  }

  getVersion() {
    return Version.parse(this.version);
  }

  getRemote(localScope: Scope, remotes: Remotes) {
    return remoteResolver(this.scope, remotes, localScope);
  }

  toString() {
    const { name, box, version, scope } = this;
    return [scope, box, name].join('/').concat(`::${version}`);
  }

  static parse(id: string, version: string = LATEST_BIT_VERSION): BitId {
    if (contains(id, VERSION_DELIMITER)) {
      const [newId, newVersion] = id.split(VERSION_DELIMITER);
      id = newId;
      version = newVersion;
    }

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
