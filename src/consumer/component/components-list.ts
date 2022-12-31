import { compact } from 'lodash';
import R from 'ramda';
import NoIdMatchWildcard from '../../api/consumer/lib/exceptions/no-id-match-wildcard';
import { BitId, BitIds } from '../../bit-id';
import { LATEST } from '../../constants';
import { SnapsDistance } from '../../scope/component-ops/snaps-distance';
import { getDivergeData } from '../../scope/component-ops/get-diverge-data';
import { Lane } from '../../scope/models';
import ModelComponent from '../../scope/models/model-component';
import Scope from '../../scope/scope';
import { fetchRemoteVersions } from '../../scope/scope-remotes';
import { filterAsync } from '../../utils';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';
import BitMap from '../bit-map/bit-map';
import ComponentMap from '../bit-map/component-map';
import Component from '../component';
import { InvalidComponent } from '../component/consumer-component';
import Consumer from '../consumer';
import { ComponentLoadOptions } from './component-loader';

export type DivergeDataPerId = { id: BitId; divergeData: SnapsDistance };
export type ListScopeResult = {
  id: BitId;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  removed?: boolean;
  laneReadmeOf?: string[];
};

export type DivergedComponent = { id: BitId; diverge: SnapsDistance };
export type OutdatedComponent = { id: BitId; headVersion: string; latestVersion?: string };

