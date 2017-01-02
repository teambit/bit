/** @flow */
import { BitId } from '../bit-id';
import { forEach, first, flatten } from '../utils';
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
    const byRemote = this.reduce((acc, bitId) => {
      const remote = bitId.getRemote(origin, remotes);
      if (!acc[remote.host]) acc[remote.host] = [bitId];
      else acc[remote.host].push(bitId);
      return acc;
    }, {});

    const promises = [];
    forEach(byRemote, (bitIds) => {
      promises.push(
        first(bitIds)
        .getRemote(origin, remotes)
        .fetch(bitIds, this.scope)
        .then(bits => flatten(bits))
      );
    });

    return Promise.all(promises).then((array) => {
      return flatten(array);
    });
  }
}
