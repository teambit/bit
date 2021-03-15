import * as path from 'path';
import R from 'ramda';

import NoIdMatchWildcard from '../../api/consumer/lib/exceptions/no-id-match-wildcard';
import { BitId, BitIds } from '../../bit-id';
import { COMPONENT_ORIGINS, LATEST } from '../../constants';
import { DivergeData } from '../../scope/component-ops/diverge-data';
import { Lane } from '../../scope/models';
import ModelComponent from '../../scope/models/model-component';
import Version from '../../scope/models/version';
import Scope from '../../scope/scope';
import { fetchRemoteVersions } from '../../scope/scope-remotes';
import { filterAsync } from '../../utils';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';
import BitMap from '../bit-map/bit-map';
import ComponentMap, { ComponentOrigin } from '../bit-map/component-map';
import Component from '../component';
import { InvalidComponent } from '../component/consumer-component';
import Consumer from '../consumer';

export type ObjectsList = Promise<{ [componentId: string]: Version }>;

export type ListScopeResult = {
  id: BitId;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
};

export type DivergedComponent = { id: BitId; diverge: DivergeData };

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
  // @ts-ignore
  private _mergePendingComponents: DivergedComponent[];
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.bitMap = consumer.bitMap;
  }

  async getModelComponents(): Promise<ModelComponent[]> {
    if (!this._modelComponents) {
      this._modelComponents = await this.scope.listIncludeRemoteHead(this.consumer.getCurrentLaneId());
    }
    return this._modelComponents;
  }

  /**
   * List all bit ids stored in the model
   */
  async getFromObjects(): Promise<BitId[]> {
    if (!this._fromObjectsIds) {
      const modelComponents: ModelComponent[] = await this.getModelComponents();
      this._fromObjectsIds = modelComponents.map((componentObjects) => {
        return new BitId({
          scope: componentObjects.scope,
          name: componentObjects.name,
          version: componentObjects.scope ? componentObjects.latest() : undefined,
        });
      });
    }
    return this._fromObjectsIds;
  }

  async getAuthoredAndImportedFromFS(): Promise<Component[]> {
    let [authored, imported] = await Promise.all([
      this.getFromFileSystem(COMPONENT_ORIGINS.AUTHORED),
      this.getFromFileSystem(COMPONENT_ORIGINS.IMPORTED),
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
      const componentsWithUnresolvedConflicts = this.listDuringMergeStateComponents();
      const componentStatuses = await this.consumer.getManyComponentsStatuses(fileSystemComponents.map((f) => f.id));
      this._modifiedComponents = fileSystemComponents
        .filter((component) => {
          const status = componentStatuses.find((s) => s.id.isEqual(component.id));
          if (!status) throw new Error(`listModifiedComponents unable to find status for ${component.id.toString()}`);
          return status.status.modified;
        })
        .filter((component: Component) => !componentsWithUnresolvedConflicts.hasWithoutScopeAndVersion(component.id));
    }
    if (load) return this._modifiedComponents;
    return this._modifiedComponents.map((component) => component.id);
  }

  async listOutdatedComponents(): Promise<Component[]> {
    const fileSystemComponents = await this.getAuthoredAndImportedFromFS();
    const componentsFromModel = await this.getModelComponents();
    const componentsWithUnresolvedConflicts = this.listDuringMergeStateComponents();
    const mergePendingComponents = await this.listMergePendingComponents();
    const mergePendingComponentsIds = BitIds.fromArray(mergePendingComponents.map((c) => c.id));
    await Promise.all(
      fileSystemComponents.map(async (component) => {
        const modelComponent = componentsFromModel.find((c) => c.toBitId().isEqualWithoutVersion(component.id));
        if (
          !modelComponent ||
          !component.id.hasVersion() ||
          componentsWithUnresolvedConflicts.hasWithoutScopeAndVersion(component.id)
        )
          return;
        if (mergePendingComponentsIds.hasWithoutVersion(component.id)) {
          // by default, outdated include merge-pending since the remote-head and local-head are
          // different, however we want them both to be separated as they need different treatment
          return;
        }
        const latestVersionLocally = modelComponent.latest();
        const latestIncludeRemoteHead = await modelComponent.latestIncludeRemote(this.scope.objects);
        const isOutdated = (): boolean => {
          if (latestIncludeRemoteHead !== latestVersionLocally) return true;
          return modelComponent.isLatestGreaterThan(component.id.version);
        };
        if (isOutdated()) {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          component.latestVersion = latestIncludeRemoteHead;
        }
      })
    );
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return fileSystemComponents.filter((f) => f.latestVersion);
  }

  async listMergePendingComponents(): Promise<DivergedComponent[]> {
    if (!this._mergePendingComponents) {
      const componentsFromFs = await this.getAuthoredAndImportedFromFS();
      const componentsFromModel = await this.getModelComponents();
      const componentsWithUnresolvedConflicts = this.listDuringMergeStateComponents();
      this._mergePendingComponents = (
        await Promise.all(
          componentsFromFs.map(async (component: Component) => {
            const modelComponent = componentsFromModel.find((c) => c.toBitId().isEqualWithoutVersion(component.id));
            if (!modelComponent || componentsWithUnresolvedConflicts.hasWithoutScopeAndVersion(component.id))
              return null;
            await modelComponent.setDivergeData(this.scope.objects);
            const divergedData = modelComponent.getDivergeData();
            if (!modelComponent.getDivergeData().isDiverged()) return null;
            return { id: modelComponent.toBitId(), diverge: divergedData };
          })
        )
      ).filter((x) => x) as DivergedComponent[];
    }
    return this._mergePendingComponents;
  }

  listComponentsWithUnresolvedConflicts(): BitIds {
    const unresolvedComponents = this.scope.objects.unmergedComponents.getUnresolvedComponents();
    return BitIds.fromArray(unresolvedComponents.map((u) => new BitId(u.id)));
  }

  listDuringMergeStateComponents(): BitIds {
    const unresolvedComponents = this.scope.objects.unmergedComponents.getComponents();
    return BitIds.fromArray(unresolvedComponents.map((u) => new BitId(u.id)));
  }

  listSoftTaggedComponents(): BitId[] {
    return this.bitMap.components.filter((c) => c.nextVersion).map((c) => c.id);
  }

  async newModifiedAndAutoTaggedComponents(): Promise<Component[]> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(true),
      this.listModifiedComponents(true),
    ]);

    const autoTagPending: Component[] = await this.listAutoTagPendingComponents();

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
      if (!idsFromObjects.searchWithoutVersion(id)) {
        newComponents.push(id);
      }
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponentsIds = new BitIds(...newComponents);
    if (!load || !newComponents.length) return newComponentsIds;

    const { components } = await this.consumer.loadComponents(newComponentsIds, false);
    return components;
  }

  async listTagPendingOfAllScope(includeImported = false): Promise<BitId[]> {
    const tagPendingComponents = this.idsFromBitMap(COMPONENT_ORIGINS.AUTHORED);
    if (includeImported) {
      const importedComponents = this.idsFromBitMap(COMPONENT_ORIGINS.IMPORTED);
      tagPendingComponents.push(...importedComponents);
    }

    return tagPendingComponents;
  }

  /**
   * New and modified components are tag pending
   *
   * @return {Promise<string[]>}
   */
  async listTagPendingComponents(): Promise<BitIds> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(),
      this.listModifiedComponents(),
    ]);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return BitIds.fromArray([...newComponents, ...modifiedComponents]);
  }

  async listExportPendingComponentsIds(lane?: Lane | null): Promise<BitIds> {
    const modelComponents = await this.getModelComponents();
    const pendingExportComponents = await filterAsync(modelComponents, (component: ModelComponent) =>
      component.isLocallyChanged(lane, this.scope.objects)
    );
    const ids = BitIds.fromArray(pendingExportComponents.map((c) => c.toBitId()));
    return this.updateIdsFromModelIfTheyOutOfSync(ids);
  }

  async listNonNewComponentsIds(): Promise<BitIds> {
    const authoredAndImported = await this.getAuthoredAndImportedFromFS();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponents: BitIds = await this.listNewComponents();
    const nonNewComponents = authoredAndImported.filter((component) => !newComponents.has(component.id));
    return BitIds.fromArray(nonNewComponents.map((c) => c.id.changeVersion(undefined)));
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

  async listExportPendingComponents(laneObj: Lane | null): Promise<ModelComponent[]> {
    const exportPendingComponentsIds: BitIds = await this.listExportPendingComponentsIds(laneObj);
    return Promise.all(exportPendingComponentsIds.map((id) => this.scope.getModelComponent(id)));
  }

  async listAutoTagPendingComponents(): Promise<Component[]> {
    const modifiedComponents = (await this.listModifiedComponents()) as BitId[];
    if (!modifiedComponents || !modifiedComponents.length) return [];
    return this.consumer.listComponentsForAutoTagging(BitIds.fromArray(modifiedComponents));
  }

  idsFromBitMap(origin?: ComponentOrigin): BitIds {
    const fromBitMap = this.getFromBitMap(origin);
    return fromBitMap;
  }

  async listAllIdsFromWorkspaceAndScope(): Promise<BitIds> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    return BitIds.uniqFromArray([...idsFromBitMap, ...idsFromObjects]);
  }

  /**
   * Finds all components that are saved in the file system.
   * Components might be stored in the default component directory and also might be outside
   * of that directory. The bit.map is used to find them all
   * If they are on bit.map but not on the file-system, populate them to _invalidComponents property
   */
  async getFromFileSystem(origin?: ComponentOrigin): Promise<Component[]> {
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
  async listInvalidComponents(): Promise<InvalidComponent[]> {
    if (!this._invalidComponents) {
      await this.getFromFileSystem();
    }
    return this._invalidComponents;
  }

  /**
   * valid on legacy only. Harmony requires components to have their own directories
   */
  async listComponentsWithIndividualFiles(): Promise<Component[]> {
    if (this.consumer.isLegacy) return [];
    const workspaceComponents = await this.getFromFileSystem(COMPONENT_ORIGINS.AUTHORED);
    return workspaceComponents.filter((component) => {
      const componentMap = component.componentMap;
      if (!componentMap) throw new Error('listComponentsWithIndividualFiles componentMap is missing');
      return Boolean(!componentMap.trackDir && !componentMap.rootDir);
    });
  }

  /**
   * valid on legacy only. Harmony creates `rootDir` instead of the `trackDir`.
   */
  async listComponentsWithTrackDir() {
    if (this.consumer.isLegacy) return [];
    const workspaceComponents = await this.getFromFileSystem(COMPONENT_ORIGINS.AUTHORED);
    return workspaceComponents.filter((component) => {
      const componentMap = component.componentMap;
      if (!componentMap) throw new Error('listComponentsWithIndividualFiles componentMap is missing');
      return Boolean(componentMap.trackDir);
    });
  }

  getFromBitMap(origin?: ComponentOrigin): BitIds {
    const originParam = origin ? [origin] : undefined;
    return this.bitMap.getAllIdsAvailableOnLane(originParam);
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
      const absPaths = relativePaths.map((relativePath) => path.join(consumerPath, relativePath));
      result.push(...absPaths);
    };
    componentMaps.forEach((componentMap) => populatePaths(componentMap));
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
      deprecated: component.deprecated,
    }));
    const componentsIds = listScopeResults.map((result) => result.id);
    if (showRemoteVersion) {
      const latestVersionsInfo: BitId[] = await fetchRemoteVersions(this.scope, componentsIds);
      latestVersionsInfo.forEach((componentId) => {
        const listResult = listScopeResults.find((c) => c.id.isEqualWithoutVersion(componentId));
        if (!listResult) throw new Error(`failed finding ${componentId.toString()} in componentsIds`);
        // $FlowFixMe version must be set as it came from a remote
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        listResult.remoteVersion = componentId.version;
      });
    }
    const authoredAndImportedIds = this.bitMap.getAuthoredAndImportedBitIds();
    listScopeResults.forEach((listResult) => {
      const existingBitMapId = authoredAndImportedIds.searchWithoutVersion(listResult.id);
      if (existingBitMapId) {
        listResult.currentlyUsedVersion = existingBitMapId.version;
      }
    });
    if (includeNested) return listScopeResults;
    const currentLane = await this.consumer.getCurrentLaneObject();
    const isIdOnCurrentLane = (componentMap: ComponentMap): boolean => {
      if (!componentMap.onLanesOnly) return true; // component is on master, always show it
      if (!currentLane) return false; // if !currentLane the user is on master, don't show it.
      return Boolean(currentLane.getComponent(componentMap.id));
    };
    return listScopeResults.filter((listResult) => {
      const componentMap = this.bitMap.getComponentIfExist(listResult.id, { ignoreVersion: true });
      return componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED && isIdOnCurrentLane(componentMap);
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
      deprecated: component.deprecated,
    }));
  }

  // components can be one of the following: Component[] | ModelComponent[] | string[] | BitId[]
  static sortComponentsByName<T>(components: T): T {
    const getName = (component) => {
      let name;
      if (R.is(ModelComponent, component)) name = component.id();
      else if (R.is(Component, component)) name = component.id.toString();
      else if (R.is(BitId, component)) name = component.toString();
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
    return components.filter((component) => {
      const bitId: BitId = getBitId(component);
      return isBitIdMatchByWildcards(bitId, idsWithWildcard);
    });
  }

  static getUniqueComponents(components: Component[]): Component[] {
    return R.uniqBy((component) => JSON.stringify(component.id), components);
  }

  listComponentsByIdsWithWildcard(idsWithWildcard: string[]): BitId[] {
    const allIds = this.bitMap.getAuthoredAndImportedBitIds();
    const matchedIds = ComponentsList.filterComponentsByWildcard(allIds, idsWithWildcard);
    if (!matchedIds.length) throw new NoIdMatchWildcard(idsWithWildcard);
    // $FlowFixMe filterComponentsByWildcard got BitId so it returns BitId
    return matchedIds;
  }
}
