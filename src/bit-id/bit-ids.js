/** @flow */
import { mergeAll } from 'ramda';
import { BitId } from '../bit-id';
import { forEach, getLatestVersionNumber } from '../utils';

export default class BitIds extends Array<BitId> {
  serialize(): string[] {
    return this.map(bitId => bitId.toString());
  }

  toObject(): Object {
    return mergeAll(this.map(bitId => bitId.toObject()));
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
    return getLatestVersionNumber(this, idWithLatest);
  }

  /**
   * Get array of bitIds strings and transfer them to BitIds object
   * This function support also checking if the array contain strings or BitIds
   * @param {string | BitId} array - array of bit ids
   */
  static deserialize(array: string[] | BitId[] = []) {
    if (array && array.length && typeof array[0] === 'string') {
      return new BitIds(...array.map(id => BitId.parse(id)));
    }
    return new BitIds(...array);
  }

  static fromObject(dependencies: { [string]: string }) {
    const array = [];

    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, version));
    });

    return new BitIds(...array);
  }
}
