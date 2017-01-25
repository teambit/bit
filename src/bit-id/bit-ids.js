/** @flow */
import { mergeAll } from 'ramda';
import { BitId } from '../bit-id';
import { forEach } from '../utils';

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
}
