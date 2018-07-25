/** @flow */
import R from 'ramda';
import { BitId } from '../bit-id';
import { forEach, getLatestVersionNumber } from '../utils';

export default class BitIds extends Array<BitId> {
  // TODO: use the static toStrings below
  serialize(): string[] {
    return this.map(bitId => bitId.toString());
  }

  toObject(): Object {
    return R.mergeAll(this.map(bitId => bitId.toObject()));
  }

  /**
   * Resolve an id with latest to specific version
   * This used to get the real version from the flatten deps by the deps ids
   *
   * @param {BitId} idWithLatest - A bit id object with latest version
   * @returns {BitId} - The bit id found in the array (with actual version)
   * @memberof BitIds
   */
  resolveVersion(idWithLatest: BitId) {
    return getLatestVersionNumber(this, idWithLatest);
  }

  has(bitId: BitId): boolean {
    return Boolean(this.search(bitId));
  }

  search(bitId: BitId): ?BitId {
    return this.find(id => id.hasSameName(bitId) && id.hasSameScope(bitId) && id.hasSameVersion(bitId));
  }

  searchWithoutVersion(bitId: BitId): ?BitId {
    return this.find(id => id.hasSameName(bitId) && id.hasSameScope(bitId));
  }

  searchWithoutScopeAndVersion(bitId: BitId): ?BitId {
    return this.find(id => id.hasSameName(bitId));
  }

  getUniq(): BitId[] {
    return R.uniqBy(JSON.stringify, this);
  }

  /**
   * Get array of bitIds strings and transfer them to BitIds object
   * This function support also checking if the array contain strings or BitIds
   * @param {string | BitId} array - array of bit ids
   */
  // static deserialize(array: string[] | BitId[] = []): BitIds {
  //   if (array && array.length && typeof array[0] === 'string') {
  //     return new BitIds(...array.map(id => BitId.parse(id)));
  //   }
  //   return new BitIds(...array);
  // }

  static deserialize(array: string[] = []): BitIds {
    return new BitIds(...array.map(id => BitId.parse(id)));
  }

  toString() {
    return this.map(id => id.toString()).join(', ');
  }

  /**
   * Get array of bitIds strings and transfer them to BitIds object
   * This function support also checking if the array contain strings or BitIds
   * @param {string | BitId} array - array of bit ids
   */
  static toStrings(array: string[] | BitId[] = []) {
    if (array && array.length && typeof array[0] === 'string') {
      return array;
    }
    return array.map(bitId => bitId.toString());
  }

  static fromObject(dependencies: { [string]: string }) {
    const array = [];

    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, true, version)); // @todo: make sure hasScope is correct
    });

    return new BitIds(...array);
  }

  static fromArray(bitIds: BitId[]) {
    return new BitIds(...bitIds);
  }

  static clone(bitIds?: ?BitIds = []): BitIds {
    const cloneIds = bitIds.map(bitId => bitId.clone());
    return new BitIds(...cloneIds);
  }
}
