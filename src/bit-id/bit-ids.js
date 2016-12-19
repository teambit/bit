/** @flow */
import { BitId } from '../bit-id';
import { forEach, first } from '../utils';
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

  deserialize(array: string[]) {
    return new BitIds(
      array.map(id => BitId.parse(id))
    );
  }

  fetch(origin: Scope, remotes: Remotes) {
    const byRemote = this.reduce((acc, val) => {
      if (!acc[val.scope.host]) acc[val.scope.host] = [val];
      else acc[val.scope.host].push(val);
      return acc;
    }, {});

    const promises = [];
    forEach(byRemote, (bitIds) => {
      promises.push(
        first(bitIds)
        .getRemote(origin, remotes)
        .fetch(bitIds)
      );
    });

    return Promise.all(promises)
      .then((data) => {
        console.log(data);
      });
  }
}
