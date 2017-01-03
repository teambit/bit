/** @flow */
import { groupBy } from 'ramda';
import { BitId } from '../bit-id';
import { forEach } from '../utils';
import { Remotes } from '../remotes';
import { Scope } from '../scope';

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

  fetch(origin: Scope, remotes: Remotes) {
    const { inner, outer } = groupBy((id) => {
      if (id.isLocal(origin.scope.name())) return 'inner';
      return 'outer';
    })(this);

    return origin.getMany(inner).then((innerBits) => {
      return origin.external.getMany(outer)
        .then(({ bits, missingIds }) => {
          return remotes.fetch(missingIds)
            .then(remoteBits => origin.external.storeMany(remoteBits))
            .then(remoteBits => remoteBits.concat(bits, innerBits));
        });
    });
  }
}
