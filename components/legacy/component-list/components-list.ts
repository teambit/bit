import pFilter from 'p-filter';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import R from 'ramda';
import { LATEST } from '@teambit/legacy/dist/constants';
import { Lane } from '@teambit/scope.objects';
import ModelComponent from '@teambit/scope.objects';
import Scope from '@teambit/legacy/dist/scope/scope';
import { fetchRemoteVersions } from '@teambit/scope.remotes';
import { isBitIdMatchByWildcards } from '@teambit/legacy.utils';
import { BitMap, ComponentMap } from '@teambit/legacy.bit-map';
import { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { InvalidComponent, ComponentLoadOptions } from '@teambit/legacy.consumer-component';
import { Consumer } from '@teambit/legacy.consumer';

export type ListScopeResult = {
  id: ComponentID;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  removed?: boolean;
  laneReadmeOf?: string[];
};

export type OutdatedComponent = { id: ComponentID; headVersion: string; latestVersion?: string };

export class ComponentsList {
  consumer: Consumer;
  scope: Scope;
  bitMap: BitMap;
  _fromFileSystem: { [cacheKey: string]: Component[] } = {};
  _fromObjectsIds: ComponentID[];
  _modelComponents: ModelComponent[];
  _invalidComponents: InvalidComponent[];
  _removedComponents: Component[];
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    // @ts-ignore todo: remove after deleting teambit.legacy
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
  async getFromObjects(): Promise<ComponentID[]> {
    if (!this._fromObjectsIds) {
      const modelComponents = await this.getModelComponents();
      this._fromObjectsIds = modelComponents.map((componentObjects) => {
        return ComponentID.fromObject({
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

  async listOutdatedComponents(
    mergePendingComponentIds: ComponentIdList,
    loadOpts?: ComponentLoadOptions
  ): Promise<OutdatedComponent[]> {
    const fileSystemComponents = await this.getComponentsFromFS(loadOpts);
    const componentsFromModel = await this.getModelComponents();
    const unmergedComponents = this.listDuringMergeStateComponents();
    const currentLane = await this.consumer.getCurrentLaneObject();
    const currentLaneIds = currentLane?.toComponentIds();
    const outdatedComps: OutdatedComponent[] = [];
    await Promise.all(
      fileSystemComponents.map(async (component) => {
        const modelComponent = componentsFromModel.find((c) =>
          c.toComponentId().isEqualWithoutVersion(component.componentId)
        );
        if (
          !modelComponent ||
          !component.componentId.hasVersion() ||
          unmergedComponents.hasWithoutVersion(component.componentId)
        )
          return;
        if (mergePendingComponentIds.hasWithoutVersion(component.componentId)) {
          // by default, outdated include merge-pending since the remote-head and local-head are
          // different, however we want them both to be separated as they need different treatment
          return;
        }
        if (currentLaneIds && !currentLaneIds.hasWithoutVersion(component.componentId)) {
          // it's not on the current lane, it's on main. although it's available in the workspace, we don't want to
          // show it in the section of outdated components. because "checkout head" won't work on it.
          return;
        }
        const latestVersionLocally = modelComponent.getHeadRegardlessOfLaneAsTagOrHash();
        const latestIncludeRemoteHead = await modelComponent.headIncludeRemote(this.scope.objects);
        const isOutdated = (): boolean => {
          if (latestIncludeRemoteHead !== latestVersionLocally) return true;
          return modelComponent.isLatestGreaterThan(component.componentId.version);
        };
        if (isOutdated()) {
          outdatedComps.push({
            id: component.componentId,
            headVersion: latestIncludeRemoteHead,
            latestVersion: modelComponent.latestVersionIfExist(),
          });
        }
      })
    );
    return outdatedComps;
  }

  listDuringMergeStateComponents(): ComponentIdList {
    const unmergedComponents = this.scope.objects.unmergedComponents.getComponents();
    return ComponentIdList.fromArray(unmergedComponents.map((u) => ComponentID.fromObject(u.id)));
  }

  async idsFromObjects(): Promise<ComponentIdList> {
    const fromObjects = await this.getFromObjects();
    return new ComponentIdList(...fromObjects);
  }

  /**
   * Components that are registered in bit.map but have never been tagged
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @memberof ComponentsList
   */
  async listNewComponents(load = false, loadOpts?: ComponentLoadOptions): Promise<ComponentIdList | Component[]> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    const newComponents: ComponentID[] = [];
    idsFromBitMap.forEach((id: ComponentID) => {
      if (id.hasScope()) return; // it was exported.
      if (!idsFromObjects.searchWithoutVersion(id)) {
        newComponents.push(id);
      }
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponentsIds = new ComponentIdList(...newComponents);
    if (!load || !newComponents.length) return newComponentsIds;

    const { components } = await this.consumer.loadComponents(newComponentsIds, false, loadOpts);
    return components;
  }

  /**
   * @todo: this is not the full list. It's missing the deleted-components.
   * will be easier to add it here once all legacy are not using this class and then ScopeMain will be in the
   * constructor.
   */
  async listExportPendingComponentsIds(lane?: Lane | null): Promise<ComponentIdList> {
    const fromBitMap = this.bitMap.getAllIdsAvailableOnLaneIncludeRemoved();
    const modelComponents = await this.getModelComponents();
    const pendingExportComponents = await pFilter(modelComponents, async (component: ModelComponent) => {
      if (!fromBitMap.searchWithoutVersion(component.toComponentId())) {
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
    const ids = ComponentIdList.fromArray(pendingExportComponents.map((c) => c.toComponentId()));
    return this.updateIdsFromModelIfTheyOutOfSync(ids);
  }

  async listNonNewComponentsIds(loadOpts?: ComponentLoadOptions): Promise<ComponentIdList> {
    const authoredAndImported = await this.getComponentsFromFS(loadOpts);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const newComponents: ComponentIdList = await this.listNewComponents();
    const nonNewComponents = authoredAndImported.filter((component) => !newComponents.has(component.componentId));
    return ComponentIdList.fromArray(nonNewComponents.map((c) => c.componentId.changeVersion(undefined)));
  }

  async updateIdsFromModelIfTheyOutOfSync(
    ids: ComponentIdList,
    loadOpts?: ComponentLoadOptions
  ): Promise<ComponentIdList> {
    const updatedIdsP = ids.map(async (id: ComponentID) => {
      const componentMap = this.bitMap.getComponentIfExist(id, { ignoreVersion: true });
      if (!componentMap || componentMap.id.hasVersion()) return id;
      const areSameScope = id.scope ? id.scope === componentMap.defaultScope : true;
      if (!areSameScope) return id;
      // component is out of sync, fix it by loading it from the consumer
      const component = await this.consumer.loadComponent(id.changeVersion(LATEST), loadOpts);
      return component.componentId;
    });
    const updatedIds = await Promise.all(updatedIdsP);
    return ComponentIdList.fromArray(updatedIds);
  }

  async listExportPendingComponents(laneObj?: Lane): Promise<ModelComponent[]> {
    const exportPendingComponentsIds: ComponentIdList = await this.listExportPendingComponentsIds(laneObj);
    return Promise.all(exportPendingComponentsIds.map((id) => this.scope.getModelComponent(id)));
  }

  idsFromBitMap(): ComponentIdList {
    return this.bitMap.getAllIdsAvailableOnLane();
  }

  async listAllIdsFromWorkspaceAndScope(): Promise<ComponentIdList> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    return ComponentIdList.uniqFromArray([...idsFromBitMap, ...idsFromObjects]);
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
   * components that were deleted by soft-remove (bit remove --delete) and were not tagged/snapped after this change.
   * practically, their bitmap record has the config or "removed: true" and the component has deleted from the filesystem
   * in bit-status, we suggest to snap+export.
   */
  async listLocallySoftRemoved(): Promise<ComponentID[]> {
    return this.consumer.bitMap.getRemoved();
  }

  /**
   * components that were soft-removed previously (probably in another workspace), exported and re-introduced here.
   * practically, the current `Version` object has a config with "removed: true", and the component exists in the filesystem
   * in bit-status we suggest to "bit remove".
   */
  async listRemotelySoftRemoved(): Promise<Component[]> {
    const fromFs = await this.getFromFileSystem();
    // if it's during-merge it might be removed on the other lane remote, not this lane remote and then upon snap/tag
    // the component will be removed from the workspace, so no need to suggest using "bit remove".
    const duringMerge = this.listDuringMergeStateComponents();
    const removed = fromFs.filter((comp) => comp.isRemoved());
    return removed.filter((comp) => !duringMerge.hasWithoutVersion(comp.componentId));
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
    const modelComponentsIds = modelComponents.map((c) => c.toComponentId());
    const allIds = listScope
      ? modelComponentsIds
      : ComponentIdList.uniqFromArray([...authoredAndImportedIdsNoVer, ...modelComponentsIds]);
    const idsFilteredByWildcards = namespacesUsingWildcards
      ? ComponentsList.filterComponentsByWildcard(allIds, `**/${namespacesUsingWildcards}`)
      : allIds;
    const idsSorted = ComponentID.sortIds(idsFilteredByWildcards);
    const listAllResults: ListScopeResult[] = await Promise.all(
      idsSorted.map(async (id: ComponentID) => {
        const component = modelComponents.find((c) => c.toComponentId().isEqualWithoutVersion(id));
        const laneReadmeOf = await component?.isLaneReadmeOf(this.scope.objects);

        const deprecated = await component?.isDeprecated(this.scope.objects);
        return {
          id: component ? component.toComponentIdWithLatestVersion() : id,
          deprecated: Boolean(deprecated),
          laneReadmeOf,
        };
      })
    );
    const componentsIds = listAllResults.map((result) => result.id);
    if (showRemoteVersion) {
      const latestVersionsInfo: ComponentID[] = await fetchRemoteVersions(this.scope, componentsIds);
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
      if (componentMap.isAvailableOnCurrentLane) return true;
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
    const getNameSpaceIncludeScopeNameIfNeeded = () => {
      if (!namespacesUsingWildcards) return undefined;
      if (namespacesUsingWildcards.startsWith(`${scope.name}/`)) return namespacesUsingWildcards;
      return `${scope.name}/${namespacesUsingWildcards}`;
    };
    const nameSpaceIncludeScopeName = getNameSpaceIncludeScopeNameIfNeeded();
    const componentsFilteredByWildcards = nameSpaceIncludeScopeName
      ? ComponentsList.filterComponentsByWildcard(componentsOnMain, nameSpaceIncludeScopeName)
      : componentsOnMain;
    const componentsSorted = ComponentsList.sortComponentsByName(componentsFilteredByWildcards);
    const results = await Promise.all(
      componentsSorted.map(async (component: ModelComponent) => {
        return {
          id: component.toComponentIdWithLatestVersion(),
          deprecated: Boolean(await component.isDeprecated(scope.objects)),
          removed: Boolean(await component.isRemoved(scope.objects)),
          laneReadmeOf: await component.isLaneReadmeOf(scope.objects),
        };
      })
    );
    if (includeRemoved) return results;
    return results.filter((result) => !result.removed);
  }

  // components can be one of the following: Component[] | ModelComponent[] | string[] | ComponentID[]
  static sortComponentsByName<T>(components: T): T {
    const getName = (component) => {
      let name;
      if (R.is(ModelComponent, component)) name = component.id();
      else if (R.is(Component, component)) name = component.componentId.toString();
      else if (R.is(ComponentID, component)) name = component.toString();
      else name = component;
      if (typeof name !== 'string')
        throw new Error(`sortComponentsByName expects name to be a string, got: ${name}, type: ${typeof name}`);
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
    const getBitId = (component): ComponentID => {
      if (R.is(ModelComponent, component)) return component.toComponentId();
      if (R.is(Component, component)) return component.componentId;
      if (R.is(ComponentID, component)) return component;
      throw new TypeError(`filterComponentsByWildcard got component with the wrong type: ${typeof component}`);
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return components.filter((component) => {
      const bitId: ComponentID = getBitId(component);
      return isBitIdMatchByWildcards(bitId, idsWithWildcard);
    });
  }

  static getUniqueComponents(components: Component[]): Component[] {
    return R.uniqBy((component) => JSON.stringify(component.componentId), components);
  }
}
