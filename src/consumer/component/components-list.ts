import * as path from 'path';
import semver from 'semver';
import R from 'ramda';
import Version from '../../scope/models/version';
import ModelComponent from '../../scope/models/model-component';
import Scope from '../../scope/scope';
import Component from '../component';
import { InvalidComponent } from '../component/consumer-component';
import { BitId, BitIds } from '../../bit-id';
import BitMap from '../bit-map/bit-map';
import Consumer from '../consumer';
import { COMPONENT_ORIGINS, LATEST } from '../../constants';
import NoIdMatchWildcard from '../../api/consumer/lib/exceptions/no-id-match-wildcard';
import { fetchRemoteVersions } from '../../scope/scope-remotes';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';
import ComponentMap, { ComponentOrigin } from '../bit-map/component-map';

export type ObjectsList = Promise<{ [componentId: string]: Version }>;

export type ListScopeResult = {
  id: BitId;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
};

export default class ComponentsList {
  consumer: Consumer;
  scope: Scope;
  bitMap: BitMap;
  _fromFileSystem: { [cacheKey: string]: Component[] } = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _fromObjectsIds: BitId[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _modelComponents: ModelComponent[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _invalidComponents: InvalidComponent[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _modifiedComponents: Component[];
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.bitMap = consumer.bitMap;
  }

  async getModelComponents(): Promise<ModelComponent[]> {
    if (!this._modelComponents) {
      this._modelComponents = await this.scope.list();
    }
    return this._modelComponents;
  }

  /**
   * List all bit ids stored in the model
   */
  async getFromObjects(): Promise<BitId[]> {
    if (!this._fromObjectsIds) {
      const modelComponents: ModelComponent[] = await this.getModelComponents();
      this._fromObjectsIds = modelComponents.map(componentObjects => {
        return new BitId({
          scope: componentObjects.scope,
          name: componentObjects.name,
          version: componentObjects.scope ? componentObjects.latest() : undefined
        });
      });
    }
    return this._fromObjectsIds;
  }

  async getAuthoredAndImportedFromFS(): Promise<Component[]> {
    let [authored, imported] = await Promise.all([
      this.getFromFileSystem(COMPONENT_ORIGINS.AUTHORED),
      this.getFromFileSystem(COMPONENT_ORIGINS.IMPORTED)
    ]);
    authored = authored || [];
    imported = imported || [];
    return authored.concat(imported);
  }

  /**
   * Components that are in the model (either, tagged from a local scope or imported), and were
   * changed in the file system
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @return {Promise<string[]>}
   */
  async listModifiedComponents(load = false): Promise<Array<BitId | Component>> {
    if (!this._modifiedComponents) {
      const fileSystemComponents = await this.getAuthoredAndImportedFromFS();
      const componentStatuses = await this.consumer.getManyComponentsStatuses(fileSystemComponents.map(f => f.id));
      this._modifiedComponents = fileSystemComponents.filter(component => {
        const status = componentStatuses.find(s => s.id.isEqual(component.id));
        if (!status) throw new Error(`listModifiedComponents unable to find status for ${component.id.toString()}`);
        return status.status.modified;
      });
    }
    if (load) return this._modifiedComponents;
    return this._modifiedComponents.map(component => component.id);
  }

  async listOutdatedComponents(): Promise<Component[]> {
    const fileSystemComponents = await this.getAuthoredAndImportedFromFS();
    const componentsFromModel = await this.getModelComponents();
    return fileSystemComponents.filter(component => {
      const modelComponent = componentsFromModel.find(c => c.toBitId().isEqualWithoutVersion(component.id));
      if (!modelComponent) return false;
      const latestVersion = modelComponent.latest();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (component.id.hasVersion() && semver.gt(latestVersion, component.id.version!)) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        component.latestVersion = latestVersion;
        return true;
      }
      return false;
    });
  }

  async newModifiedAndAutoTaggedComponents(): Promise<Component[]> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(true),
      this.listModifiedComponents(true)
    ]);

    const autoTagPendingModel: ModelComponent[] = await this.listAutoTagPendingComponents();
    const autoTagPending: Component[] = await this.scope.toConsumerComponents(autoTagPendingModel);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const components: Component[] = [...newComponents, ...modifiedComponents, ...autoTagPending];

    return Promise.all(components);
  }

  async authoredAndImportedComponents(): Promise<Component[]> {
    return this.getAuthoredAndImportedFromFS();
  }

  async idsFromObjects(): Promise<BitIds> {
    const fromObjects = await this.getFromObjects();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitIds(...fromObjects);
  }

  /**
   * Components that are registered in bit.map but have never been tagged
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @return {Promise.<string[] | Component[]>}
   * @memberof ComponentsList
   */
  async listNewComponents(load = false): Promise<BitIds | Component[]> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    const newComponents: BitId[] = [];
    idsFromBitMap.forEach((id: BitId) => {
      if (!idsFromObjects.searchWithoutScopeAndVersion(id)) {
        newComponents.push(id);
      }
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponentsIds = new BitIds(...newComponents);
    if (!load || !newComponents.length) return newComponentsIds;

    const { components } = await this.consumer.loadComponents(newComponentsIds, false);
    return components;
  }

  async listCommitPendingOfAllScope(
    version: string,
    includeImported = false
  ): Promise<{ tagPendingComponents: BitId[]; warnings: string[] }> {
    let tagPendingComponents;
    tagPendingComponents = this.idsFromBitMap(COMPONENT_ORIGINS.AUTHORED);
    if (includeImported) {
      const importedComponents = this.idsFromBitMap(COMPONENT_ORIGINS.IMPORTED);
      tagPendingComponents = tagPendingComponents.concat(importedComponents);
    }
    const tagPendingComponentsLatest = await this.scope.latestVersions(tagPendingComponents, false);
    const warnings = [];
    tagPendingComponentsLatest.forEach(componentId => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (semver.gt(componentId.version!, version)) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        warnings.push(`warning: ${componentId.toString()} has a version greater than ${version}`);
      }
    });
    return { tagPendingComponents, warnings };
  }

  /**
   * New and modified components are tag pending
   *
   * @return {Promise<string[]>}
   */
  async listCommitPendingComponents(): Promise<BitIds> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(),
      this.listModifiedComponents()
    ]);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return BitIds.fromArray([...newComponents, ...modifiedComponents]);
  }

  async listExportPendingComponentsIds(): Promise<BitIds> {
    const modelComponents = await this.getModelComponents();
    const pendingExportComponents = modelComponents.filter(component => component.isLocallyChanged());
    const ids = BitIds.fromArray(pendingExportComponents.map(c => c.toBitId()));
    return this.updateIdsFromModelIfTheyOutOfSync(ids);
  }

  async listNonNewComponentsIds(): Promise<BitIds> {
    const authoredAndImported = await this.getAuthoredAndImportedFromFS();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponents: BitIds = await this.listNewComponents();
    const nonNewComponents = authoredAndImported.filter(component => !newComponents.has(component.id));
    return BitIds.fromArray(nonNewComponents.map(c => c.id.changeVersion(undefined)));
  }

  async updateIdsFromModelIfTheyOutOfSync(ids: BitIds): Promise<BitIds> {
    const authoredAndImported = this.bitMap.getAuthoredAndImportedBitIds();
    const updatedIdsP = ids.map(async (id: BitId) => {
      const idFromBitMap = authoredAndImported.searchWithoutScopeAndVersion(id);
      if (idFromBitMap && !idFromBitMap.hasVersion()) {
        // component is out of sync, fix it by loading it from the consumer
        const component = await this.consumer.loadComponent(id.changeVersion(LATEST));
        return component.id;
      }
      return id;
    });
    const updatedIds = await Promise.all(updatedIdsP);
    return BitIds.fromArray(updatedIds);
  }

  async listExportPendingComponents(): Promise<ModelComponent[]> {
    const exportPendingComponentsIds: BitIds = await this.listExportPendingComponentsIds();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return Promise.all(exportPendingComponentsIds.map(id => this.scope.getModelComponentIfExist(id)));
  }

  async listAutoTagPendingComponents(): Promise<ModelComponent[]> {
    const modifiedComponents = await this.listModifiedComponents();
    if (!modifiedComponents || !modifiedComponents.length) return [];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const modifiedComponentsLatestVersions = await this.scope.latestVersions(modifiedComponents);
    return this.consumer.listComponentsForAutoTagging(modifiedComponentsLatestVersions);
  }

  idsFromBitMap(origin?: string): BitId[] {
    const fromBitMap = this.getFromBitMap(origin);
    return fromBitMap;
  }

  /**
   * Finds all components that are saved in the file system.
   * Components might be stored in the default component directory and also might be outside
   * of that directory. The bit.map is used to find them all
   * If they are on bit.map but not on the file-system, populate them to _invalidComponents property
   */
  async getFromFileSystem(origin?: string): Promise<Component[]> {
    const cacheKeyName = origin || 'all';
    if (!this._fromFileSystem[cacheKeyName]) {
      const idsFromBitMap = this.idsFromBitMap(origin);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const { components, invalidComponents } = await this.consumer.loadComponents(idsFromBitMap, false);
      this._fromFileSystem[cacheKeyName] = components;
      if (!this._invalidComponents && !origin) {
        this._invalidComponents = invalidComponents;
      }
    }
    return this._fromFileSystem[cacheKeyName];
  }

  /**
   * components that are on bit.map but not on the file-system
   */
  async listInvalidComponents(): Promise<BitId[]> {
    if (!this._invalidComponents) {
      await this.getFromFileSystem();
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this._invalidComponents;
  }

  getFromBitMap(origin?: ComponentOrigin): BitIds {
    const originParam = origin ? [origin] : undefined;
    return this.bitMap.getAllBitIds(originParam);
  }

  getPathsForAllFilesOfAllComponents(origin?: ComponentOrigin, absolute = false): string[] {
    // TODO: maybe cache this as well
    const componentMaps = this.bitMap.getAllComponents(origin);
    const result: string[] = [];
    const populatePaths = (componentMap: ComponentMap) => {
      const relativePaths = componentMap.getFilesRelativeToConsumer();
      if (!absolute) {
        result.push(...relativePaths);
        return;
      }
      const consumerPath = this.consumer.getPath();
      const absPaths = relativePaths.map(relativePath => path.join(consumerPath, relativePath));
      result.push(...absPaths);
    };
    componentMaps.forEach(componentMap => populatePaths(componentMap));
    return result;
  }

  /**
   * get called when the Consumer is available, shows also components from remote scopes
   */
  async listScope(
    showRemoteVersion: boolean,
    includeNested: boolean,
    namespacesUsingWildcards?: string
  ): Promise<ListScopeResult[]> {
    const components: ModelComponent[] = await this.getModelComponents();
    const componentsFilteredByWildcards = namespacesUsingWildcards
      ? ComponentsList.filterComponentsByWildcard(components, namespacesUsingWildcards)
      : components;
    const componentsSorted = ComponentsList.sortComponentsByName(componentsFilteredByWildcards);
    const listScopeResults: ListScopeResult[] = componentsSorted.map((component: ModelComponent) => ({
      id: component.toBitIdWithLatestVersion(),
      deprecated: component.deprecated
    }));
    const componentsIds = listScopeResults.map(result => result.id);
    if (showRemoteVersion) {
      const latestVersionsInfo: BitId[] = await fetchRemoteVersions(this.scope, componentsIds);
      latestVersionsInfo.forEach(componentId => {
        const listResult = listScopeResults.find(c => c.id.isEqualWithoutVersion(componentId));
        if (!listResult) throw new Error(`failed finding ${componentId.toString()} in componentsIds`);
        // $FlowFixMe version must be set as it came from a remote
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        listResult.remoteVersion = componentId.version;
      });
    }
    const authoredAndImportedIds = this.bitMap.getAuthoredAndImportedBitIds();
    listScopeResults.forEach(listResult => {
      const existingBitMapId = authoredAndImportedIds.searchWithoutVersion(listResult.id);
      if (existingBitMapId) {
        listResult.currentlyUsedVersion = existingBitMapId.version;
      }
    });
    if (includeNested) return listScopeResults;
    return listScopeResults.filter(listResult => {
      const componentMap = this.bitMap.getComponentIfExist(listResult.id, { ignoreVersion: true });
      return componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
    });
  }

  /**
   * get called from a bare-scope, shows only components of that scope
   */
  static async listLocalScope(scope: Scope, namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    const components = await scope.listLocal();
    const componentsFilteredByWildcards = namespacesUsingWildcards
      ? ComponentsList.filterComponentsByWildcard(components, namespacesUsingWildcards)
      : components;
    const componentsSorted = ComponentsList.sortComponentsByName(componentsFilteredByWildcards);
    return componentsSorted.map((component: ModelComponent) => ({
      id: component.toBitIdWithLatestVersion(),
      deprecated: component.deprecated
    }));
  }

  // components can be one of the following: Component[] | ModelComponent[] | string[]
  static sortComponentsByName<T>(components: T): T {
    const getName = component => {
      let name;
      if (R.is(ModelComponent, component)) name = component.id();
      else if (R.is(Component, component)) name = component.id.toString();
      else name = component;
      return name.toUpperCase(); // ignore upper and lowercase
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return components.sort((a, b) => {
      const nameA = getName(a);
      const nameB = getName(b);
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      // names must be equal
      return 0;
    });
  }

  static filterComponentsByWildcard<T>(components: T, idsWithWildcard: string[] | string): T {
    const getBitId = (component): BitId => {
      if (R.is(ModelComponent, component)) return component.toBitId();
      if (R.is(Component, component)) return component.id;
      if (R.is(BitId, component)) return component;
      throw new TypeError(`filterComponentsByWildcard got component with the wrong type: ${typeof component}`);
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return components.filter(component => {
      const bitId: BitId = getBitId(component);
      return isBitIdMatchByWildcards(bitId, idsWithWildcard);
    });
  }

  static getUniqueComponents(components: Component[]): Component[] {
    return R.uniqBy(component => JSON.stringify(component.id), components);
  }

  listComponentsByIdsWithWildcard(idsWithWildcard: string[]): BitId[] {
    const allIds = this.bitMap.getAuthoredAndImportedBitIds();
    const matchedIds = ComponentsList.filterComponentsByWildcard(allIds, idsWithWildcard);
    if (!matchedIds.length) throw new NoIdMatchWildcard(idsWithWildcard);
    // $FlowFixMe filterComponentsByWildcard got BitId so it returns BitId
    return matchedIds;
  }
}
