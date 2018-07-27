/** @flow */
import R from 'ramda';
import { BitId } from '../bit-id';
import { forEach, getLatestVersionNumber } from '../utils';

export default class BitIds extends Array<BitId> {
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
    // $FlowFixMe
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

  getUniq(): BitIds {
    return BitIds.fromArray(R.uniqBy(JSON.stringify, this));
  }

  /**
   * make sure to pass only bit ids you know they have scope, otherwise, you'll get invalid bit ids.
   * this is mainly useful for remote commands where it is impossible to have a component without scope.
   */
  static deserialize(array: string[] = []): BitIds {
    return new BitIds(...array.map(id => BitId.parse(id, true)));
  }

  toString(): string {
    return this.map(id => id.toString()).join(', ');
  }

  static fromObject(dependencies: { [string]: string }) {
    const array = [];

    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, true, version)); // @todo: make sure hasScope is correct
    });

    return new BitIds(...array);
  }

  static fromArray(bitIds: BitId[]): BitIds {
    return new BitIds(...bitIds);
  }

  clone(): BitIds {
    const cloneIds = this.map(id => id.clone());
    return new BitIds(...cloneIds);
  }
}
