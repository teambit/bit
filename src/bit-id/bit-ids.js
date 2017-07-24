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

  /**
   * Resolve an id with latest to specific version
   * This used to get the real version from the flatten deps by the deps ids
   *
   * @param {BitId} idWithLatest - A bit id object with latest version
   * @returns {BitId} - The bit id found in the array (with actual version)
   * @memberof BitIds
   */
  resolveVersion(idWithLatest) {
    return this.filter(id => idWithLatest.toString(false, true) === id.toString(false, true))[0];
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