export default class ComponentsList {
  consumer: Consumer;
  scope: Scope;
  bitMap: BitMap;
  _fromFileSystem: { [cacheKey: string]: Component[] } = {};
  _fromObjectsIds: BitId[];
  _modelComponents: ModelComponent[];
  _invalidComponents: InvalidComponent[];
  _modifiedComponents: Component[];
  _removedComponents: Component[];
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
      const modelComponents = await this.getModelComponents();
      this._fromObjectsIds = modelComponents.map((componentObjects) => {
        return new BitId({
          scope: componentObjects.scope,
          name: componentObjects.name,
          version: componentObjects.scope ? componentObjects.getHeadRegardlessOfLaneAsTagOrHash(true) : undefined,
        });
      });
    }
    return this._fromObjectsIds;
  }

  async getComponentsFromFS(loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    return this.getFromFileSystem(loadOpts);
  }

  /**
   * Components that are in the model (either, tagged from a local scope or imported), and were
   * changed in the file system
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   */
  async listModifiedComponents(load = false, loadOpts?: ComponentLoadOptions): Promise<Array<BitId | Component>> {
    if (!this._modifiedComponents) {
      const fileSystemComponents = await this.getComponentsFromFS(loadOpts);
      const unmergedComponents = this.listDuringMergeStateComponents();
      const componentStatuses = await this.consumer.getManyComponentsStatuses(fileSystemComponents.map((f) => f.id));
      this._modifiedComponents = fileSystemComponents
        .filter((component) => {
          const status = componentStatuses.find((s) => s.id.isEqual(component.id));
          if (!status) throw new Error(`listModifiedComponents unable to find status for ${component.id.toString()}`);
          return status.status.modified;
        })
        .filter((component: Component) => !unmergedComponents.hasWithoutScopeAndVersion(component.id));
    }
    if (load) return this._modifiedComponents;
    return this._modifiedComponents.map((component) => component.id);
  }

  async listOutdatedComponents(loadOpts?: ComponentLoadOptions): Promise<OutdatedComponent[]> {
    const fileSystemComponents = await this.getComponentsFromFS(loadOpts);
    const componentsFromModel = await this.getModelComponents();
    const unmergedComponents = this.listDuringMergeStateComponents();
    const mergePendingComponents = await this.listMergePendingComponents();
    const mergePendingComponentsIds = BitIds.fromArray(mergePendingComponents.map((c) => c.id));
    const currentLane = await this.consumer.getCurrentLaneObject();
    const currentLaneIds = currentLane?.toBitIds();
    const outdatedComps: OutdatedComponent[] = [];
    await Promise.all(
      fileSystemComponents.map(async (component) => {
        const modelComponent = componentsFromModel.find((c) => c.toBitId().isEqualWithoutVersion(component.id));
        if (!modelComponent || !component.id.hasVersion() || unmergedComponents.hasWithoutScopeAndVersion(component.id))
          return;
        if (mergePendingComponentsIds.hasWithoutVersion(component.id)) {
          // by default, outdated include merge-pending since the remote-head and local-head are
          // different, however we want them both to be separated as they need different treatment
          return;
        }
        if (currentLaneIds && !currentLaneIds.hasWithoutVersion(component.id)) {
          // it's not on the current lane, it's on main. although it's available in the workspace, we don't want to
          // show it in the section of outdated components. because "checkout head" won't work on it.
          return;
        }
        const latestVersionLocally = modelComponent.getHeadRegardlessOfLaneAsTagOrHash();
        const latestIncludeRemoteHead = await modelComponent.headIncludeRemote(this.scope.objects);
        const isOutdated = (): boolean => {
          if (latestIncludeRemoteHead !== latestVersionLocally) return true;
          return modelComponent.isLatestGreaterThan(component.id.version);
        };
        if (isOutdated()) {
          outdatedComps.push({
            id: component.id,
            headVersion: latestIncludeRemoteHead,
            latestVersion: modelComponent.latestVersionIfExist(),
          });
        }
      })
    );
    return outdatedComps;
  }

  /**
   * list components that their head is a snap, not a tag.
   * this is relevant only when the lane is the default (main), otherwise, the head is always a snap.
   * components that are during-merge are filtered out, we don't want them during tag and don't want
   * to show them in the "snapped" section in bit-status.
   */
  async listSnappedComponentsOnMain() {
    if (!this.consumer.isOnMain()) {
      return [];
    }
    const componentsFromModel = await this.getModelComponents();
    const authoredAndImportedIds = this.bitMap.getAllBitIds();
    const compsDuringMerge = this.listDuringMergeStateComponents();
    return componentsFromModel
      .filter((c) => authoredAndImportedIds.hasWithoutVersion(c.toBitId()))
      .filter((c) => !compsDuringMerge.hasWithoutVersion(c.toBitId()))
      .filter((c) => c.isHeadSnap());
  }

  /**
   * list components on a lane that their main got updates.
   */
  async listUpdatesFromMainPending(): Promise<DivergeDataPerId[]> {
    if (this.consumer.isOnMain()) {
      return [];
    }
    const allIds = this.bitMap.getAllBitIds();

    const duringMergeIds = this.listDuringMergeStateComponents();

    const componentsFromModel = await this.getModelComponents();
    const compFromModelOnWorkspace = componentsFromModel
      .filter((c) => allIds.hasWithoutVersion(c.toBitId()))
      // if a component is merge-pending, it needs to be resolved first before getting more updates from main
      .filter((c) => !duringMergeIds.hasWithoutVersion(c.toBitId()));

    const results = await Promise.all(
      compFromModelOnWorkspace.map(async (modelComponent) => {
        const headOnMain = modelComponent.head;
        if (!headOnMain) return undefined;
        const checkedOutVersion = allIds.searchWithoutVersion(modelComponent.toBitId())?.version;
        if (!checkedOutVersion) {
          throw new Error(`listUpdatesFromMainPending: unable to find ${modelComponent.toBitId()} in the workspace`);
        }
        const headOnLane = modelComponent.getRef(checkedOutVersion);

        const divergeData = await getDivergeData({
          repo: this.scope.objects,
          modelComponent,
          targetHead: headOnMain,
          sourceHead: headOnLane,
          throws: false,
        });
        if (!divergeData.snapsOnTargetOnly.length && !divergeData.err) return undefined;
        return { id: modelComponent.toBitId(), divergeData };
      })
    );

    return compact(results);
  }

  /**
   * if the local lane was forked from another lane, this gets the differences between the two
   */
  async listUpdatesFromForked(): Promise<DivergeDataPerId[]> {
    if (this.consumer.isOnMain()) {
      return [];
    }
    const lane = await this.consumer.getCurrentLaneObject();
    const forkedFromLaneId = lane?.forkedFrom;
    if (!forkedFromLaneId) {
      return [];
    }
    const forkedFromLane = await this.scope.loadLane(forkedFromLaneId);
    if (!forkedFromLane) return []; // should we fetch it here?

    const authoredAndImportedIds = this.bitMap.getAllBitIds();

    const duringMergeIds = this.listDuringMergeStateComponents();

    const componentsFromModel = await this.getModelComponents();
    const compFromModelOnWorkspace = componentsFromModel
      .filter((c) => authoredAndImportedIds.hasWithoutVersion(c.toBitId()))
      // if a component is merge-pending, it needs to be resolved first before getting more updates from main
      .filter((c) => !duringMergeIds.hasWithoutVersion(c.toBitId()));

    const remoteForkedLane = await this.scope.objects.remoteLanes.getRemoteLane(forkedFromLaneId);
    if (!remoteForkedLane.length) return [];

    const results = await Promise.all(
      compFromModelOnWorkspace.map(async (modelComponent) => {
        const headOnForked = remoteForkedLane.find((c) => c.id.isEqualWithoutVersion(modelComponent.toBitId()));
        const headOnLane = modelComponent.laneHeadLocal;
        if (!headOnForked || !headOnLane) return undefined;
        const divergeData = await getDivergeData({
          repo: this.scope.objects,
          modelComponent,
          targetHead: headOnForked.head,
          sourceHead: headOnLane,
          throws: false,
        });
        if (!divergeData.snapsOnTargetOnly.length && !divergeData.err) return undefined;
        return { id: modelComponent.toBitId(), divergeData };
      })
    );

    return compact(results);
  }

  async listMergePendingComponents(loadOpts?: ComponentLoadOptions): Promise<DivergedComponent[]> {
    if (!this._mergePendingComponents) {
      const componentsFromFs = await this.getComponentsFromFS(loadOpts);
      const componentsFromModel = await this.getModelComponents();
      const duringMergeComps = this.listDuringMergeStateComponents();
      const updatesFromMain = await this.listUpdatesFromMainPending();
      this._mergePendingComponents = (
        await Promise.all(
          componentsFromFs.map(async (component: Component) => {
            const modelComponent = componentsFromModel.find((c) => c.toBitId().isEqualWithoutVersion(component.id));
            if (!modelComponent || duringMergeComps.hasWithoutScopeAndVersion(component.id)) return null;
            if (updatesFromMain.find((item) => item.id.isEqualWithoutVersion(component.id))) return null;
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

  listDuringMergeStateComponents(): BitIds {
    const unmergedComponents = this.scope.objects.unmergedComponents.getComponents();
    return BitIds.fromArray(unmergedComponents.map((u) => new BitId(u.id)));
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

  async idsFromObjects(): Promise<BitIds> {
    const fromObjects = await this.getFromObjects();
    return new BitIds(...fromObjects);
  }

  /**
   * Components that are registered in bit.map but have never been tagged
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @memberof ComponentsList
   */
  async listNewComponents(load = false, loadOpts?: ComponentLoadOptions): Promise<BitIds | Component[]> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    const newComponents: BitId[] = [];
    idsFromBitMap.forEach((id: BitId) => {
      if (id.hasScope()) return; // it was exported.
      if (!idsFromObjects.searchWithoutVersion(id)) {
        newComponents.push(id);
      }
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponentsIds = new BitIds(...newComponents);
    if (!load || !newComponents.length) return newComponentsIds;

    const { components } = await this.consumer.loadComponents(newComponentsIds, false, loadOpts);
    return components;
  }

  /**
   * list all components that can be tagged.
   */
  async listPotentialTagAllWorkspace(): Promise<BitId[]> {
    return this.idsFromBitMap();
  }

  /**
   * New and modified components are tag pending
   *
   * @return {Promise<string[]>}
   */
  async listTagPendingComponents(): Promise<BitIds> {
    const newComponents = await this.listNewComponents();
    const modifiedComponents = await this.listModifiedComponents();
    const removedComponents = await this.listLocallySoftRemoved();
    const duringMergeIds = this.listDuringMergeStateComponents();

    return BitIds.fromArray([
      ...(newComponents as BitId[]),
      ...(modifiedComponents as BitId[]),
      ...removedComponents,
      ...duringMergeIds,
    ]);
  }

  async listExportPendingComponentsIds(lane?: Lane | null): Promise<BitIds> {
    const fromBitMap = this.bitMap.getAllBitIds();
    const modelComponents = await this.getModelComponents();
    const pendingExportComponents = await filterAsync(modelComponents, async (component: ModelComponent) => {
      if (!fromBitMap.searchWithoutVersion(component.toBitId())) {
        // it's not on the .bitmap only in the scope, as part of the out-of-sync feature, it should
        // be considered as staged and should be exported. same for soft-removed components, which are on scope only.
        // notice that we use `hasLocalChanges`
        // and not `isLocallyChanged` by purpose. otherwise, cached components that were not
        // updated from a remote will be calculated as remote-ahead in the setDivergeData and will
        // be exported unexpectedly.
        return component.isLocallyChangedRegardlessOfLanes();
      }
      await component.setDivergeData(this.scope.objects);
      return component.isLocallyChanged(this.scope.objects, lane);
    });
    const ids = BitIds.fromArray(pendingExportComponents.map((c) => c.toBitId()));
    return this.updateIdsFromModelIfTheyOutOfSync(ids);
  }

  async listNonNewComponentsIds(loadOpts?: ComponentLoadOptions): Promise<BitIds> {
    const authoredAndImported = await this.getComponentsFromFS(loadOpts);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponents: BitIds = await this.listNewComponents();
    const nonNewComponents = authoredAndImported.filter((component) => !newComponents.has(component.id));
    return BitIds.fromArray(nonNewComponents.map((c) => c.id.changeVersion(undefined)));
  }

  async updateIdsFromModelIfTheyOutOfSync(ids: BitIds, loadOpts?: ComponentLoadOptions): Promise<BitIds> {
    const authoredAndImported = this.bitMap.getAllBitIds();
    const updatedIdsP = ids.map(async (id: BitId) => {
      const idFromBitMap = authoredAndImported.searchWithoutScopeAndVersion(id);
      if (idFromBitMap && !idFromBitMap.hasVersion()) {
        // component is out of sync, fix it by loading it from the consumer
        const component = await this.consumer.loadComponent(id.changeVersion(LATEST), loadOpts);
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
    const newComponents = (await this.listNewComponents()) as BitIds;
    if (!modifiedComponents || !modifiedComponents.length) return [];
    const autoTagPending = await this.consumer.listComponentsForAutoTagging(BitIds.fromArray(modifiedComponents));
    return autoTagPending.filter((autoTagComp) => !newComponents.has(autoTagComp.id));
  }

  idsFromBitMap(): BitIds {
    return this.bitMap.getAllIdsAvailableOnLane();
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
  async getFromFileSystem(loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    const cacheKeyName = 'all';
    if (!this._fromFileSystem[cacheKeyName]) {
      const idsFromBitMap = this.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
      const { components, invalidComponents, removedComponents } = await this.consumer.loadComponents(
        idsFromBitMap,
        false,
        loadOpts
      );
      this._fromFileSystem[cacheKeyName] = components;
      if (!this._invalidComponents) {
        this._invalidComponents = invalidComponents;
      }
      if (!this._removedComponents) {
        this._removedComponents = removedComponents;
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
   * components that were deleted by soft-remove (bit remove --soft) and were not tagged/snapped after this change.
   * practically, their bitmap record has the config or "removed: true" and the component has deleted from the filesystem
   * in bit-status, we suggest to snap+export.
   */
  async listLocallySoftRemoved(): Promise<BitId[]> {
    if (!this._removedComponents) {
      await this.getFromFileSystem();
    }
    return this._removedComponents.map((c) => c.id);
  }

  /**
   * components that were soft-removed previously (probably in another workspace), exported and re-introduced here.
   * practically, the current `Version` object has a config with "removed: true", and the component exists in the filesystem
   * in bit-status we suggest to "bit remove".
   */
  async listRemotelySoftRemoved(): Promise<Component[]> {
    const fromFs = await this.getFromFileSystem();
    return fromFs.filter((comp) => comp.componentFromModel?.removed);
  }

  /**
   * valid on legacy only. Harmony requires components to have their own directories
   */
  async listComponentsWithIndividualFiles(): Promise<Component[]> {
    const workspaceComponents = await this.getFromFileSystem();
    return workspaceComponents.filter((component) => {
      const componentMap = component.componentMap;
      if (!componentMap) throw new Error('listComponentsWithIndividualFiles componentMap is missing');
      return Boolean(!componentMap.rootDir);
    });
  }

  /**
   * get called when the Consumer is available, shows also components from remote scopes
   */
  async listAll(
    showRemoteVersion: boolean,
    listScope: boolean,
    namespacesUsingWildcards?: string
  ): Promise<ListScopeResult[]> {
    const modelComponents: ModelComponent[] = await this.getModelComponents();
    const authoredAndImportedIds = this.bitMap.getAllBitIds();
    const authoredAndImportedIdsNoVer = authoredAndImportedIds.map((id) => id.changeVersion(undefined));
    const modelComponentsIds = modelComponents.map((c) => c.toBitId());
    const allIds = listScope
      ? modelComponentsIds
      : BitIds.uniqFromArray([...authoredAndImportedIdsNoVer, ...modelComponentsIds]);
    const idsFilteredByWildcards = namespacesUsingWildcards
      ? ComponentsList.filterComponentsByWildcard(allIds, namespacesUsingWildcards)
      : allIds;
    const idsSorted = ComponentsList.sortComponentsByName(idsFilteredByWildcards);
    const listAllResults: ListScopeResult[] = await Promise.all(
      idsSorted.map(async (id: BitId) => {
        const component = modelComponents.find((c) => c.toBitId().isEqualWithoutVersion(id));
        const laneReadmeOf = await component?.isLaneReadmeOf(this.scope.objects);

        const deprecated = await component?.isDeprecated(this.scope.objects);
        return {
          id: component ? component.toBitIdWithLatestVersion() : id,
          deprecated,
          laneReadmeOf,
        };
      })
    );
    const componentsIds = listAllResults.map((result) => result.id);
    if (showRemoteVersion) {
      const latestVersionsInfo: BitId[] = await fetchRemoteVersions(this.scope, componentsIds);
      latestVersionsInfo.forEach((componentId) => {
        const listResult = listAllResults.find((c) => c.id.isEqualWithoutVersion(componentId));
        if (!listResult) throw new Error(`failed finding ${componentId.toString()} in componentsIds`);
        // $FlowFixMe version must be set as it came from a remote
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        listResult.remoteVersion = componentId.version;
      });
    }
    listAllResults.forEach((listResult) => {
      const existingBitMapId = authoredAndImportedIds.searchWithoutVersion(listResult.id);
      if (existingBitMapId) {
        listResult.currentlyUsedVersion = existingBitMapId.hasVersion() ? existingBitMapId.version : undefined;
      }
    });
    if (listScope) {
      return listAllResults;
    }
    const currentLane = await this.consumer.getCurrentLaneObject();
    const isIdOnCurrentLane = (componentMap: ComponentMap): boolean => {
      if (componentMap.isRemoved()) return false;
      if (!componentMap.onLanesOnly) return true; // component is on main, always show it
      if (!currentLane) return false; // if !currentLane the user is on main, don't show it.
      return Boolean(currentLane.getComponent(componentMap.id));
    };
    return listAllResults.filter((listResult) => {
      const componentMap = this.bitMap.getComponentIfExist(listResult.id, { ignoreVersion: true });
      return componentMap && isIdOnCurrentLane(componentMap);
    });
  }

  /**
   * get called from a bare-scope, shows only components of that scope
   */
  static async listLocalScope(
    scope: Scope,
    namespacesUsingWildcards?: string,
    includeRemoved = false
  ): Promise<ListScopeResult[]> {
    const components = await scope.listLocal();
    const componentsOnMain = components.filter((comp) => comp.head);
    const componentsFilteredByWildcards = namespacesUsingWildcards
      ? ComponentsList.filterComponentsByWildcard(componentsOnMain, namespacesUsingWildcards)
      : componentsOnMain;
    const componentsSorted = ComponentsList.sortComponentsByName(componentsFilteredByWildcards);
    const results = await Promise.all(
      componentsSorted.map(async (component: ModelComponent) => {
        return {
          id: component.toBitIdWithLatestVersion(),
          deprecated: await component.isDeprecated(scope.objects),
          removed: await component.isRemoved(scope.objects),
          laneReadmeOf: await component.isLaneReadmeOf(scope.objects),
        };
      })
    );
    if (includeRemoved) return results;
    return results.filter((result) => !result.removed);
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
    const allIds = this.bitMap.getAllBitIds();
    const matchedIds = ComponentsList.filterComponentsByWildcard(allIds, idsWithWildcard);
    if (!matchedIds.length) throw new NoIdMatchWildcard(idsWithWildcard);
    // $FlowFixMe filterComponentsByWildcard got BitId so it returns BitId
    return matchedIds;
  }
}
