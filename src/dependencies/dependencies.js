/** @flow */
import BitId from '../bit-id';
import { forEach, first } from '../utils';
import { Remotes } from '../remotes';

export default class Dependencies extends Array<BitId> {
  static load(dependencies: {[string]: string}, remotes: ?Remotes) {
    const array = [];
    
    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, version, remotes));
    });

    return new Dependencies(...array);
  }  

  import() {
    const byRemote = this.reduce((acc, val) => {
      if (!acc[val.scope.host]) acc[val.scope.host] = [val];
      else acc[val.scope.host].push(val);
      return acc;
    }, {});

    const promises = [];
    forEach(byRemote, (bitIds) => {
      const res = first(bitIds).scope.fetch(bitIds);
      promises.push(res);
    });

    return Promise.all(promises).then((data) => {
      console.log(data);
    });
  }
}
