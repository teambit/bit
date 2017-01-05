/** @flow */
import { groupBy } from 'ramda';
import { BitId } from '../bit-id';
import { forEach } from '../utils';
import { Remotes } from '../remotes';
import { Scope } from '../scope';

function byRemote(origin: Scope) {
  return groupBy((id) => {
    if (id.isLocal(origin.name())) return 'inner';
    return 'outer';
  });
}

export default class BitIds extends Array<BitId> {
  static loadDependencies(dependencies: {[string]: string}) {
    const array = [];
    
    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, version));
    });

    return new BitIds(...array);
  }

  serialize(): string[] {
    return this.map(bitId => bitId.toString());
  }

  static deserialize(array: string[]) {
    return new BitIds(
      ...array.map(id => BitId.parse(id))
    );
  }
  
  fetchOnes(origin: Scope, remotes: Remotes) {
    const { inner = [], outer = [] } = byRemote(origin)(this);
    return origin.manyOnes(inner).then((innerBits) => {
      return remotes.fetch(outer, true)
        .then(remoteBits => remoteBits.concat(innerBits));
    });
  }

  fetch(origin: Scope, remotes: Remotes) {
    const { inner = [], outer = [] } = byRemote(origin)(this);
    return origin.getMany(inner).then((innerBits) => {
      return remotes.fetch(outer)
        .then(remoteBits => remoteBits.concat(innerBits));
    });
  }
}
