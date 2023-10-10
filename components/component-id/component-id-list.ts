import { uniqBy } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { LATEST_VERSION } from '@teambit/component-version';

export class ComponentIdList extends Array<ComponentID> {
  serialize(): string[] {
    return this.map((componentId) => componentId.toString());
  }

  has(componentId: ComponentID): boolean {
    return Boolean(this.search(componentId));
  }

  hasWithoutVersion(componentId: ComponentID): boolean {
    return Boolean(this.searchWithoutVersion(componentId));
  }

  hasWithoutScope(componentId: ComponentID): boolean {
    return Boolean(this.searchWithoutScope(componentId));
  }

  hasWithoutScopeAndVersion(componentId: ComponentID): boolean {
    return Boolean(this.searchWithoutScopeAndVersion(componentId));
  }

  search(componentId: ComponentID): ComponentID | undefined {
    return this.find(
      (id) =>
        id.name === componentId.name && id.scope === componentId.scope && id._legacy.hasSameVersion(componentId._legacy)
    );
  }

  searchWithoutVersion(componentId: ComponentID): ComponentID | null | undefined {
    return this.find((id) => id.name === componentId.name && id.scope === componentId.scope);
  }

  searchWithoutScopeAndVersion(componentId: ComponentID): ComponentID | undefined {
    return this.find((id) => id.name === componentId.name);
  }

  searchWithoutScope(componentId: ComponentID): ComponentID | null | undefined {
    return this.find((id) => id.name === componentId.name && id._legacy.hasSameVersion(componentId._legacy));
  }

  searchStrWithoutVersion(idStr: string): ComponentID | null | undefined {
    return this.find((id) => id.toStringWithoutVersion() === idStr);
  }

  searchStrWithoutScopeAndVersion(idStr: string): ComponentID | null | undefined {
    return this.find((id) => id.name === idStr);
  }

  filterExact(componentId: ComponentID): ComponentID[] {
    return this.filter(
      (id) =>
        id.name === componentId.name && id.scope === componentId.scope && id._legacy.hasSameVersion(componentId._legacy)
    );
  }

  filterWithoutVersion(componentId: ComponentID): ComponentID[] {
    return this.filter((id) => id.name === componentId.name && id.scope === componentId.scope);
  }

  filterWithoutScopeAndVersion(componentId: ComponentID): ComponentID[] {
    return this.filter((id) => id.name === componentId.name);
  }

  removeIfExist(componentId: ComponentID): ComponentIdList {
    return ComponentIdList.fromArray(this.filter((id) => !id.isEqual(componentId)));
  }

  /**
   * Return ids which are on the current instance and not in the passed list
   * @param componentIds
   */
  difference(componentIds: ComponentIdList): ComponentIdList {
    return ComponentIdList.fromArray(this.filter((id) => !componentIds.search(id)));
  }

  removeMultipleIfExistWithoutVersion(componentIds: ComponentIdList): ComponentIdList {
    return ComponentIdList.fromArray(this.filter((id) => !componentIds.hasWithoutVersion(id)));
  }

  toObject() {
    return this.reduce((acc, componentId) => {
      acc[componentId.toString()] = componentId;
      return acc;
    }, {});
  }

  toString(): string {
    return this.map((id) => id.toString()).join(', ');
  }

  toGroupByIdWithoutVersion(): { [idStrWithoutVer: string]: ComponentIdList } {
    return this.reduce((acc, current) => {
      const idStrWithoutVer = current.toStringWithoutVersion();
      if (acc[idStrWithoutVer]) acc[idStrWithoutVer].push(current);
      else acc[idStrWithoutVer] = new ComponentIdList(current);
      return acc;
    }, {});
  }

  toGroupByScopeName(idsWithDefaultScope: ComponentIdList): { [scopeName: string]: ComponentIdList } {
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
      else acc[scopeName] = new ComponentIdList(current);
      return acc;
    }, {});
  }

  findDuplicationsIgnoreVersion(): { [id: string]: ComponentID[] } {
    const duplications = {};
    this.forEach((id) => {
      const sameIds = this.filterWithoutVersion(id);
      if (sameIds.length > 1) {
        duplications[id.toStringWithoutVersion()] = sameIds;
      }
    });
    return duplications;
  }

  add(componentIds: ComponentID[]) {
    componentIds.forEach((componentId) => {
      if (!this.search(componentId)) this.push(componentId);
    });
  }

  static fromArray(ids: ComponentID[]): ComponentIdList {
    // don't do `new componentIds(...ids);`, it'll throw "Maximum call stack size exceeded" for large number if ids.
    const componentIds = new ComponentIdList();
    ids.forEach((id) => componentIds.push(id));
    return componentIds;
  }

  static uniqFromArray(componentIds: ComponentID[]): ComponentIdList {
    const uniq = uniqBy(componentIds, (id) => id.toString());
    return ComponentIdList.fromArray(uniq);
  }

  throwForDuplicationIgnoreVersion() {
    this.forEach((componentId) => {
      const found = this.filterWithoutVersion(componentId);
      if (found.length > 1) {
        throw new Error(`componentIds has "${componentId.toStringWithoutVersion()}" duplicated as following:
${found.map((id) => id.toString()).join('\n')}`);
      }
    });
  }

  toVersionLatest(): ComponentIdList {
    return ComponentIdList.uniqFromArray(this.map((id) => id.changeVersion(LATEST_VERSION)));
  }

  clone(): ComponentIdList {
    return ComponentIdList.fromArray(this.map((id) => id.clone()));
  }
}
