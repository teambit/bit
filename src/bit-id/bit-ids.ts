import R from 'ramda';

import BitId, { BitIdStr } from '../bit-id/bit-id';
import { LATEST_BIT_VERSION } from '../constants';
import forEach from '../utils/object/foreach';
import getLatestVersionNumber from '../utils/resolveLatestVersion';

export default class BitIds extends Array<BitId> {
  serialize(): string[] {
    return this.map((bitId) => bitId.toString());
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

  hasWithoutVersion(bitId: BitId): boolean {
    return Boolean(this.searchWithoutVersion(bitId));
  }

  hasWithoutScope(bitId: BitId): boolean {
    return Boolean(this.searchWithoutScope(bitId));
  }

  hasWithoutScopeAndVersion(bitId: BitId): boolean {
    return Boolean(this.searchWithoutScopeAndVersion(bitId));
  }

  hasWithoutScopeAndVersionAsString(bitIdStr: BitIdStr): boolean {
    return Boolean(this.find((id) => id.name === bitIdStr));
  }

  search(bitId: BitId): BitId | null | undefined {
    return this.find((id) => id.hasSameName(bitId) && id.hasSameScope(bitId) && id.hasSameVersion(bitId));
  }

  searchWithoutVersion(bitId: BitId): BitId | null | undefined {
    return this.find((id) => id.hasSameName(bitId) && id.hasSameScope(bitId));
  }

  searchWithoutScopeAndVersion(bitId: BitId): BitId | undefined {
    return this.find((id) => id.hasSameName(bitId));
  }

  searchWithoutScope(bitId: BitId): BitId | null | undefined {
    return this.find((id) => id.hasSameName(bitId) && id.hasSameVersion(bitId));
  }

  searchStrWithoutVersion(idStr: string): BitId | null | undefined {
    return this.find((id) => id.toStringWithoutVersion() === idStr);
  }

  searchStrWithoutScopeAndVersion(idStr: string): BitId | null | undefined {
    return this.find((id) => id.toStringWithoutScopeAndVersion() === idStr);
  }

  filterExact(bitId: BitId): BitId[] {
    return this.filter((id) => id.hasSameName(bitId) && id.hasSameScope(bitId) && id.hasSameVersion(bitId));
  }

  filterWithoutVersion(bitId: BitId): BitId[] {
    return this.filter((id) => id.hasSameName(bitId) && id.hasSameScope(bitId));
  }

  filterWithoutScopeAndVersion(bitId: BitId): BitId[] {
    return this.filter((id) => id.hasSameName(bitId));
  }

  removeIfExist(bitId: BitId): BitIds {
    return BitIds.fromArray(this.filter((id) => !id.isEqual(bitId)));
  }

  /**
   * Return ids which are on the current instance and not in the passed list
   * @param bitIds
   */
  difference(bitIds: BitIds): BitIds {
    return BitIds.fromArray(this.filter((id) => !bitIds.search(id)));
  }

  removeIfExistWithoutVersion(bitId: BitId): BitIds {
    return BitIds.fromArray(this.filter((id) => !id.isEqualWithoutVersion(bitId)));
  }
  removeMultipleIfExistWithoutVersion(bitIds: BitIds): BitIds {
    return BitIds.fromArray(this.filter((id) => !bitIds.hasWithoutVersion(id)));
  }

  /**
   * make sure to pass only bit ids you know they have scope, otherwise, you'll get invalid bit ids.
   * this is mainly useful for remote commands where it is impossible to have a component without scope.
   */
  static deserialize(array: string[] = []): BitIds {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...array.map((id) => BitId.parse(id, true)));
  }

  static deserializeObsolete(array: string[] = []): BitIds {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...array.map((id) => BitId.parseObsolete(id)));
  }

  toString(): string {
    return this.map((id) => id.toString()).join(', ');
  }

  toGroupByScopeName(idsWithDefaultScope: BitIds): { [scopeName: string]: BitIds } {
    return this.reduce((acc, current) => {
      const getScopeName = () => {
        if (current.scope) return current.scope;
        const idWithDefaultScope = idsWithDefaultScope.searchWithoutScopeAndVersion(current);
        return idWithDefaultScope ? idWithDefaultScope.scope : null;
      };
      const scopeName = getScopeName();
      if (!scopeName) {
        throw new Error(`toGroupByScopeName() expect ids to have a scope name, got ${current.toString()}`);
      }
      if (acc[scopeName]) acc[scopeName].push(current);
      else acc[scopeName] = new BitIds(current);
      return acc;
    }, {});
  }

  findDuplicationsIgnoreVersion(): { [id: string]: BitId[] } {
    const duplications = {};
    this.forEach((id) => {
      const sameIds = this.filterWithoutVersion(id);
      if (sameIds.length > 1) {
        duplications[id.toStringWithoutVersion()] = sameIds;
      }
    });
    return duplications;
  }

  add(bitIds: BitId[]) {
    bitIds.forEach((bitId) => {
      if (!this.search(bitId)) this.push(bitId);
    });
  }

  static fromObject(dependencies: { [key: string]: string }) {
    const array = [];

    forEach(dependencies, (version, id) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      array.push(BitId.parse(id, true, version)); // bit.json has only imported dependencies, they all have scope
    });

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...array);
  }

  static fromArray(bitIds: BitId[]): BitIds {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...bitIds);
  }

  static uniqFromArray(bitIds: BitId[]): BitIds {
    const uniq = R.uniqBy(JSON.stringify, bitIds);
    return BitIds.fromArray(uniq);
  }

  throwForDuplicationIgnoreVersion() {
    this.forEach((bitId) => {
      const found = this.filterWithoutVersion(bitId);
      if (found.length > 1) {
        throw new Error(`bitIds has "${bitId.toStringWithoutVersion()}" duplicated as following:
${found.map((id) => id.toString()).join('\n')}`);
      }
    });
  }

  toVersionLatest(): BitIds {
    return BitIds.fromArray(this.map((id) => id.changeVersion(LATEST_BIT_VERSION)));
  }

  clone(): BitIds {
    const cloneIds = this.map((id) => id.clone());
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...cloneIds);
  }
}
