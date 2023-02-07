/* eslint-disable max-lines */
import memoize from 'memoizee';
import mapSeries from 'p-map-series';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import type { PubsubMain } from '@teambit/pubsub';
import { IssuesList } from '@teambit/component-issues';
import type { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { getAspectDef } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import {
  AspectEntry,
  ComponentMain,
  Component,
  ComponentFactory,
  ComponentID,
  AspectList,
  AspectData,
  InvalidComponent,
  ResolveAspectsOptions,
} from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
import { ComponentScopeDirMap, ConfigMain } from '@teambit/config';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { EnvsMain, EnvsAspect, EnvServiceList } from '@teambit/envs';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony } from '@teambit/harmony';
import { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { isMatchNamespacePatternItem } from '@teambit/workspace.modules.match-pattern';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import type { VariantsMain } from '@teambit/variants';
// import { link } from '@teambit/legacy/dist/api/consumer';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { BitId, InvalidScopeName, InvalidScopeNameFromRemote, isValidScopeName } from '@teambit/legacy-bit-id';
import { LaneId } from '@teambit/lane-id';
import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import { getMaxSizeForComponents, InMemoryCache } from '@teambit/legacy/dist/cache/in-memory-cache';
import { createInMemoryCache } from '@teambit/legacy/dist/cache/cache-factory';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { NoComponentDir } from '@teambit/legacy/dist/consumer/component/exceptions/no-component-dir';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import { pathIsInside } from '@teambit/legacy/dist/utils';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import {
  PathOsBased,
  PathOsBasedRelative,
  PathOsBasedAbsolute,
  pathNormalizeToLinux,
} from '@teambit/legacy/dist/utils/path';
import fs from 'fs-extra';
import { CompIdGraph, DepEdgeType } from '@teambit/graph';
import { slice, uniqBy, difference, compact, isEmpty, merge } from 'lodash';
import { MergeConfigFilename } from '@teambit/legacy/dist/constants';
import path from 'path';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import type { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import { CompilationInitiator } from '@teambit/compiler';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { MissingBitMapComponent } from '@teambit/legacy/dist/consumer/bit-map/exceptions';
import loader from '@teambit/legacy/dist/cli/loader';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { LaneNotFound } from '@teambit/legacy/dist/api/scope/lib/exceptions/lane-not-found';
import { ScopeNotFoundOrDenied } from '@teambit/legacy/dist/remotes/exceptions/scope-not-found-or-denied';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { ComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import { ComponentConfigFile } from './component-config-file';
import {
  OnComponentAdd,
  OnComponentChange,
  OnComponentEventResult,
  OnComponentLoad,
  OnComponentRemove,
  OnMultipleComponentsAdd,
  SerializableResults,
} from './on-component-events';
import { WorkspaceExtConfig } from './types';
import { Watcher, WatchOptions } from './watch/watcher';
import { ComponentStatus } from './workspace-component/component-status';
import {
  OnComponentAddSlot,
  OnComponentChangeSlot,
  OnComponentLoadSlot,
  OnComponentRemoveSlot,
  OnMultipleComponentsAddSlot,
  OnPreWatch,
  OnPreWatchSlot,
} from './workspace.provider';
import { WorkspaceComponentLoader } from './workspace-component/workspace-component-loader';
import { GraphFromFsBuilder, ShouldLoadFunc } from './build-graph-from-fs';
import { BitMap } from './bit-map';
import { WorkspaceAspect } from './workspace.aspect';
import { GraphIdsFromFsBuilder } from './build-graph-ids-from-fs';
import { AspectsMerger } from './aspects-merger';
import { MergeConflictFile } from './merge-conflict-file';

export type EjectConfResult = {
  configPath: string;
};

export const AspectSpecificField = '__specific';
export const ComponentAdded = 'componentAdded';
export const ComponentChanged = 'componentChanged';
export const ComponentRemoved = 'componentRemoved';

export interface EjectConfOptions {
  propagate?: boolean;
  override?: boolean;
}

export type ExtensionsOrigin =
  | 'BitmapFile'
  | 'ModelSpecific'
  | 'ModelNonSpecific'
  | 'ConfigMerge'
  | 'WorkspaceVariants'
  | 'ComponentJsonFile'
  | 'WorkspaceDefault'
  | 'FinalAfterMerge';

const DEFAULT_VENDOR_DIR = 'vendor';

/**
 * API of the Bit Workspace
 */
export class Workspace implements ComponentFactory {
  priority = true;
  owner?: string;
  componentsScopeDirsMap: ComponentScopeDirMap;
  componentLoader: WorkspaceComponentLoader;
  bitMap: BitMap;
  private _cachedListIds?: ComponentID[];
  private componentLoadedSelfAsAspects: InMemoryCache<boolean>; // cache loaded components
  private aspectsMerger: AspectsMerger;
  constructor(
    /**
     * private pubsub.
     */
    private pubsub: PubsubMain,

    private config: WorkspaceExtConfig,
    /**
     * private access to the legacy consumer instance.
     */
    public consumer: Consumer,

    /**
     * access to the workspace `Scope` instance
     */
    readonly scope: ScopeMain,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentAspect: ComponentMain,

    private dependencyResolver: DependencyResolverMain,

    readonly variants: VariantsMain,

    private aspectLoader: AspectLoaderMain,

    readonly logger: Logger,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony,

    /**
     * on component load slot.
     */
    public onComponentLoadSlot: OnComponentLoadSlot,

    /**
     * on component change slot.
     */
    private onComponentChangeSlot: OnComponentChangeSlot,

    readonly envs: EnvsMain,

    /**
     * on component add slot.
     */
    private onComponentAddSlot: OnComponentAddSlot,

    private onComponentRemoveSlot: OnComponentRemoveSlot,

    private onMultipleComponentsAddSlot: OnMultipleComponentsAddSlot,

    private onPreWatchSlot: OnPreWatchSlot,

    private graphql: GraphqlMain
  ) {
    this.componentLoadedSelfAsAspects = createInMemoryCache({ maxSize: getMaxSizeForComponents() });

    // TODO: refactor - prefer to avoid code inside the constructor.
    this.owner = this.config?.defaultOwner;
    this.componentLoader = new WorkspaceComponentLoader(this, logger, dependencyResolver, envs);
    this.validateConfig();
    this.bitMap = new BitMap(this.consumer.bitMap, this.consumer);
    // memoize this method to improve performance.
    this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile = memoize(
      this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile.bind(this),
      {
        primitive: true,
        promise: true,
        maxAge: 60 * 1000, // 1 min
      }
    );
    this.aspectsMerger = new AspectsMerger(this, this.harmony);
  }

  private validateConfig() {
    if (this.consumer.isLegacy) return;
    if (isEmpty(this.config))
      throw new BitError(
        `fatal: workspace config is empty. probably one of bit files is missing. consider running "bit init"`
      );
    const defaultScope = this.config.defaultScope;
    if (!defaultScope) throw new BitError('defaultScope is missing');
    if (!isValidScopeName(defaultScope)) throw new InvalidScopeName(defaultScope);
  }

  /**
   * watcher api.
   */
  readonly watcher = new Watcher(this, this.pubsub);

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
  }

  /** get the `node_modules` folder of this workspace */
  private get modulesPath() {
    return path.join(this.path, 'node_modules');
  }

  get isLegacy(): boolean {
    return this.consumer.isLegacy;
  }

  onComponentLoad(loadFn: OnComponentLoad) {
    this.onComponentLoadSlot.register(loadFn);
    return this;
  }

  registerOnComponentChange(onComponentChangeFunc: OnComponentChange) {
    this.onComponentChangeSlot.register(onComponentChangeFunc);
    return this;
  }

  registerOnComponentAdd(onComponentAddFunc: OnComponentAdd) {
    this.onComponentAddSlot.register(onComponentAddFunc);
    return this;
  }

  registerOnMultipleComponentsAdd(onMultipleComponentsAddFunc: OnMultipleComponentsAdd) {
    this.onMultipleComponentsAddSlot.register(onMultipleComponentsAddFunc);
    return this;
  }

  registerOnComponentRemove(onComponentRemoveFunc: OnComponentRemove) {
    this.onComponentRemoveSlot.register(onComponentRemoveFunc);
    return this;
  }

  registerOnPreWatch(onPreWatchFunc: OnPreWatch) {
    this.onPreWatchSlot.register(onPreWatchFunc);
    return this;
  }

  /**
   * name of the workspace as configured in either `workspace.json`.
   * defaults to workspace root directory name.
   */
  get name() {
    if (this.config.name) return this.config.name;
    const tokenizedPath = this.path.split('/');
    return tokenizedPath[tokenizedPath.length - 1];
  }

  get icon() {
    return this.config.icon;
  }

  async hasModifiedDependencies(component: Component) {
    const componentsList = new ComponentsList(this.consumer);
    const listAutoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
    const isAutoTag = listAutoTagPendingComponents.find((consumerComponent) =>
      consumerComponent.id.isEqualWithoutVersion(component.id._legacy)
    );
    if (isAutoTag) return true;
    return false;
  }

  /**
   * get Component issues
   */
  getComponentIssues(component: Component): IssuesList | null {
    return component.state._consumer.issues || null;
  }

  /**
   * provides status of all components in the workspace.
   */
  async getComponentStatus(component: Component): Promise<ComponentStatus> {
    const status = await this.consumer.getComponentStatusById(component.id._legacy);
    const hasModifiedDependencies = await this.hasModifiedDependencies(component);
    return ComponentStatus.fromLegacy(status, hasModifiedDependencies, component.isOutdated());
  }

  /**
   * list all workspace components.
   */
  async list(filter?: { offset: number; limit: number }, loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    const legacyIds = this.consumer.bitMap.getAllIdsAvailableOnLane();
    const ids = await this.resolveMultipleComponentIds(legacyIds);
    const idsToGet = filter && filter.limit ? slice(ids, filter.offset, filter.offset + filter.limit) : ids;
    return this.getMany(idsToGet, loadOpts);
  }

  /**
   * list all invalid components.
   * (see the invalid criteria in ConsumerComponent.isComponentInvalidByErrorType())
   */
  async listInvalid(): Promise<InvalidComponent[]> {
    const legacyIds = this.consumer.bitMap.getAllIdsAvailableOnLane();
    const ids = await this.resolveMultipleComponentIds(legacyIds);
    return this.componentLoader.getInvalid(ids);
  }

  /**
   * get ids of all workspace components.
   */
  async listIds(): Promise<ComponentID[]> {
    if (this._cachedListIds && this.bitMap.hasChanged()) {
      delete this._cachedListIds;
    }
    if (!this._cachedListIds) {
      this._cachedListIds = await this.resolveMultipleComponentIds(this.consumer.bitmapIdsFromCurrentLane);
    }
    return this._cachedListIds;
  }

  /**
   * Check if a specific id exist in the workspace
   * @param componentId
   */
  async hasId(componentId: ComponentID): Promise<boolean> {
    const ids = await this.listIds();
    const found = ids.find((id) => {
      return id.isEqual(componentId);
    });
    return !!found;
  }

  /**
   * whether or not a workspace has a component with the given name
   */
  async hasName(name: string): Promise<boolean> {
    const ids = await this.listIds();
    return Boolean(ids.find((id) => id.fullName === name));
  }

  /**
   * Check if a specific id exist in the workspace or in the scope
   * @param componentId
   */
  async hasIdNested(componentId: ComponentID, includeCache = true): Promise<boolean> {
    const found = await this.hasId(componentId);
    if (found) return found;
    return this.scope.hasIdNested(componentId, includeCache);
  }

  /**
   * list all modified components in the workspace.
   */
  async modified(): Promise<Component[]> {
    const ids: any = await this.componentList.listModifiedComponents(false);
    const componentIds = ids.map(ComponentID.fromLegacy);
    return this.getMany(componentIds);
  }

  /**
   * list all new components in the workspace.
   */
  async newComponents() {
    const ids: any = await this.componentList.listNewComponents(false);
    const componentIds = ids.map(ComponentID.fromLegacy);
    return this.getMany(componentIds);
  }

  /**
   * get all workspace component-ids, include vendor components.
   * (exclude nested dependencies in case dependencies are saved as components and not packages)
   */
  getAllComponentIds(): Promise<ComponentID[]> {
    const bitIds = this.consumer.bitMap.getAllBitIds();
    return this.resolveMultipleComponentIds(bitIds);
  }

  async getNewAndModifiedIds(): Promise<ComponentID[]> {
    const ids = await this.componentList.listTagPendingComponents();
    return this.resolveMultipleComponentIds(ids);
  }

  async newAndModified(): Promise<Component[]> {
    const ids = await this.getNewAndModifiedIds();
    return this.getMany(ids);
  }

  async getLogs(id: ComponentID, shortHash = false, startsFrom?: string): Promise<ComponentLog[]> {
    return this.scope.getLogs(id, shortHash, startsFrom);
  }

  async getGraph(ids?: ComponentID[], shouldThrowOnMissingDep = true): Promise<Graph<Component, string>> {
    if (!ids || ids.length < 1) ids = await this.listIds();

    return this.buildOneGraphForComponents(ids, undefined, undefined, shouldThrowOnMissingDep);
  }

  async getGraphIds(ids?: ComponentID[], shouldThrowOnMissingDep = true): Promise<CompIdGraph> {
    if (!ids || ids.length < 1) ids = await this.listIds();

    const graphIdsFromFsBuilder = new GraphIdsFromFsBuilder(
      this,
      this.logger,
      this.dependencyResolver,
      shouldThrowOnMissingDep
    );
    return graphIdsFromFsBuilder.buildGraph(ids);
  }

  async getUnavailableOnMainComponents(): Promise<ComponentID[]> {
    const currentLaneId = this.consumer.getCurrentLaneId();
    if (!currentLaneId.isDefault()) return [];
    const allIds = this.consumer.bitMap.getAllBitIdsFromAllLanes();
    const availableIds = this.consumer.bitMap.getAllIdsAvailableOnLane();
    if (allIds.length === availableIds.length) return [];
    const unavailableIds = allIds.filter((id) => !availableIds.hasWithoutScopeAndVersion(id));
    if (!unavailableIds.length) return [];
    const compsWithHead: BitId[] = [];
    await Promise.all(
      unavailableIds.map(async (id) => {
        const modelComp = await this.scope.legacyScope.getModelComponentIfExist(id);
        if (modelComp && modelComp.head) compsWithHead.push(id);
      })
    );
    return this.resolveMultipleComponentIds(compsWithHead);
  }

  async getSavedGraphOfComponentIfExist(component: Component) {
    let versionObj: Version;
    try {
      versionObj = await this.scope.legacyScope.getVersionInstance(component.id._legacy);
    } catch (err) {
      return null;
    }

    const flattenedEdges = versionObj.flattenedEdges;
    if (!flattenedEdges.length && versionObj.flattenedDependencies.length) {
      // there are flattenedDependencies, so must be edges, if they're empty, it's because the component was tagged
      // with a version < ~0.0.901, so this flattenedEdges wasn't exist.
      return null;
    }
    const flattenedBitIdCompIdMap: { [bitIdStr: string]: ComponentID } = {};
    flattenedBitIdCompIdMap[component.id._legacy.toString()] = component.id;
    await Promise.all(
      versionObj.flattenedDependencies.map(async (bitId) => {
        flattenedBitIdCompIdMap[bitId.toString()] = await this.resolveComponentId(bitId);
      })
    );
    const getCompIdByIdStr = (idStr: string): ComponentID => {
      const compId = flattenedBitIdCompIdMap[idStr];
      if (!compId)
        throw new Error(`id ${idStr} exists in flattenedEdges but not in flattened of ${component.id.toString()}`);
      return compId;
    };
    const nodes = Object.values(flattenedBitIdCompIdMap);
    const edges = flattenedEdges.map((edge) => ({
      ...edge,
      source: getCompIdByIdStr(edge.source.toString()),
      target: getCompIdByIdStr(edge.target.toString()),
    }));

    const graph = new Graph<ComponentID, DepEdgeType>();
    nodes.forEach((node) => graph.setNode(new Node(node.toString(), node)));
    edges.forEach((edge) => graph.setEdge(new Edge(edge.source.toString(), edge.target.toString(), edge.type)));
    return graph;
  }

  /**
   * given component ids, find their dependents in the workspace
   */
  async getDependentsIds(ids: ComponentID[]): Promise<ComponentID[]> {
    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(this.consumer, true);
    const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);
    const workspaceDependents = ids.map((id) => workspaceDependencyGraph.getDependentsInfo(id._legacy));
    const dependentsLegacyIds = workspaceDependents.flat().map((_) => _.id);
    const dependentsLegacyNoDup = BitIds.uniqFromArray(dependentsLegacyIds);
    const dependentsIds = await this.resolveMultipleComponentIds(dependentsLegacyNoDup);
    return dependentsIds;
  }

  public async createAspectList(extensionDataList: ExtensionDataList) {
    const entiresP = extensionDataList.map((entry) => this.extensionDataEntryToAspectEntry(entry));
    const entries: AspectEntry[] = await Promise.all(entiresP);
    return this.componentAspect.createAspectListFromEntries(entries);
  }

  private async extensionDataEntryToAspectEntry(dataEntry: ExtensionDataEntry): Promise<AspectEntry> {
    return new AspectEntry(await this.resolveComponentId(dataEntry.id), dataEntry);
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(
    componentId: ComponentID,
    legacyComponent?: ConsumerComponent,
    useCache = true,
    storeInCache = true,
    loadOpts?: ComponentLoadOptions
  ): Promise<Component> {
    this.logger.debug(`get ${componentId.toString()}`);
    const component = await this.componentLoader.get(componentId, legacyComponent, useCache, storeInCache, loadOpts);
    // When loading a component if it's an env make sure to load it as aspect as well
    // We only want to try load it as aspect if it's the first time we load the component
    const tryLoadAsAspect = this.componentLoadedSelfAsAspects.get(component.id.toString()) === undefined;
    // const config = this.harmony.get<ConfigMain>('teambit.harmony/config');

    // We are loading the component as aspect if it's an env, in order to be able to run the env-preview-template task which run only on envs.
    // Without this loading we will have a problem in case the env is the only component in the workspace. in that case we will load it as component
    // then we don't run it's provider so it doesn't register to the env slot, so we don't know it's an env.
    if (
      tryLoadAsAspect &&
      this.envs.isUsingEnvEnv(component) &&
      !this.aspectLoader.isCoreAspect(component.id.toStringWithoutVersion()) &&
      !this.aspectLoader.isAspectLoaded(component.id.toString()) &&
      (await this.hasId(component.id))
      // !config.extension(component.id.toStringWithoutVersion(), true)
    ) {
      try {
        this.componentLoadedSelfAsAspects.set(component.id.toString(), true);
        this.logger.debug(`trying to load self as aspect with id ${component.id.toString()}`);
        await this.loadAspects([component.id.toString()], undefined, component.id.toString());
        // In most cases if the load self as aspect failed we don't care about it.
        // we only need it in specific cases to work, but this workspace.get runs on different
        // cases where it might fail (like when importing aspect, after the import objects
        // when we write the package.json we run the applyTransformers which get to pkg which call
        // host.get, but the component not written yet to the fs, so it fails.)
      } catch (e) {
        this.logger.debug(`fail to load self as aspect with id ${component.id.toString()}`);
        this.componentLoadedSelfAsAspects.delete(component.id.toString());
        return component;
      }
    }
    this.componentLoadedSelfAsAspects.set(component.id.toString(), false);

    return component;
  }

  // TODO: @gilad we should refactor this asap into to the envs aspect.
  async getEnvSystemDescriptor(component: Component): Promise<AspectData> {
    const env = this.envs.calculateEnv(component);
    if (env.env.__getDescriptor && typeof env.env.__getDescriptor === 'function') {
      const systemDescriptor = await env.env.__getDescriptor();
      // !important persist services only on the env itself.
      let services: undefined | EnvServiceList;
      if (this.envs.isEnvRegistered(component.id.toString())) services = this.envs.getServices(env);
      const icon = this.aspectLoader.getDescriptor(env.id)?.icon || env.env.icon;

      return {
        type: systemDescriptor.type,
        // Make sure to store the env id in the data without the version
        // The version should always come from the aspect id configured on the component
        id: env.id.split('@')[0],
        name: env.name,
        icon,
        description: env.description,
        services: services?.toObject(),
      };
    }

    return {};
  }

  clearCache() {
    this.aspectLoader.resetFailedLoadAspects();
    this.logger.debug('clearing the workspace and scope caches');
    delete this._cachedListIds;
    this.componentLoader.clearCache();
    this.scope.clearCache();
    this.componentList = new ComponentsList(this.consumer);
  }

  clearComponentCache(id: ComponentID) {
    this.componentLoader.clearComponentCache(id);
    this.consumer.componentLoader.clearOneComponentCache(id._legacy);
    this.componentList = new ComponentsList(this.consumer);
  }

  async triggerOnComponentChange(
    id: ComponentID,
    files: string[],
    initiator?: CompilationInitiator
  ): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    // if a new file was added, upon component-load, its .bitmap entry is updated to include the
    // new file. write these changes to the .bitmap file so then other processes have access to
    // this new file. If the .bitmap wasn't change, it won't do anything.
    await this.bitMap.write();
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
      const onChangeResult = await onChangeFunc(component, files, initiator);
      results.push({ extensionId: extension, results: onChangeResult });
    });

    // TODO: find way to standardize event names.
    await this.graphql.pubsub.publish(ComponentChanged, { componentChanged: { component } });
    return results;
  }

  async triggerOnComponentAdd(id: ComponentID): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    const onAddEntries = this.onComponentAddSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    const files = component.state.filesystem.files.map((file) => file.path);
    await mapSeries(onAddEntries, async ([extension, onAddFunc]) => {
      const onAddResult = await onAddFunc(component, files);
      results.push({ extensionId: extension, results: onAddResult });
    });

    await this.graphql.pubsub.publish(ComponentAdded, { componentAdded: { component } });
    return results;
  }

  async triggerOnComponentRemove(id: ComponentID): Promise<OnComponentEventResult[]> {
    const onRemoveEntries = this.onComponentRemoveSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onRemoveEntries, async ([extension, onRemoveFunc]) => {
      const onRemoveResult = await onRemoveFunc(id);
      results.push({ extensionId: extension, results: onRemoveResult });
    });

    await this.graphql.pubsub.publish(ComponentRemoved, { componentRemoved: { componentIds: [id.toObject()] } });
    return results;
  }

  async triggerOnMultipleComponentsAdd(): Promise<void> {
    const onAddEntries = this.onMultipleComponentsAddSlot.toArray();
    await mapSeries(onAddEntries, async ([, onAddFunc]) => onAddFunc());
  }

  getState(id: ComponentID, hash: string) {
    return this.scope.getState(id, hash);
  }

  getSnap(id: ComponentID, hash: string) {
    return this.scope.getSnap(id, hash);
  }

  getCurrentLaneId(): LaneId {
    return this.consumer.getCurrentLaneId();
  }

  isOnMain(): boolean {
    return this.consumer.isOnMain();
  }

  /**
   * if checked out to a lane and the lane exists in the remote,
   * return the remote lane id (name+scope). otherwise, return null.
   */
  async getCurrentRemoteLane(): Promise<Lane | null> {
    const currentLaneId = this.getCurrentLaneId();
    if (currentLaneId.isDefault()) {
      return null;
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(this.consumer.scope);
    try {
      const lanes = await scopeComponentImporter.importLanes([currentLaneId]);

      return lanes[0];
    } catch (err) {
      if (
        err instanceof InvalidScopeName ||
        err instanceof ScopeNotFoundOrDenied ||
        err instanceof LaneNotFound ||
        err instanceof InvalidScopeNameFromRemote
      ) {
        const bitMapLaneId = this.bitMap.getExportedLaneId();
        if (bitMapLaneId?.isEqual(currentLaneId)) {
          throw err; // we know the lane is not new, so the error is legit
        }
        // the lane could be a local lane so no need to throw an error in such case
        loader.stop();
        this.logger.warn(`unable to get lane's data from a remote due to an error:\n${err.message}`);
        return null;
      }
      throw err;
    }
  }

  getDefaultExtensions(): ExtensionDataList {
    if (!this.config.extensions) {
      return new ExtensionDataList();
    }
    return ExtensionDataList.fromConfigObject(this.config.extensions);
  }

  async ejectMultipleConfigs(ids: ComponentID[], options: EjectConfOptions): Promise<EjectConfResult[]> {
    return Promise.all(ids.map((id) => this.ejectConfig(id, options)));
  }

  async ejectConfig(id: ComponentID, options: EjectConfOptions): Promise<EjectConfResult> {
    const componentId = await this.resolveComponentId(id);
    const extensions = await this.getExtensionsFromScopeAndSpecific(id);
    const aspects = await this.createAspectList(extensions);
    const componentDir = this.componentDir(id, { ignoreVersion: true });
    const componentConfigFile = new ComponentConfigFile(componentId, aspects, componentDir, options.propagate);
    await componentConfigFile.write({ override: options.override });
    // remove config from the .bitmap as it's not needed anymore. it is replaced by the component.json
    this.bitMap.removeEntireConfig(id);
    await this.bitMap.write();
    return {
      configPath: ComponentConfigFile.composePath(componentDir),
    };
  }

  async getExtensionsFromScopeAndSpecific(id: ComponentID): Promise<ExtensionDataList> {
    const componentFromScope = await this.scope.get(id);
    const { extensions } = await this.componentExtensions(id, componentFromScope, [
      'WorkspaceDefault',
      'WorkspaceVariants',
    ]);

    return extensions;
  }

  /**
   * see component-aspect, createAspectListFromLegacy() method for a context why this is needed.
   */
  private async resolveScopeAspectListIds(aspectListFromScope: AspectList): Promise<AspectList> {
    const resolvedList = await aspectListFromScope.pmap(async (entry) => {
      if (entry.id.scope !== this.scope.name) {
        return entry;
      }
      const newId = await this.resolveComponentId(entry.id.fullName);
      const newEntry = new AspectEntry(newId, entry.legacy);
      return newEntry;
    });
    return resolvedList;
  }

  /**
   * @deprecated use `this.idsByPattern` instead for consistency. also, it supports negation and list of patterns.
   *
   * load components into the workspace through a variants pattern.
   * @param pattern variants.
   * @param scope scope name.
   */
  async byPattern(pattern: string, scope = '**'): Promise<Component[]> {
    const ids = await this.listIds();
    const finalPattern = `${scope}/${pattern || '**'}`;
    const targetIds = ids.filter((id) => {
      const spec = isMatchNamespacePatternItem(id.toStringWithoutVersion(), finalPattern);
      return spec.match;
    });

    const components = await this.getMany(targetIds);
    return components;
  }

  /**
   * get component-ids matching the given pattern. a pattern can have multiple patterns separated by a comma.
   * it supports negate (!) character to exclude ids.
   */
  async idsByPattern(pattern: string, throwForNoMatch = true): Promise<ComponentID[]> {
    if (!pattern.includes('*') && !pattern.includes(',')) {
      // if it's not a pattern but just id, resolve it without multimatch to support specifying id without scope-name
      const id = await this.resolveComponentId(pattern);
      if (this.exists(id)) return [id];
      if (throwForNoMatch) throw new MissingBitMapComponent(pattern);
      return [];
    }
    const ids = await this.listIds();
    return this.scope.filterIdsFromPoolIdsByPattern(pattern, ids, throwForNoMatch);
  }

  /**
   * useful for workspace commands, such as `bit build`, `bit compile`.
   * by default, it should be running on new and modified components.
   * a user can specify `--all` to run on all components or specify a pattern to limit to specific components.
   * some commands such as build/test needs to run also on the dependents.
   */
  async getComponentsByUserInput(all?: boolean, pattern?: string, includeDependents = false): Promise<Component[]> {
    if (all) {
      return this.list();
    }
    if (pattern) {
      const ids = await this.idsByPattern(pattern);
      return this.getMany(ids);
    }
    const newAndModified = await this.newAndModified();
    if (includeDependents) {
      const newAndModifiedIds = newAndModified.map((comp) => comp.id);
      const dependentsIds = await this.getDependentsIds(newAndModifiedIds);
      const dependentsIdsFiltered = dependentsIds.filter((id) => !newAndModified.find((_) => _.id.isEqual(id)));
      const dependents = await this.getMany(dependentsIdsFiltered);
      newAndModified.push(...dependents);
    }
    return newAndModified;
  }

  async getComponentsUsingEnv(env: string, ignoreVersion = true, throwIfNotFound = false): Promise<Component[]> {
    const allComps = await this.list();
    const allEnvs = await this.envs.createEnvironment(allComps);
    const foundEnv = allEnvs.runtimeEnvs.find((runtimeEnv) => {
      if (runtimeEnv.id === env) return true;
      if (!ignoreVersion) return false;
      const envWithoutVersion = runtimeEnv.id.split('@')[0];
      return env === envWithoutVersion;
    });
    if (!foundEnv && throwIfNotFound) {
      const availableEnvs = allEnvs.runtimeEnvs.map((runtimeEnv) => runtimeEnv.id);
      throw new BitError(`unable to find components that using "${env}" env.
the following envs are used in this workspace: ${availableEnvs.join(', ')}`);
    }
    return foundEnv?.components || [];
  }

  async getMany(ids: Array<ComponentID>, loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    return this.componentLoader.getMany(ids, loadOpts);
  }

  getManyByLegacy(components: ConsumerComponent[], loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    return mapSeries(components, async (component) => {
      const id = await this.resolveComponentId(component.id);
      return this.get(id, component, true, true, loadOpts);
    });
  }

  /**
   * don't throw an error if the component was not found, simply return undefined.
   */
  async getIfExist(componentId: ComponentID): Promise<Component | undefined> {
    return this.componentLoader.getIfExist(componentId);
  }

  /**
   * whether a component exists in the workspace
   */
  exists(componentId: ComponentID): boolean {
    return Boolean(this.consumer.bitmapIdsFromCurrentLane.find((_) => _.isEqualWithoutVersion(componentId._legacy)));
  }

  /**
   * This will make sure to fetch the objects prior to load them
   * do not use it if you are not sure you need it.
   * It will influence the performance
   * currently it used only for get many of aspects
   * @param ids
   */
  async importAndGetMany(ids: Array<ComponentID>): Promise<Component[]> {
    await this.importCurrentLaneIfMissing();
    await this.scope.import(ids, { reFetchUnBuiltVersion: shouldReFetchUnBuiltVersion() });
    return this.componentLoader.getMany(ids);
  }

  async importCurrentLaneIfMissing() {
    const laneId = this.getCurrentLaneId();
    const laneObj = await this.scope.legacyScope.getCurrentLaneObject();
    if (laneId.isDefault() || laneObj) {
      return;
    }
    const lane = await this.getCurrentRemoteLane();
    if (!lane) {
      return;
    }
    this.logger.info(`current lane ${laneId.toString()} is missing, importing it`);
    await this.scope.legacyScope.objects.writeObjectsToTheFS([lane]);
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope.legacyScope);
    const ids = BitIds.fromArray(lane.toBitIds().filter((id) => id.hasScope()));
    await scopeComponentsImporter.importManyDeltaWithoutDeps({ ids, fromHead: true, lane });
    await scopeComponentsImporter.importMany({ ids, lanes: [lane] });
  }

  async use(aspectIdStr: string): Promise<string> {
    const aspectId = await this.resolveComponentId(aspectIdStr);
    let aspectIdToAdd = aspectId.toStringWithoutVersion();
    if (!(await this.hasId(aspectId))) {
      const loadedIds = await this.scope.loadAspects([aspectIdStr], true, 'bit use command');
      if (loadedIds[0]) aspectIdToAdd = loadedIds[0];
    }
    const config = this.harmony.get<ConfigMain>('teambit.harmony/config').workspaceConfig;
    if (!config) {
      throw new Error(`use() unable to get the workspace config`);
    }
    config.setExtension(
      aspectIdToAdd,
      {},
      {
        overrideExisting: false,
        ignoreVersion: false,
      }
    );
    await config.write();
    return aspectIdToAdd;
  }

  async write(component: Component, rootPath?: string) {
    await Promise.all(
      component.filesystem.files.map(async (file) => {
        const pathToWrite = rootPath ? path.join(this.path, rootPath, file.relative) : file.path;
        await fs.outputFile(pathToWrite, file.contents);
      })
    );
  }

  /**
   * Get the component root dir in the file system (relative to workspace or full) in Linux format
   * @param componentId
   * @param relative return the path relative to the workspace or full path
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    return this.componentDirFromLegacyId(componentId._legacy, bitMapOptions, options);
  }

  /**
   * component's files in the workspace are symlinked to the node_modules, and a package.json file is generated on that
   * package directory to simulate a valid node package.
   * @returns the package directory inside the node_module.
   * by default the absolute path, unless `options.relative` was set
   */
  componentPackageDir(component: Component, options = { relative: false }): string {
    const packageName = componentIdToPackageName(component.state._consumer);
    const packageDir = path.join('node_modules', packageName);
    return options.relative ? packageDir : this.consumer.toAbsolutePath(packageDir);
  }

  private componentDirFromLegacyId(
    bitId: BitId,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    const componentMap = this.consumer.bitMap.getComponent(bitId, bitMapOptions);
    const relativeComponentDir = componentMap.getComponentDir();
    if (!relativeComponentDir) {
      throw new NoComponentDir(bitId.toString());
    }
    if (options.relative) {
      return relativeComponentDir;
    }

    return path.join(this.path, relativeComponentDir);
  }

  componentDirToAbsolute(relativeComponentDir: PathOsBasedRelative): PathOsBasedAbsolute {
    return path.join(this.path, relativeComponentDir);
  }

  async componentDefaultScope(componentId: ComponentID): Promise<string | undefined> {
    const relativeComponentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    return this.componentDefaultScopeFromComponentDirAndName(relativeComponentDir, componentId.fullName);
  }

  async componentDefaultScopeFromComponentDirAndName(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<string | undefined> {
    const componentConfigFile = await this.componentConfigFileFromComponentDirAndName(relativeComponentDir, name);
    if (componentConfigFile && componentConfigFile.defaultScope) {
      return componentConfigFile.defaultScope;
    }
    const bitMapId = this.consumer.bitMap.getExistingBitId(name);
    const bitMapEntry = bitMapId ? this.consumer.bitMap.getComponent(bitMapId) : undefined;
    if (bitMapEntry && bitMapEntry.defaultScope) {
      return bitMapEntry.defaultScope;
    }
    return this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(relativeComponentDir, name);
  }

  get defaultScope() {
    return this.config.defaultScope;
  }

  private async componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<string | undefined> {
    const variantConfig = this.variants.byRootDirAndName(relativeComponentDir, name);
    if (variantConfig && variantConfig.defaultScope) {
      return variantConfig.defaultScope;
    }
    const isVendor = this.isVendorComponentByComponentDir(relativeComponentDir);
    if (!isVendor) {
      return this.config.defaultScope;
    }
    return undefined;
  }

  /**
   * Calculate the component config based on:
   * the config property in the .bitmap file
   * the component.json file in the component folder
   * matching pattern in the variants config
   * defaults extensions from workspace config
   * extensions from the model.
   */
  async componentExtensions(
    componentId: ComponentID,
    componentFromScope?: Component,
    excludeOrigins: ExtensionsOrigin[] = []
  ): Promise<{
    extensions: ExtensionDataList;
    beforeMerge: Array<{ extensions: ExtensionDataList; origin: ExtensionsOrigin; extraData: any }>; // useful for debugging
    errors?: Error[];
  }> {
    return this.aspectsMerger.merge(componentId, componentFromScope, excludeOrigins);
  }

  getConfigMergeFilePath(): string {
    return path.join(this.path, MergeConfigFilename);
  }

  getConflictMergeFile(): MergeConflictFile {
    return this.aspectsMerger.mergeConflictFile;
  }

  async listComponentsDuringMerge(): Promise<ComponentID[]> {
    const unmergedComps = this.scope.legacyScope.objects.unmergedComponents.getComponents();
    const bitIds = unmergedComps.map((u) => new BitId(u.id));
    return this.resolveMultipleComponentIds(bitIds);
  }

  async getUnmergedComponent(componentId: ComponentID): Promise<Component | undefined> {
    const unmerged = this.scope.legacyScope.objects.unmergedComponents.getEntry(componentId._legacy.name);
    if (unmerged?.head) {
      return this.scope.get(componentId.changeVersion(unmerged?.head.toString()));
    }
    return undefined;
  }

  async isModified(component: Component): Promise<boolean> {
    const head = component.head;
    if (!head) {
      return true; // it's a new component
    }
    const consumerComp = component.state._consumer as ConsumerComponent;
    if (typeof consumerComp._isModified === 'boolean') return consumerComp._isModified;
    const componentStatus = await this.consumer.getComponentStatusById(component.id._legacy);
    return componentStatus.modified === true;
  }

  async triggerOnPreWatch(componentIds: ComponentID[], watchOpts: WatchOptions) {
    const components = await this.getMany(componentIds);
    const preWatchFunctions = this.onPreWatchSlot.values();
    await mapSeries(preWatchFunctions, async (func) => {
      await func(components, watchOpts);
    });
  }

  /**
   * filter the given component-ids and set default-scope only to the new ones.
   * returns the affected components.
   */
  async setDefaultScopeToComponents(componentIds: ComponentID[], scopeName: string): Promise<ComponentID[]> {
    if (!isValidScopeName(scopeName)) {
      throw new InvalidScopeName(scopeName);
    }
    const newComponentIds = componentIds.filter((id) => !id.hasVersion());
    if (!newComponentIds.length) {
      const compIdsStr = componentIds.map((compId) => compId.toString()).join(', ');
      throw new BitError(
        `unable to set default-scope for the following components, as they are not new:\n${compIdsStr}`
      );
    }
    newComponentIds.map((comp) => this.bitMap.setDefaultScope(comp, scopeName));
    await this.bitMap.write();
    return newComponentIds;
  }

  async setDefaultScope(scopeName: string) {
    if (this.defaultScope === scopeName) {
      throw new Error(`the default-scope is already set as "${scopeName}", nothing to change`);
    }
    const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
    config.workspaceConfig?.setExtension(
      WorkspaceAspect.id,
      { defaultScope: scopeName },
      { mergeIntoExisting: true, ignoreVersion: true }
    );
    await config.workspaceConfig?.write({ dir: path.dirname(config.workspaceConfig.path) });
  }

  async addSpecificComponentConfig(
    id: ComponentID,
    aspectId: string,
    config: Record<string, any> = {},
    shouldMergeWithExisting = false,
    /**
     * relevant only when writing to .bitmap.
     * eject config of the given aspect-id, so then it won't override previous config. (see "adding prod dep, tagging then adding devDep" e2e-test)
     */
    shouldMergeWithPrevious = false
  ) {
    const componentConfigFile = await this.componentConfigFile(id);
    if (componentConfigFile) {
      await componentConfigFile.addAspect(
        aspectId,
        config,
        this.resolveComponentId.bind(this),
        shouldMergeWithExisting
      );
      await componentConfigFile.write({ override: true });
    } else {
      if (shouldMergeWithPrevious) {
        const extensions = await this.getExtensionsFromScopeAndSpecific(id);
        const obj = extensions.toConfigObject();
        config = obj[aspectId] ? merge(obj[aspectId], config) : config;
      }
      this.bitMap.addComponentConfig(id, aspectId, config, shouldMergeWithExisting);
    }
  }

  async removeSpecificComponentConfig(id: ComponentID, aspectId: string, markWithMinusIfNotExist: boolean) {
    const componentConfigFile = await this.componentConfigFile(id);
    if (componentConfigFile) {
      await componentConfigFile.removeAspect(aspectId, markWithMinusIfNotExist, this.resolveComponentId.bind(this));
      await componentConfigFile.write({ override: true });
    } else {
      this.bitMap.removeComponentConfig(id, aspectId, markWithMinusIfNotExist);
    }
  }

  async getAspectIdFromConfig(
    componentId: ComponentID,
    aspectIdStr: string,
    ignoreAspectVersion = false
  ): Promise<string | undefined> {
    const config = await this.getExtensionsFromScopeAndSpecific(componentId);
    const aspectEntry = config.findExtension(aspectIdStr, ignoreAspectVersion);
    return aspectEntry?.id.toString();
  }

  async getSpecificComponentConfig(id: ComponentID, aspectId: string): Promise<any> {
    const componentConfigFile = await this.componentConfigFile(id);
    if (componentConfigFile) {
      return componentConfigFile.aspects.get(aspectId)?.config;
    }
    return this.bitMap.getBitmapEntry(id, { ignoreVersion: true }).config?.[aspectId];
  }

  private isVendorComponentByComponentDir(relativeComponentDir: PathOsBasedRelative): boolean {
    const vendorDir = this.config.vendor?.directory || DEFAULT_VENDOR_DIR;
    if (pathIsInside(relativeComponentDir, vendorDir)) {
      return true;
    }
    // TODO: implement
    return false;
  }

  /**
   * return the component config from its folder (component.json)
   * @param componentId
   */
  public async componentConfigFile(id: ComponentID): Promise<ComponentConfigFile | undefined> {
    const relativeComponentDir = this.componentDir(id, { ignoreVersion: true }, { relative: true });
    return this.componentConfigFileFromComponentDirAndName(relativeComponentDir, id.fullName);
  }

  /**
   * @param componentPath can be relative or absolute. supports Linux and Windows
   */
  async getComponentIdByPath(componentPath: PathOsBased): Promise<ComponentID | undefined> {
    const relativePath = path.isAbsolute(componentPath) ? path.relative(this.path, componentPath) : componentPath;
    const linuxPath = pathNormalizeToLinux(relativePath);
    const bitId = this.consumer.bitMap.getComponentIdByPath(linuxPath);
    if (bitId) {
      return this.resolveComponentId(bitId);
    }
    return undefined;
  }

  private async componentConfigFileFromComponentDirAndName(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<ComponentConfigFile | undefined> {
    let componentConfigFile;
    if (relativeComponentDir) {
      const absComponentDir = this.componentDirToAbsolute(relativeComponentDir);
      const defaultScopeFromVariantsOrWs = await this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(
        relativeComponentDir,
        name
      );
      componentConfigFile = await ComponentConfigFile.load(
        absComponentDir,
        this.createAspectList.bind(this),
        defaultScopeFromVariantsOrWs
      );
    }

    return componentConfigFile;
  }

  async getAspectsGraphWithoutCore(components: Component[], isAspect?: ShouldLoadFunc) {
    const ids = components.map((component) => component.id);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    // const coreAspectsComponentIds = coreAspectsStringIds.map((id) => BitId.parse(id, true));
    // const aspectsIds = components.reduce((acc, curr) => {
    //   const currIds = curr.state.aspects.ids;
    //   acc = acc.concat(currIds);
    //   return acc;
    // }, [] as any);
    // const otherDependenciesMap = components.reduce((acc, curr) => {
    //   // const currIds = curr.state.dependencies.dependencies.map(dep => dep.id.toString());
    //   const currMap = curr.state.dependencies.getIdsMap();
    //   Object.assign(acc, currMap);
    //   return acc;
    // }, {});

    // const depsWhichAreNotAspects = difference(Object.keys(otherDependenciesMap), aspectsIds);
    // const depsWhichAreNotAspectsBitIds = depsWhichAreNotAspects.map((strId) => otherDependenciesMap[strId]);
    // We only want to load into the graph components which are aspects and not regular dependencies
    // This come to solve a circular loop when an env aspect use an aspect (as regular dep) and the aspect use the env aspect as its env
    // TODO: @gilad it causes many issues we need to find a better solution. removed for now.
    return this.buildOneGraphForComponents(ids, coreAspectsStringIds, isAspect);
  }

  /**
   * load aspects from the workspace and if not exists in the workspace, load from the scope.
   * keep in mind that the graph may have circles.
   */
  async loadAspects(ids: string[] = [], throwOnError = false, neededFor?: string): Promise<string[]> {
    // generate a random callId to be able to identify the call from the logs
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}`);
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return [];
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds);
    const componentIds = await this.resolveMultipleComponentIds(idsWithoutCore);
    const components = await this.importAndGetAspects(componentIds);

    const isAspect = async (id: ComponentID) => {
      const component = await this.get(id);
      const isUsingAspectEnv = this.envs.isUsingAspectEnv(component);
      const isUsingEnvEnv = this.envs.isUsingEnvEnv(component);
      const isValidAspect = isUsingAspectEnv || isUsingEnvEnv;
      // if (!isValidAspect && idsWithoutCore.includes(component.id.toString())) {
      //   const data = this.envs.getEnvData(component);
      //   const err = new IncorrectEnvAspect(component.id.toString(), data.type, data.id);
      //   if (data.id === DEFAULT_ENV) {
      //     // when cloning a project, or when the node-modules dir is deleted, nothing works and all
      //     // components are default to the DEFAULT_ENV, which is node-env. we must allow "bit
      //     // install" to prepare the workspace and let the proper the envs to be loaded
      //     this.logger.error(err.message);
      //   } else {
      //     throw err;
      //   }
      // }
      return isValidAspect;
    };

    const graph = await this.getAspectsGraphWithoutCore(components, isAspect);
    const aspects = graph.nodes.map((node) => node.attr);
    this.logger.debug(`${loggerPrefix} found ${aspects.length} aspects in the aspects-graph`);
    const { workspaceComps, scopeComps } = await this.groupComponentsByWorkspaceAndScope(aspects);
    this.logger.debug(
      `${loggerPrefix} found ${workspaceComps.length} components in the workspace:\n${workspaceComps
        .map((c) => c.id.toString())
        .join('\n')}`
    );
    this.logger.debug(
      `${loggerPrefix} ${
        scopeComps.length
      } components are not in the workspace and are loaded from the scope:\n${scopeComps
        .map((c) => c.id.toString())
        .join('\n')}`
    );
    const scopeIds = scopeComps.map((aspect) => aspect.id.toString());
    const workspaceAspects = await this.requireComponents(workspaceComps);
    const workspaceManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      workspaceAspects,
      throwOnError
    );
    const potentialPluginsIndexes = compact(
      workspaceManifests.map((manifest, index) => {
        if (this.aspectLoader.isValidAspect(manifest)) return undefined;
        return index;
      })
    );
    const workspaceManifestsIds = compact(workspaceManifests.map((m) => m.id));
    // We are grouping the scope aspects by whether they are envs of something of the list or not
    // if yes, we want to load them first
    // the rest we will load together with the workspace aspects
    const scopeIdsGrouped = await this.scope.groupAspectIdsByEnvOfTheList(scopeIds);
    const scopeEnvsManifestsIds =
      scopeIdsGrouped.envs && scopeIdsGrouped.envs.length
        ? await this.scope.loadAspects(
            scopeIdsGrouped.envs,
            throwOnError,
            'workspace.loadAspects loading scope aspects'
          )
        : [];
    const currentLane = await this.consumer.getCurrentLaneObject();
    const { manifests: scopeOtherManifests } =
      scopeIdsGrouped.other && scopeIdsGrouped.other.length
        ? await this.scope.getManifestsGraphRecursively(
            scopeIdsGrouped.other,
            compact(workspaceManifestsIds),
            throwOnError,
            currentLane || undefined,
            {
              packageManagerConfigRootDir: this.path,
            }
          )
        : { manifests: [] };
    const scopeOtherManifestsIds = compact(scopeOtherManifests.map((m) => m.id));

    await this.aspectLoader.loadExtensionsByManifests(
      [...scopeOtherManifests, ...workspaceManifests],
      throwOnError,
      idsWithoutCore
    );
    // Try require components for potential plugins
    const pluginsWorkspaceComps = potentialPluginsIndexes.map((index) => {
      return workspaceComps[index];
    });
    // Do the require again now that the plugins defs already registered
    const pluginsWorkspaceAspects = await this.requireComponents(pluginsWorkspaceComps);
    const pluginsWorkspaceManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      pluginsWorkspaceAspects,
      throwOnError
    );
    await this.aspectLoader.loadExtensionsByManifests(pluginsWorkspaceManifests, throwOnError);
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    return compact(scopeEnvsManifestsIds.concat(scopeOtherManifestsIds).concat(workspaceManifestsIds));
  }

  /**
   * returns one graph that includes all dependencies types. each edge has a label of the dependency
   * type. the nodes content is the Component object.
   */
  async buildOneGraphForComponents(
    ids: ComponentID[],
    ignoreIds?: string[],
    shouldLoadFunc?: ShouldLoadFunc,
    shouldThrowOnMissingDep = true
  ): Promise<Graph<Component, string>> {
    const graphFromFsBuilder = new GraphFromFsBuilder(
      this,
      this.logger,
      this.dependencyResolver,
      ignoreIds,
      shouldLoadFunc,
      shouldThrowOnMissingDep
    );
    return graphFromFsBuilder.buildGraph(ids);
  }

  async resolveAspects(
    runtimeName?: string,
    componentIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    this.logger.debug(`workspace resolveAspects, runtimeName: ${runtimeName}, componentIds: ${componentIds}`);
    const defaultOpts: ResolveAspectsOptions = {
      excludeCore: false,
      requestedOnly: false,
      filterByRuntime: true,
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    let missingPaths = false;
    const bitIds: BitId[] = [];
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(idsToResolve, coreAspectsIds);
    const componentIdsToResolve = await this.resolveMultipleComponentIds(userAspectsIds);
    const { workspaceIds, scopeIds } = await this.groupIdsByWorkspaceAndScope(componentIdsToResolve);
    const wsComponents = await this.getMany(workspaceIds);
    const aspectDefs = await this.aspectLoader.resolveAspects(wsComponents, async (component) => {
      const compStringId = component.id._legacy.toString();
      bitIds.push(component.id._legacy);
      const localPath = this.getComponentPackagePath(component);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }
      const runtimePath = runtimeName
        ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName)
        : null;

      const aspectFilePath = await this.aspectLoader.getAspectFilePath(component, localPath);

      this.logger.debug(
        `workspace resolveAspects, resolving id: ${compStringId}, localPath: ${localPath}, runtimePath: ${runtimePath}`
      );
      return {
        aspectPath: localPath,
        aspectFilePath,
        runtimePath,
      };
    });

    let scopeAspectDefs: AspectDefinition[] = [];
    if (scopeIds.length) {
      scopeAspectDefs = await this.scope.resolveAspects(runtimeName, scopeIds, mergedOpts);
    }

    let coreAspectDefs = await Promise.all(
      coreAspectsIds.map(async (coreId) => {
        const rawDef = await getAspectDef(coreId, runtimeName);
        return this.aspectLoader.loadDefinition(rawDef);
      })
    );

    // due to lack of workspace and scope runtimes. TODO: fix after adding them.
    if (runtimeName && mergedOpts.filterByRuntime) {
      coreAspectDefs = coreAspectDefs.filter((coreAspect) => {
        return coreAspect.runtimePath;
      });
    }

    if (missingPaths) {
      await linkToNodeModulesByIds(this, bitIds);
    }

    const allDefs = aspectDefs.concat(coreAspectDefs).concat(scopeAspectDefs);
    const ids = idsToResolve.map((idStr) => ComponentID.fromString(idStr).toStringWithoutVersion());
    const afterExclusion = mergedOpts.excludeCore
      ? allDefs.filter((def) => {
          const isCore = coreAspectDefs.find((coreId) => def.getId === coreId.getId);
          const id = ComponentID.fromString(def.getId || '');
          const isTarget = ids.includes(id.toStringWithoutVersion());
          if (isTarget) return true;
          return !isCore;
        })
      : allDefs;

    const uniqDefs = uniqBy(afterExclusion, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName && mergedOpts.filterByRuntime) {
      defs = defs.filter((def) => def.runtimePath);
    }

    if (componentIds && componentIds.length && mergedOpts.requestedOnly) {
      const componentIdsString = componentIds.map((id) => id.toString());
      defs = defs.filter((def) => {
        return (
          (def.id && componentIdsString.includes(def.id)) ||
          (def.component && componentIdsString.includes(def.component?.id.toString()))
        );
      });
    }

    return defs;
  }

  private async groupIdsByWorkspaceAndScope(
    ids: ComponentID[]
  ): Promise<{ workspaceIds: ComponentID[]; scopeIds: ComponentID[] }> {
    const workspaceIds: ComponentID[] = [];
    const scopeIds: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const existOnWorkspace = await this.hasId(id);
        existOnWorkspace ? workspaceIds.push(id) : scopeIds.push(id);
      })
    );
    return { workspaceIds, scopeIds };
  }

  private async groupComponentsByWorkspaceAndScope(
    components: Component[]
  ): Promise<{ workspaceComps: Component[]; scopeComps: Component[] }> {
    const workspaceComps: Component[] = [];
    const scopeComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existOnWorkspace = await this.hasId(component.id);
        existOnWorkspace ? workspaceComps.push(component) : scopeComps.push(component);
      })
    );
    return { workspaceComps, scopeComps };
  }

  /**
   * Provides a cache folder, unique per key.
   * Return value may be undefined, if workspace folder is unconventional (bare-scope, no node_modules, etc)
   */
  getTempDir(
    /*
     * unique key, i.e. aspect or component id
     */
    id: string
  ) {
    const PREFIX = 'bit';
    const cacheDir = path.join(this.modulesPath, '.cache', PREFIX, id);

    // maybe should also check it's a folder and has write permissions
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    return cacheDir;
  }

  async requireComponents(components: Component[]): Promise<RequireableComponent[]> {
    let missingPaths = false;
    const bitIds: BitId[] = [];
    const resolveP = components.map(async (component) => {
      bitIds.push(component.id._legacy);
      const localPath = this.getComponentPackagePath(component);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }

      const requireFunc = async () => {
        const plugins = this.aspectLoader.getPlugins(component, localPath);
        if (plugins.has()) {
          return plugins.load(MainRuntime.name);
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const aspect = require(localPath);
        // require aspect runtimes
        const runtimePath = await this.aspectLoader.getRuntimePath(component, localPath, MainRuntime.name);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        if (runtimePath) require(runtimePath);
        return aspect;
      };
      return new RequireableComponent(component, requireFunc);
    });
    const resolved = await Promise.all(resolveP);
    // Make sure to link missing components
    if (missingPaths) {
      await linkToNodeModulesByIds(this, bitIds);
    }
    return resolved;
  }

  /**
   * same as `this.importAndGetMany()` with a specific error handling of ComponentNotFound
   */
  private async importAndGetAspects(componentIds: ComponentID[]): Promise<Component[]> {
    try {
      return await this.importAndGetMany(componentIds);
    } catch (err: any) {
      if (err instanceof ComponentNotFound) {
        const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
        const configStr = JSON.stringify(config.workspaceConfig?.raw || {});
        if (configStr.includes(err.id)) {
          throw new BitError(`error: a component "${err.id}" was not found
your workspace.jsonc has this component-id set. you might want to remove/change it.`);
        }
      }

      throw err;
    }
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
    this.clearCache();
  }

  getComponentPackagePath(component: Component) {
    const relativePath = this.dependencyResolver.getRuntimeModulePath(component);
    return path.join(this.path, relativePath);
  }

  // TODO: should we return here the dir as it defined (aka components) or with /{name} prefix (as it used in legacy)
  get defaultDirectory(): string {
    return this.config.defaultDirectory;
  }

  get legacyDefaultDirectory(): string {
    if (this.defaultDirectory && !this.defaultDirectory.includes('{name}')) {
      return `${this.defaultDirectory}/{name}`;
    }
    return this.defaultDirectory;
  }

  /**
   * Transform the id to ComponentId and get the exact id as appear in bitmap
   *
   * @param {(string | ComponentID | BitId)} id
   * @returns {Promise<ComponentID>}
   * @memberof Workspace
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    const getDefaultScope = async (bitId: BitId, bitMapOptions?: GetBitMapComponentOptions) => {
      if (bitId.scope) {
        return bitId.scope;
      }
      const relativeComponentDir = this.componentDirFromLegacyId(bitId, bitMapOptions, { relative: true });
      const defaultScope = await this.componentDefaultScopeFromComponentDirAndName(
        relativeComponentDir,
        bitId.toStringWithoutScopeAndVersion()
      );
      return defaultScope;
    };

    // This is required in case where you have in your workspace a component with the same name as a core aspect
    // let's say you have component called react-native (which is eventually my-org.my-scope/react-native)
    // and you set teambit.react/react-native as your env
    // bit will get here with the string teambit.react/react-native and will try to resolve it from the workspace
    // during this it will find the my-org.my-scope/react-native which is incorrect as the core one doesn't exist in the
    // workspace
    if (this.aspectLoader.isCoreAspect(id.toString())) {
      return ComponentID.fromString(id.toString());
    }
    let legacyId = this.consumer.getParsedIdIfExist(id.toString(), true, true);
    if (legacyId) {
      const defaultScope = await getDefaultScope(legacyId);
      // only reason to strip the scopeName from the given id is when this id has the defaultScope, because .bitmap
      // doesn't have the defaultScope. if the given id doesn't have scope or has scope different than the default,
      // then don't ignore it. search with the scope-name.
      const shouldSearchWithoutScopeInProvidedId = id.toString().startsWith(`${defaultScope}/`);
      legacyId = this.consumer.getParsedIdIfExist(id.toString(), true, shouldSearchWithoutScopeInProvidedId);
      if (legacyId) {
        return ComponentID.fromLegacy(legacyId, defaultScope);
      }
    }
    try {
      const idWithVersion = id.toString();
      const [idWithoutVersion, version] = id.toString().split('@');
      const _bitMapId = this.consumer.getParsedIdIfExist(idWithoutVersion, false, true);
      // This logic is very specific, and very sensitive for changes please do not touch this without consulting with @ran or @gilad
      // example (partial list) cases which should be handled are:
      // use case 1 - ws component provided with the local scope name:
      // source id        : my-scope1/my-name1
      // bitmap res (_id) : my-name1 (comp is tagged but not exported)
      // local scope name : my-scope1
      // scope content    : my-name1
      // expected result  : my-name1
      // use case 2 - component with same name exist in ws and scope (but with different scope name)
      // source id        : my-scope2/my-name1
      // bitmap res (_id) : my-name1 (comp exist in ws but it's actually different component)
      // local scope name : my-scope1
      // scope content    : my-scope2/my-name1
      // expected result  : my-scope2/my-name1
      // use case 3 - component with same name exist in ws and scope (but with different scope name) - source provided without scope name
      // source id        : my-name1
      // bitmap res (_id) : my-name1 (comp exist in ws but it's actually different component)
      // local scope name : my-scope1
      // scope content    : my-scope1/my-name1 and my-scope2/my-name1
      // expected result  : my-name1 (get the name from the bitmap)
      // use case 4 - component with the same name and different scope are imported into the ws
      // source id        : my-name1
      // bitmap res (_id) : my-scope2/my-name1 (comp exist in ws from different scope (imported))
      // local scope name : my-scope1
      // scope content    : my-scope2/my-name1
      // expected result  : my-scope2/my-name1 (get the name from the bitmap)

      // No entry in bitmap at all, search for the original input id
      if (!_bitMapId) {
        return await this.scope.resolveComponentId(id.toString());
      }
      const _bitMapIdWithoutVersion = _bitMapId.toStringWithoutVersion();
      const _bitMapIdWithVersion = _bitMapId.changeVersion(version).toString();
      // The id in the bitmap has prefix which is not in the source id - the bitmap entry has scope name
      // Handle use case 4
      if (_bitMapIdWithoutVersion.endsWith(idWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
        return await this.scope.resolveComponentId(_bitMapIdWithVersion);
      }
      // Handle case when I tagged the component locally with a default scope which is not the local scope
      // but not exported it yet
      // now i'm trying to load it with source id contain the default scope prefix
      // we want to get it from the local first before assuming it's something coming from outside
      if (!_bitMapId.scope) {
        const defaultScopeForBitmapId = await getDefaultScope(_bitMapId, { ignoreVersion: true });
        const getFromBitmapAddDefaultScope = () => {
          let _bitmapIdWithVersionForSource = _bitMapId;
          if (version) {
            _bitmapIdWithVersionForSource = _bitMapId.changeVersion(version);
          }
          return ComponentID.fromLegacy(_bitmapIdWithVersionForSource, defaultScopeForBitmapId);
        };
        // a case when the given id contains the default scope
        if (idWithVersion.startsWith(`${defaultScopeForBitmapId}/${_bitMapIdWithoutVersion}`)) {
          return getFromBitmapAddDefaultScope();
        }
        // a case when the given id does not contain the default scope
        const fromScope = await this.scope.resolveComponentId(idWithVersion);
        if (!fromScope._legacy.hasScope()) {
          return getFromBitmapAddDefaultScope();
        }
      }

      if (idWithoutVersion.endsWith(_bitMapIdWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
        // The id in the bitmap doesn't have scope, the source id has scope
        // Handle use case 2 and use case 1
        if (id.toString().startsWith(this.scope.name)) {
          // Handle use case 1 - the provided id has scope name same as the local scope name
          // we want to send it as it appear in the bitmap
          return await this.scope.resolveComponentId(_bitMapIdWithVersion);
        }
        // Handle use case 2 - the provided id has scope which is not the local scope
        // we want to search by the source id
        return await this.scope.resolveComponentId(idWithVersion);
      }
      // Handle use case 3
      return await this.scope.resolveComponentId(idWithVersion);
    } catch (error: any) {
      legacyId = BitId.parse(id.toString(), true);
      return ComponentID.fromLegacy(legacyId);
    }
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>): Promise<ComponentID[]> {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  /**
   * This will mutate the original extensions list and resolve it's ids
   *
   * @param {ExtensionDataList} extensions
   * @returns {Promise<void[]>}
   * @memberof Workspace
   */
  resolveExtensionsList(extensions: ExtensionDataList): Promise<void[]> {
    const resolveMergedExtensionsP = extensions.map(async (extensionEntry) => {
      if (extensionEntry.extensionId) {
        // const hasVersion = extensionEntry.extensionId.hasVersion();
        // const useBitmapVersion = !hasVersion;
        // const resolvedId = await this.resolveComponentId(extensionEntry.extensionId, true, useBitmapVersion);

        // Assuming extensionId always has scope - do not allow extension id without scope
        const resolvedId = await this.resolveComponentId(extensionEntry.extensionId);
        extensionEntry.extensionId = resolvedId._legacy;
      }
    });
    return Promise.all(resolveMergedExtensionsP);
  }

  /**
   * This will mutate the original extensions list and make sure all extensions has the ids with the scope / default scope
   *
   * @param {ExtensionDataList} extensions
   * @returns {Promise<void[]>}
   * @memberof Workspace
   */
  addDefaultScopeToExtensionsList(extensions: ExtensionDataList): Promise<void[]> {
    const resolveMergedExtensionsP = extensions.map(async (extensionEntry) => {
      if (extensionEntry.extensionId && !extensionEntry.extensionId.hasScope()) {
        const componentId = ComponentID.fromLegacy(extensionEntry.extensionId);
        const defaultScope = await this.componentDefaultScope(componentId);
        extensionEntry.extensionId = extensionEntry.extensionId.changeScope(defaultScope);
      }
    });
    return Promise.all(resolveMergedExtensionsP);
  }

  /**
   * configure an environment to the given components in the .bitmap file, this configuration overrides other, such as
   * overrides in workspace.jsonc.
   */
  async setEnvToComponents(envId: ComponentID, componentIds: ComponentID[]) {
    const envStrWithPossiblyVersion = await this.resolveEnvIdWithPotentialVersionForConfig(envId);
    const envIdStrNoVersion = envId.toStringWithoutVersion();
    await this.unsetEnvFromComponents(componentIds);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.addSpecificComponentConfig(componentId, envStrWithPossiblyVersion);
        await this.addSpecificComponentConfig(componentId, EnvsAspect.id, { env: envIdStrNoVersion });
      })
    );
    await this.bitMap.write();
  }

  /**
   * helpful when a user provides an env-string to be set and this env has no version.
   * in the workspace config, a custom-env needs to be set with a version unless it's part of the workspace.
   * (inside envs/envs it's set without a version).
   */
  async resolveEnvIdWithPotentialVersionForConfig(envId: ComponentID): Promise<string> {
    const isCore = this.aspectLoader.isCoreAspect(envId.toStringWithoutVersion());
    const existsOnWorkspace = await this.hasId(envId);
    if (isCore || existsOnWorkspace) {
      // the env needs to be without version
      return envId.toStringWithoutVersion();
    }
    // the env must include a version
    if (envId.hasVersion()) {
      return envId.toString();
    }
    const extensions = this.harmony.get<ConfigMain>('teambit.harmony/config').extensions;
    const found = extensions?.findExtension(envId.toString(), true);
    if (found && found.extensionId?.version) {
      return found.extensionId.toString();
    }
    const comps = await this.importAndGetMany([envId]);
    return comps[0].id.toString();
  }

  /**
   * remove env configuration from the .bitmap file, so then other configuration, such as "variants" will take place
   */
  async unsetEnvFromComponents(ids: ComponentID[]): Promise<{ changed: ComponentID[]; unchanged: ComponentID[] }> {
    const changed: ComponentID[] = [];
    const unchanged: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const extensions = await this.getExtensionsFromScopeAndSpecific(id);
        const envsAspect = extensions.findCoreExtension(EnvsAspect.id)?.rawConfig;
        const currentEnv = envsAspect && envsAspect !== REMOVE_EXTENSION_SPECIAL_SIGN ? envsAspect.env : null;
        if (!currentEnv) {
          unchanged.push(id);
          return;
        }
        const currentEnvWithPotentialVersion = await this.getAspectIdFromConfig(id, currentEnv, true);
        await this.removeSpecificComponentConfig(id, currentEnvWithPotentialVersion || currentEnv, true);
        await this.removeSpecificComponentConfig(id, EnvsAspect.id, true);
        changed.push(id);
      })
    );
    await this.bitMap.write();
    return { changed, unchanged };
  }

  async updateEnvForComponents(envIdStr?: string, pattern?: string) {
    const allWsComps = await this.list();
    const allWsIds = await this.listIds();
    const isInWs = (envId: ComponentID) => allWsIds.find((id) => id.isEqual(envId, { ignoreVersion: true }));
    const allEnvs = await this.envs.createEnvironment(allWsComps);
    const getEnvWithVersion = async (envId: ComponentID) => {
      if (envId.hasVersion()) return envId;
      try {
        const fromRemote = await this.scope.getRemoteComponent(envId);
        return envId.changeVersion(fromRemote.id.version);
      } catch (err) {
        throw new BitError(`unable to find ${envIdStr} in the remote`);
      }
    };
    const getEnvs = async (): Promise<ComponentID[]> => {
      if (envIdStr) {
        const envCompId = await this.resolveComponentId(envIdStr);
        if (isInWs(envCompId)) {
          throw new BitError(
            `error: unable to update the env ${envCompId.toString()}, it's already part of the workspace, as such, it's always using the workspace version`
          );
        }
        const envWithVer = await getEnvWithVersion(envCompId);
        return [envWithVer];
      }
      // get all non-local envs.
      const allEnvsIds = allEnvs.runtimeEnvs.map((env) => env.id);
      const allEnvsCompIds = await this.resolveMultipleComponentIds(allEnvsIds);
      // also check the envId has version, otherwise, it's a core env.
      const nonLocalEnvs = allEnvsCompIds.filter((envId) => !isInWs(envId) && envId.hasVersion());
      if (!nonLocalEnvs.length) {
        throw new BitError(
          `error: unable to update envs ${allEnvsIds
            .map((e) => e.toString())
            .join(', ')}, they're already part of the workspace`
        );
      }
      const envsWithVersions = await mapSeries(nonLocalEnvs, (envId) =>
        getEnvWithVersion(envId.changeVersion(undefined))
      );
      return envsWithVersions;
    };
    const envsWithVerToUpdate = await getEnvs();

    const compIdsToUpdate = pattern ? await this.idsByPattern(pattern) : allWsIds;
    const compsToUpdate = await this.getMany(compIdsToUpdate);
    const alreadyUpToDate: ComponentID[] = [];
    const updated: { [envId: string]: ComponentID[] } = {};
    await Promise.all(
      compsToUpdate.map(async (comp) => {
        const compEnvs = compact(
          envsWithVerToUpdate.map((envId) => comp.state.aspects.get(envId.toStringWithoutVersion()))
        );
        if (!compEnvs.length) return;
        const compEnv = compEnvs[0]; // should not be more than one
        const envToUpdate = envsWithVerToUpdate.find((e) => e.isEqual(compEnv.id, { ignoreVersion: true }));
        if (!envToUpdate) throw new Error(`unable to find ${compEnv.id.toString()} in the envs to update`);
        if (compEnv.id.version === envToUpdate.version) {
          // nothing to update
          alreadyUpToDate.push(comp.id);
          return;
        }
        // don't mark with minus if not exist in .bitmap. it's not needed. when the component is loaded, the
        // merge-operation of the aspects removes duplicate aspect-id with different versions.
        await this.removeSpecificComponentConfig(comp.id, compEnv.id.toString(), false);
        await this.addSpecificComponentConfig(comp.id, envToUpdate.toString(), compEnv.config);
        (updated[envToUpdate.toString()] ||= []).push(comp.id);
      })
    );
    await this.bitMap.write();
    return { updated, alreadyUpToDate };
  }
}

/**
 * this is a super hacky way to do it. problem is that loadAspect is running as onStart hook, where we don't
 * have the CLI fully loaded yet, so we can't get the command from the CLI aspect, we have to retrieve it from
 * process.argv.
 * in general, we don't want every command to try again and again fetching un-built versions. otherwise, every time
 * Bit loads (even bit --help), it'll fetch them and slow down everything.
 * instead, long-running commands and those that need the artifacts from the Version objects, should try to re-fetch.
 */
function shouldReFetchUnBuiltVersion() {
  const commandsToReFetch = ['import'];
  return commandsToReFetch.includes(process.argv[2]);
}

export default Workspace;
