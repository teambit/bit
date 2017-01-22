/** @flow */
import { groupBy, mergeAll } from 'ramda';
import { BitId } from '../bit-id';
import { forEach } from '../utils';
import { Remotes } from '../remotes';
import { Scope } from '../scope';
import VersionDependencies from '../scope/version-dependencies';

function byRemote(origin: Scope) {
  return groupBy((id) => {
    if (id.isLocal(origin.name())) return 'inner';
    return 'outer';
  });
}

export default class BitIds extends Array<BitId> {
  serialize(): string[] {
    return this.map(bitId => bitId.toString());
  }
  
  toObject(): Object {
    return mergeAll(
      this.map(bitId => bitId.toObject())
    );
  }

  static deserialize(array: string[] = []) {
    return new BitIds(
      ...array.map(id => BitId.parse(id))
    );
  }
  
  static fromObject(dependencies: {[string]: string}) {
    const array = [];
    
    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, null, version));
    });

    return new BitIds(...array);
  }
  
  fetchOnes(origin: Scope, remotes: Remotes) {
    const { inner = [], outer = [] } = byRemote(origin)(this);
    return origin.manyOnes(inner).then((innerBits) => {
      return remotes.fetch(outer, origin, true)
        .then(remoteBits => remoteBits.concat(innerBits));
    });
  }

  fetch(origin: Scope, remotes: Remotes): Promise<VersionDependencies[]> {
    const { inner = [], outer = [] } = byRemote(origin)(this);
    return origin.getMany(inner).then((innerBits) => {
      return remotes.fetch(outer, origin)
        .then(remoteBits => remoteBits.concat(innerBits));
    });
  }
}
