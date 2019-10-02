/** @flow */
import R from 'ramda';
import BitId from '../bit-id/bit-id';
import forEach from '../utils/object/foreach';
import getLatestVersionNumber from '../utils/resolveLatestVersion';

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

  hasWithoutVersion(bitId: BitId): boolean {
    return Boolean(this.searchWithoutVersion(bitId));
  }

  hasWithoutScope(bitId: BitId): boolean {
    return Boolean(this.searchWithoutScope(bitId));
  }

  hasWithoutScopeAndVersion(bitId: BitId): boolean {
    return Boolean(this.searchWithoutScopeAndVersion(bitId));
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

  searchWithoutScope(bitId: BitId): ?BitId {
    return this.find(id => id.hasSameName(bitId) && id.hasSameVersion(bitId));
  }

  searchStrWithoutVersion(idStr: string): ?BitId {
    return this.find(id => id.toStringWithoutVersion() === idStr);
  }

  searchStrWithoutScopeAndVersion(idStr: string): ?BitId {
    return this.find(id => id.toStringWithoutScopeAndVersion() === idStr);
  }

  filterExact(bitId: BitId): BitId[] {
    return this.filter(id => id.hasSameName(bitId) && id.hasSameScope(bitId) && id.hasSameVersion(bitId));
  }

  filterWithoutVersion(bitId: BitId): BitId[] {
    return this.filter(id => id.hasSameName(bitId) && id.hasSameScope(bitId));
  }

  filterWithoutScopeAndVersion(bitId: BitId): BitId[] {
    return this.filter(id => id.hasSameName(bitId));
  }

  removeIfExistWithoutVersion(bitId: BitId): BitIds {
    return BitIds.fromArray(this.filter(id => !id.isEqualWithoutVersion(bitId)));
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

  toGroupByScopeName(defaultScope?: ?string): { [scopeName: string]: BitIds } {
    return this.reduce((acc, current) => {
      const scopeName = current.scope || defaultScope;
      if (!scopeName) {
        throw new Error(`toGroupByScopeName() expect ids to have a scope name, got ${current.toString()}`);
      }
      // $FlowFixMe
      if (acc[scopeName]) acc[scopeName].push(current);
      // $FlowFixMe
      else acc[scopeName] = new BitIds(current);
      return acc;
    }, {});
  }

  static fromObject(dependencies: { [string]: string }) {
    const array = [];

    forEach(dependencies, (version, id) => {
      array.push(BitId.parse(id, true, version)); // bit.json has only imported dependencies, they all have scope
    });

    return new BitIds(...array);
  }

  static fromArray(bitIds: BitId[]): BitIds {
    return new BitIds(...bitIds);
  }

  static uniqFromArray(bitIds: BitId[]): BitIds {
    const uniq = R.uniqBy(JSON.stringify, bitIds);
    return BitIds.fromArray(uniq);
  }

  clone(): BitIds {
    const cloneIds = this.map(id => id.clone());
    return new BitIds(...cloneIds);
  }
}
