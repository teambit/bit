/* eslint-disable max-lines */
import memoize from 'memoizee';
import mapSeries from 'p-map-series';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import type { PubsubMain } from '@teambit/pubsub';
import { IssuesList } from '@teambit/component-issues';
import type { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { generateNodeModulesPattern, PatternTarget } from '@teambit/dependencies.modules.packages-excluder';
import {
  AspectEntry,
  ComponentMain,
  Component,
  ComponentFactory,
  InvalidComponent,
  ResolveAspectsOptions,
  AspectList,
} from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
import { ComponentScopeDirMap, ConfigMain, WorkspaceConfig } from '@teambit/config';
import {
  DependencyResolverMain,
  DependencyResolverAspect,
  VariantPolicy,
  DependencyList,
} from '@teambit/dependency-resolver';
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony } from '@teambit/harmony';
import { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { isMatchNamespacePatternItem } from '@teambit/workspace.modules.match-pattern';
import type { VariantsMain } from '@teambit/variants';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { InvalidScopeName, InvalidScopeNameFromRemote, isValidScopeName, BitId } from '@teambit/legacy-bit-id';
import { LaneId } from '@teambit/lane-id';
import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions, MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { getMaxSizeForComponents, InMemoryCache, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import { pathIsInside } from '@teambit/legacy.utils';
import { PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute, pathNormalizeToLinux } from '@teambit/legacy.utils';
import fs from 'fs-extra';
import { CompIdGraph, DepEdgeType } from '@teambit/graph';
import { slice, isEmpty, merge, compact, uniqBy } from 'lodash';
import {
  MergeConfigFilename,
  CFG_DEFAULT_RESOLVE_ENVS_FROM_ROOTS,
  CFG_USER_TOKEN_KEY,
} from '@teambit/legacy/dist/constants';
import path from 'path';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { WatchOptions } from '@teambit/watcher';
import type { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import loader from '@teambit/legacy/dist/cli/loader';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { LaneNotFound } from '@teambit/legacy.scope-api';
import { ScopeNotFoundOrDenied } from '@teambit/legacy/dist/remotes/exceptions/scope-not-found-or-denied';
import { isHash } from '@teambit/component-version';
import { GlobalConfigMain } from '@teambit/global-config';
import { getAuthHeader, fetchWithAgent as fetch } from '@teambit/legacy/dist/scope/network/http/http';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { JsonVinyl } from '@teambit/legacy/dist/consumer/component/json-vinyl';
import { ComponentConfigFile } from './component-config-file';
import {
  OnComponentAdd,
  OnComponentChange,
  OnComponentEventResult,
  OnComponentLoad,
  OnComponentRemove,
  SerializableResults,
} from './on-component-events';
import { WorkspaceExtConfig } from './types';
import { ComponentStatus } from './workspace-component/component-status';
import {
  OnAspectsResolve,
  OnAspectsResolveSlot,
  OnBitmapChange,
  OnBitmapChangeSlot,
  OnWorkspaceConfigChange,
  OnWorkspaceConfigChangeSlot,
  OnComponentAddSlot,
  OnComponentChangeSlot,
  OnComponentLoadSlot,
  OnComponentRemoveSlot,
  OnRootAspectAdded,
  OnRootAspectAddedSlot,
} from './workspace.main.runtime';
import { ComponentLoadOptions, WorkspaceComponentLoader } from './workspace-component/workspace-component-loader';
import { GraphFromFsBuilder, ShouldLoadFunc } from './build-graph-from-fs';
import { BitMap } from './bit-map';
import type { MergeOptions as BitmapMergeOptions } from './bit-map';
import { WorkspaceAspect } from './workspace.aspect';
import { GraphIdsFromFsBuilder } from './build-graph-ids-from-fs';
import { AspectsMerger } from './aspects-merger';
import {
  AspectPackage,
  GetConfiguredUserAspectsPackagesOptions,
  WorkspaceAspectsLoader,
  WorkspaceLoadAspectsOptions,
} from './workspace-aspects-loader';
import { MergeConflictFile } from './merge-conflict-file';
import { MergeConfigConflict } from './exceptions/merge-config-conflict';
import { CompFiles } from './workspace-component/comp-files';
import { Filter } from './filter';
import {
  ComponentStatusLegacy,
  ComponentStatusLoader,
  ComponentStatusResult,
} from './workspace-component/component-status-loader';

export type EjectConfResult = {
  configPath: string;
};

export type ClearCacheOptions = {
  skipClearFailedToLoadEnvs?: boolean;
};

export const AspectSpecificField = '__specific';
export const ComponentAdded = 'componentAdded';
export const ComponentChanged = 'componentChanged';
export const ComponentRemoved = 'componentRemoved';

export interface EjectConfOptions {
  propagate?: boolean;
  override?: boolean;
}

export type ComponentExtensionsOpts = {
  loadExtensions?: boolean;
};

type ComponentExtensionsResponse = {
  extensions: ExtensionDataList;
  beforeMerge: Array<{ extensions: ExtensionDataList; origin: ExtensionsOrigin; extraData: any }>; // useful for debugging
  errors?: Error[];
  envId?: string;
};

export type ExtensionsOrigin =
  | 'BitmapFile'
  | 'ModelSpecific'
  | 'ModelNonSpecific'
  | 'ConfigMerge'
  | 'WorkspaceVariants'
  | 'ComponentJsonFile'
  | 'FinalAfterMerge';

const DEFAULT_VENDOR_DIR = 'vendor';

/**
 * API of the Bit Workspace
 */
export class Workspace implements ComponentFactory {
  private warnedAboutMisconfiguredEnvs: string[] = []; // cache env-ids that have been errored about not having "env" type
  priority = true;
  owner?: string;
  componentsScopeDirsMap: ComponentScopeDirMap;
  componentLoader: WorkspaceComponentLoader;
  private componentStatusLoader: ComponentStatusLoader;
  bitMap: BitMap;
  /**
   * Indicate that we are now running installation process
   * This is important to know to ignore missing modules across different places
   */
  inInstallContext = false;
  private componentLoadedSelfAsAspects: InMemoryCache<boolean>; // cache loaded components
  private aspectsMerger: AspectsMerger;
  private componentDefaultScopeFromComponentDirAndNameWithoutConfigFileMemoized;
  /**
   * Components paths are calculated from the component package names of the workspace
   * They are used in webpack configuration to only track changes from these paths inside `node_modules`
   */
  private componentPathsRegExps: RegExp[] = [];
  localAspects: string[] = [];
  filter: Filter;
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

    readonly globalConfig: GlobalConfigMain,

    /**
     * on component add slot.
     */
    private onComponentAddSlot: OnComponentAddSlot,

    private onComponentRemoveSlot: OnComponentRemoveSlot,

    private onAspectsResolveSlot: OnAspectsResolveSlot,

    private onRootAspectAddedSlot: OnRootAspectAddedSlot,

    private graphql: GraphqlMain,

    private onBitmapChangeSlot: OnBitmapChangeSlot,

    private onWorkspaceConfigChangeSlot: OnWorkspaceConfigChangeSlot
  ) {
    this.componentLoadedSelfAsAspects = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.componentLoader = new WorkspaceComponentLoader(this, logger, dependencyResolver, envs, aspectLoader);
    this.validateConfig();
    this.bitMap = new BitMap(this.consumer.bitMap, this.consumer);
    // memoize this method to improve performance.
    this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFileMemoized = memoize(
      this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile.bind(this),
      {
        primitive: true,
        promise: true,
        maxAge: 60 * 1000, // 1 min
      }
    );
    this.aspectsMerger = new AspectsMerger(this, this.harmony);
    this.filter = new Filter(this);
    this.componentStatusLoader = new ComponentStatusLoader(this);
  }

  private validateConfig() {
    if (this.consumer.isLegacy) return;
    if (isEmpty(this.config))
      throw new BitError(
        `fatal: workspace config is empty. probably one of bit files is missing. please run "bit init" to rewrite them`
      );
    const defaultScope = this.config.defaultScope;
    if (!defaultScope) throw new BitError('defaultScope is missing');
    if (!isValidScopeName(defaultScope)) throw new InvalidScopeName(defaultScope);
  }

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

  registerOnComponentLoad(loadFn: OnComponentLoad) {
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

  registerOnComponentRemove(onComponentRemoveFunc: OnComponentRemove) {
    this.onComponentRemoveSlot.register(onComponentRemoveFunc);
    return this;
  }

  registerOnBitmapChange(OnBitmapChangeFunc: OnBitmapChange) {
    this.onBitmapChangeSlot.register(OnBitmapChangeFunc);
    return this;
  }

  registerOnWorkspaceConfigChange(onWorkspaceConfigChangeFunc: OnWorkspaceConfigChange) {
    this.onWorkspaceConfigChangeSlot.register(onWorkspaceConfigChangeFunc);
  }

  registerOnAspectsResolve(onAspectsResolveFunc: OnAspectsResolve) {
    this.onAspectsResolveSlot.register(onAspectsResolveFunc);
    return this;
  }

  registerOnRootAspectAdded(onRootAspectAddedFunc: OnRootAspectAdded) {
    this.onRootAspectAddedSlot.register(onRootAspectAddedFunc);
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

  async listAutoTagPendingComponentIds(): Promise<ComponentID[]> {
    const componentsList = new ComponentsList(this.consumer);
    const modifiedComponents = (await this.modified()).map((c) => c.id);
    const newComponents = (await componentsList.listNewComponents()) as ComponentIdList;
    if (!modifiedComponents || !modifiedComponents.length) return [];
    const autoTagPending = await this.consumer.listComponentsForAutoTagging(
      ComponentIdList.fromArray(modifiedComponents)
    );
    const comps = autoTagPending.filter((autoTagComp) => !newComponents.has(autoTagComp.componentId));
    return comps.map((c) => c.id);
  }

  async hasModifiedDependencies(component: Component) {
    const listAutoTagPendingComponents = await this.listAutoTagPendingComponentIds();
    const isAutoTag = listAutoTagPendingComponents.find((id) => id.isEqualWithoutVersion(component.id));
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
    const status = await this.getComponentStatusById(component.id);
    const hasModifiedDependencies = await this.hasModifiedDependencies(component);
    return ComponentStatus.fromLegacy(status, hasModifiedDependencies, component.isOutdated());
  }

  /**
   * list all workspace components.
   */
  async list(filter?: { offset: number; limit: number }, loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(loadOpts || {});
    const ids = this.consumer.bitMap.getAllIdsAvailableOnLane();
    const idsToGet = filter && filter.limit ? slice(ids, filter.offset, filter.offset + filter.limit) : ids;
    return this.getMany(idsToGet, loadOptsWithDefaults);
  }

  async listWithInvalid(loadOpts?: ComponentLoadOptions) {
    const legacyIds = this.consumer.bitMap.getAllIdsAvailableOnLane();
    return this.componentLoader.getMany(legacyIds, loadOpts, false);
  }

  /**
   * list all invalid components.
   * (see the invalid criteria in ConsumerComponent.isComponentInvalidByErrorType())
   */
  async listInvalid(): Promise<InvalidComponent[]> {
    const ids = this.consumer.bitMap.getAllIdsAvailableOnLane();
    return this.componentLoader.getInvalid(ids);
  }

  /**
   * get ids of all workspace components.
   */
  listIds(): ComponentIdList {
    return this.consumer.bitmapIdsFromCurrentLane;
  }

  listIdsIncludeRemoved(): ComponentIdList {
    return this.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
  }

  /**
   * Check if a specific id exist in the workspace
   * @param componentId
   */
  hasId(componentId: ComponentID): boolean {
    const ids = this.listIds();
    const found = ids.find((id) => {
      return id.isEqual(componentId);
    });
    return !!found;
  }

  /**
   * given component-ids, return the ones that are part of the workspace
   */
  async filterIds(ids: ComponentID[]): Promise<ComponentID[]> {
    const workspaceIds = await this.listIds();
    return ids.filter((id) => workspaceIds.find((wsId) => wsId.isEqual(id, { ignoreVersion: !id.hasVersion() })));
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
  async modified(loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    const { components } = await this.listWithInvalid(loadOpts);
    const modifiedIncludeNulls = await mapSeries(components, async (component) => {
      const modified = await this.isModified(component);
      return modified ? component : null;
    });
    return compact(modifiedIncludeNulls);
  }

  /**
   * list all new components in the workspace.
   */
  async newComponents() {
    const componentIds = await this.newComponentIds();
    return this.getMany(componentIds);
  }

  async newComponentIds(): Promise<ComponentID[]> {
    const allIds = this.listIds();
    return allIds.filter((id) => !id.hasVersion());
  }

  async locallyDeletedIds(): Promise<ComponentID[]> {
    return this.componentList.listLocallySoftRemoved();
  }

  async duringMergeIds(): Promise<ComponentID[]> {
    const duringMerge = this.componentList.listDuringMergeStateComponents();
    return this.resolveMultipleComponentIds(duringMerge);
  }

  /**
   * @deprecated use `listIds()` instead.
   * get all workspace component-ids
   */
  getAllComponentIds(): ComponentID[] {
    return this.listIds();
  }

  async listTagPendingIds(): Promise<ComponentID[]> {
    const newComponents = await this.newComponentIds();
    const modifiedComponents = (await this.modified()).map((c) => c.id);
    const removedComponents = await this.locallyDeletedIds();
    const duringMergeIds = await this.duringMergeIds();
    const allIds = [...newComponents, ...modifiedComponents, ...removedComponents, ...duringMergeIds];
    const allIdsUniq = uniqBy(allIds, (id) => id.toString());
    return allIdsUniq;
  }

  /**
   * list all components that can be tagged. (e.g. when tagging/snapping with --unmodified).
   * which are all components in the workspace, include locally deleted components.
   */
  async listPotentialTagIds(): Promise<ComponentID[]> {
    const deletedIds = await this.locallyDeletedIds();
    const allIdsWithoutDeleted = await this.listIds();
    return [...deletedIds, ...allIdsWithoutDeleted];
  }

  async getNewAndModifiedIds(): Promise<ComponentID[]> {
    const ids = await this.listTagPendingIds();
    return ids;
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
    const unavailableIds = allIds.filter((id) => !availableIds.hasWithoutVersion(id));
    if (!unavailableIds.length) return [];
    const removedIds = this.consumer.bitMap.getRemoved();
    const compsWithHead: ComponentID[] = [];
    await Promise.all(
      unavailableIds.map(async (id) => {
        if (removedIds.has(id)) return; // we don't care about removed components
        const modelComp = await this.scope.legacyScope.getModelComponentIfExist(id);
        if (modelComp && modelComp.head) compsWithHead.push(id);
      })
    );
    return compsWithHead;
  }

  getDependencies(component: Component): DependencyList {
    return this.dependencyResolver.getDependencies(component);
  }

  async getSavedGraphOfComponentIfExist(component: Component) {
    if (!component.id.hasVersion()) return null;
    const flattenedEdges = await this.scope.getFlattenedEdges(component.id);
    const versionObj = await this.scope.getBitObjectVersionById(component.id);
    if (!flattenedEdges || !versionObj) return null;
    if (!flattenedEdges.length && versionObj.flattenedDependencies.length) {
      // there are flattenedDependencies, so must be edges, if they're empty, it's because the component was tagged
      // with a version < ~0.0.901, so this flattenedEdges wasn't exist.
      return null;
    }
    const flattenedBitIdCompIdMap: { [bitIdStr: string]: ComponentID } = {};
    const getCurrentVersionAsTagIfPossible = (): string | undefined => {
      const currentVer = component.id.version;
      if (!currentVer) return undefined;
      const isCurrentVerAHash = isHash(currentVer);
      if (!isCurrentVerAHash) return currentVer;
      const tag = component.tags.byHash(currentVer)?.version.raw;
      return tag || currentVer;
    };
    const currentVersion = getCurrentVersionAsTagIfPossible();

    flattenedBitIdCompIdMap[component.id.changeVersion(currentVersion).toString()] = component.id;
    versionObj.flattenedDependencies.forEach((bitId) => {
      flattenedBitIdCompIdMap[bitId.toString()] = bitId;
    });
    const getCompIdByIdStr = (idStr: string): ComponentID => {
      const compId = flattenedBitIdCompIdMap[idStr];
      if (!compId) {
        const suggestWrongSnap = isHash(component.id.version)
          ? `\nplease check that .bitmap has the correct versions of ${component.id.toStringWithoutVersion()}.
it's possible that the version ${component.id.version} belong to ${idStr.split('@')[0]}`
          : '';
        throw new Error(
          `id ${idStr} exists in flattenedEdges but not in flattened of ${component.id.toString()}.${suggestWrongSnap}`
        );
      }
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
  async getDependentsIds(ids: ComponentID[], filterOutNowWorkspaceIds = true): Promise<ComponentID[]> {
    const graph = await this.getGraphIds();
    const dependents = ids
      .map((id) => graph.predecessors(id.toString()))
      .flat()
      .map((node) => node.attr);
    const uniq = ComponentIdList.uniqFromArray(dependents);
    if (!filterOutNowWorkspaceIds) return uniq;
    const workspaceIds = await this.listIds();
    return uniq.filter((id) => workspaceIds.has(id));
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
   * this is not the complete legacy component (ConsumerComponent), it's missing dependencies and hooks from Harmony
   * are skipped. do not trust the data you get from this method unless you know what you're doing.
   */
  async getLegacyMinimal(id: ComponentID): Promise<ConsumerComponent | undefined> {
    try {
      const componentMap = this.consumer.bitMap.getComponent(id);
      return await ConsumerComponent.loadFromFileSystem({
        componentMap,
        id,
        consumer: this.consumer,
      });
    } catch (err) {
      return undefined;
    }
  }

  async getFilesModification(id: ComponentID): Promise<CompFiles> {
    const bitMapEntry = this.bitMap.getBitmapEntry(id, { ignoreVersion: true });
    const compDir = bitMapEntry.getComponentDir();
    const compDirAbs = path.join(this.path, compDir);
    const sourceFilesVinyls = bitMapEntry.files.map((file) => {
      const filePath = path.join(compDirAbs, file.relativePath);
      return SourceFile.load(filePath, compDirAbs, this.path, {});
    });
    const repo = this.scope.legacyScope.objects;
    const getModelFiles = async () => {
      const modelComp = await this.scope.legacyScope.getModelComponentIfExist(id);
      if (!modelComp) return [];
      if (!bitMapEntry.id.hasVersion()) return [];

      const verObj = await modelComp.loadVersion(bitMapEntry.id.version, repo);
      return verObj.files;
    };

    return new CompFiles(id, repo, sourceFilesVinyls, compDir, await getModelFiles());
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
        // ignore missing modules when loading self
        await this.loadAspects([component.id.toString()], undefined, component.id.toString(), {
          hideMissingModuleError: true,
        });
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

  async getConfiguredUserAspectsPackages(options: GetConfiguredUserAspectsPackagesOptions): Promise<AspectPackage[]> {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.getConfiguredUserAspectsPackages(options);
  }

  /**
   * clears workspace, scope and all components caches.
   * doesn't clear the dependencies-data from the filesystem-cache.
   */
  async clearCache(options: ClearCacheOptions = {}) {
    this.logger.debug('clearing the workspace and scope caches');
    this.aspectLoader.resetFailedLoadAspects();
    if (!options.skipClearFailedToLoadEnvs) this.envs.resetFailedToLoadEnvs();
    await this.scope.clearCache();
    this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFileMemoized.clear();
    this.clearAllComponentsCache();
  }

  /**
   * clear the cache of all components in the workspace.
   * doesn't clear the dependencies-data from the filesystem-cache.
   */
  clearAllComponentsCache() {
    this.logger.debug('clearing all components caches');
    this.componentLoader.clearCache();
    this.consumer.componentLoader.clearComponentsCache();
    this.componentStatusLoader.clearCache();
    this.componentList = new ComponentsList(this.consumer);
  }

  clearComponentCache(id: ComponentID) {
    this.componentLoader.clearComponentCache(id);
    this.componentStatusLoader.clearOneComponentCache(id);
    this.consumer.clearOneComponentCache(id);
    this.componentList = new ComponentsList(this.consumer);
  }

  async warmCache() {
    await this.list();
  }

  getWorkspaceConfig(): WorkspaceConfig {
    const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
    const workspaceConfig = config.workspaceConfig;
    if (!workspaceConfig) throw new Error('workspace config is missing from Config aspect');
    return workspaceConfig;
  }

  async cleanFromConfig(ids: ComponentID[]) {
    const workspaceConfig = this.getWorkspaceConfig();
    const wereIdsRemoved = ids.map((id) => workspaceConfig.removeExtension(id));
    const hasChanged = wereIdsRemoved.some((isRemoved) => isRemoved);
    if (hasChanged) await workspaceConfig.write({ reasonForChange: 'remove components' });
    return hasChanged;
  }

  async triggerOnComponentChange(
    id: ComponentID,
    files: PathOsBasedAbsolute[],
    removedFiles: PathOsBasedAbsolute[],
    watchOpts: WatchOptions
  ): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
      const onChangeResult = await onChangeFunc(component, files, removedFiles, watchOpts);
      if (onChangeResult) results.push({ extensionId: extension, results: onChangeResult });
    });

    // TODO: find way to standardize event names.
    await this.graphql.pubsub.publish(ComponentChanged, { componentChanged: { component } });
    return results;
  }

  async triggerOnComponentAdd(id: ComponentID, watchOpts: WatchOptions): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    const onAddEntries = this.onComponentAddSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    const files = component.state.filesystem.files.map((file) => file.path);
    await mapSeries(onAddEntries, async ([extension, onAddFunc]) => {
      const onAddResult = await onAddFunc(component, files, watchOpts);
      if (onAddResult) results.push({ extensionId: extension, results: onAddResult });
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

  async triggerOnBitmapChange(): Promise<void> {
    const onBitmapChangeEntries = this.onBitmapChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    await mapSeries(onBitmapChangeEntries, async ([, onBitmapChangeFunc]) => {
      await onBitmapChangeFunc();
    });
  }

  /**
   * the purpose is mostly to reload the workspace config when it changes, so entries like "defaultScope" are updated.
   * it also updates the DependencyResolver config. I couldn't find a good way to update all aspects in workspace.jsonc.
   */
  async triggerOnWorkspaceConfigChange(): Promise<void> {
    this.logger.debug('triggerOnWorkspaceConfigChange, reloading workspace config');
    const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
    await config.reloadWorkspaceConfig(this.path);
    const workspaceConfig = config.workspaceConfig;
    if (!workspaceConfig) throw new Error('workspace config is missing from Config aspect');
    const configOfWorkspaceAspect = workspaceConfig.extensions.findExtension(WorkspaceAspect.id);
    if (!configOfWorkspaceAspect) throw new Error('workspace extension is missing from workspace config');
    this.config = configOfWorkspaceAspect.config as WorkspaceExtConfig;
    const configOfDepResolverAspect = workspaceConfig.extensions.findExtension(DependencyResolverAspect.id);
    if (configOfDepResolverAspect) this.dependencyResolver.setConfig(configOfDepResolverAspect.config as any);
    this.dependencyResolver.clearCache();

    const onWorkspaceConfigChangeEntries = this.onWorkspaceConfigChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    await mapSeries(onWorkspaceConfigChangeEntries, async ([, onWorkspaceConfigFunc]) => {
      await onWorkspaceConfigFunc();
    });
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

  async getCurrentLaneObject(): Promise<Lane | undefined> {
    return this.consumer.getCurrentLaneObject();
  }

  isOnMain(): boolean {
    return this.consumer.isOnMain();
  }

  isOnLane(): boolean {
    return this.consumer.isOnLane();
  }

  /**
   * if checked out to a lane and the lane exists in the remote,
   * return the remote lane. otherwise, return null.
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
    } catch (err: any) {
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

  async getComponentConfigVinylFile(
    id: ComponentID,
    options: EjectConfOptions,
    excludeLocalChanges = false
  ): Promise<JsonVinyl> {
    const componentId = await this.resolveComponentId(id);
    const extensions = await this.getExtensionsFromScopeAndSpecific(id, excludeLocalChanges);
    const aspects = await this.createAspectList(extensions);
    this.removeEnvVersionIfExistsLocally(aspects);
    const componentDir = this.componentDir(id, { ignoreVersion: true }, { relative: true });
    const configFile = new ComponentConfigFile(componentId, aspects, componentDir, options.propagate);
    return configFile.toVinylFile(options);
  }

  private removeEnvVersionIfExistsLocally(aspects: AspectList) {
    const env = aspects.get(EnvsAspect.id)?.config?.env;
    if (!env) return;
    const envAspect = aspects.get(env);
    if (!envAspect) return;
    const envExtId = envAspect.id;
    if (!envExtId?.hasVersion()) return;
    if (!this.exists(envExtId)) return;
    envAspect.id = envExtId.changeVersion(undefined);
  }

  async ejectMultipleConfigs(ids: ComponentID[], options: EjectConfOptions): Promise<EjectConfResult[]> {
    const vinylFiles = await Promise.all(ids.map((id) => this.getComponentConfigVinylFile(id, options)));
    const EjectConfResult = vinylFiles.map((file) => ({ configPath: file.path }));
    const dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(vinylFiles);
    dataToPersist.addBasePath(this.path);
    await dataToPersist.persistAllToFS();

    ids.map((id) => this.bitMap.removeEntireConfig(id));
    await this.bitMap.write(`eject-conf (${ids.length} component(s))`);

    return EjectConfResult;
  }

  async getAspectConfigForComponent(id: ComponentID, aspectId: string): Promise<object | undefined> {
    const extensions = await this.getExtensionsFromScopeAndSpecific(id);
    const obj = extensions.toConfigObject();
    return obj[aspectId];
  }

  async getExtensionsFromScopeAndSpecific(id: ComponentID, excludeComponentJson = false): Promise<ExtensionDataList> {
    const componentFromScope = await this.scope.get(id);
    const exclude: ExtensionsOrigin[] = ['WorkspaceVariants'];
    if (excludeComponentJson) exclude.push('ComponentJsonFile');
    const { extensions } = await this.componentExtensions(id, componentFromScope, exclude);

    return extensions;
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

  hasPattern(strArr: string[]) {
    return strArr.some((str) => this.isPattern(str));
  }

  isPattern(str: string) {
    const specialSyntax = ['*', ',', '!', '$', ':'];
    return specialSyntax.some((char) => str.includes(char));
  }

  /**
   * get component-ids matching the given pattern. a pattern can have multiple patterns separated by a comma.
   * it supports negate (!) character to exclude ids.
   */
  async idsByPattern(
    pattern: string,
    throwForNoMatch = true,
    opts: { includeDeleted?: boolean } = {}
  ): Promise<ComponentID[]> {
    const isId = !this.isPattern(pattern);
    if (isId) {
      // if it's not a pattern but just id, resolve it without multimatch to support specifying id without scope-name
      const id = await this.resolveComponentId(pattern);
      if (this.exists(id, { includeDeleted: opts.includeDeleted })) return [id];
      if (throwForNoMatch) throw new MissingBitMapComponent(pattern);
      return [];
    }
    const ids = opts.includeDeleted ? this.listIdsIncludeRemoved() : await this.listIds();
    return this.filterIdsFromPoolIdsByPattern(pattern, ids, throwForNoMatch);
  }

  async filterIdsFromPoolIdsByPattern(pattern: string, ids: ComponentID[], throwForNoMatch = true) {
    return this.scope.filterIdsFromPoolIdsByPattern(pattern, ids, throwForNoMatch, this.filter.by.bind(this.filter));
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

  async getMany(ids: Array<ComponentID>, loadOpts?: ComponentLoadOptions, throwOnFailure = true): Promise<Component[]> {
    const { components } = await this.componentLoader.getMany(ids, loadOpts, throwOnFailure);
    return components;
  }

  getManyByLegacy(components: ConsumerComponent[], loadOpts?: ComponentLoadOptions): Promise<Component[]> {
    return mapSeries(components, async (component) => {
      const id = component.id;
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
  exists(componentId: ComponentID, opts: { includeDeleted?: boolean } = {}): boolean {
    const allIds = opts.includeDeleted ? this.listIdsIncludeRemoved() : this.consumer.bitmapIdsFromCurrentLane;
    return allIds.hasWithoutVersion(componentId);
  }

  getIdIfExist(componentId: ComponentID): ComponentID | undefined {
    const id = this.consumer.bitmapIdsFromCurrentLane.find((_) => _.isEqualWithoutVersion(componentId));
    if (!id) return undefined;
    return componentId.changeVersion(id.version);
  }

  mergeBitmaps(bitmapContent: string, otherBitmapContent: string, opts: BitmapMergeOptions = {}): string {
    return this.bitMap.mergeBitmaps(bitmapContent, otherBitmapContent, opts);
  }

  /**
   * This will make sure to fetch the objects prior to load them
   * do not use it if you are not sure you need it.
   * It will influence the performance
   * currently it used only for get many of aspects
   * @param ids
   */
  async importAndGetMany(
    ids: Array<ComponentID>,
    reason?: string,
    loadOpts?: ComponentLoadOptions,
    throwOnError = true
  ): Promise<Component[]> {
    if (!ids.length) return [];
    const lane = await this.importCurrentLaneIfMissing();
    await this.scope.import(ids, {
      reFetchUnBuiltVersion: shouldReFetchUnBuiltVersion(),
      preferDependencyGraph: true,
      // add the lane object although it was imported with all its ids previously.
      // in some cases, this import re-fetch existing ids whose their VersionHistory is incomplete, so it needs the Lane context.
      lane,
      reason,
    });
    return this.getMany(ids, loadOpts, throwOnError);
  }

  async importCurrentLaneIfMissing(): Promise<Lane | undefined> {
    const laneId = this.getCurrentLaneId();
    const laneObj = await this.scope.legacyScope.getCurrentLaneObject();
    if (laneId.isDefault() || laneObj) {
      return laneObj;
    }
    const lane = await this.getCurrentRemoteLane();
    if (!lane) {
      return undefined;
    }
    this.logger.info(`current lane ${laneId.toString()} is missing, importing it`);
    await this.scope.legacyScope.objects.writeObjectsToTheFS([lane]);
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope.legacyScope);
    const ids = ComponentIdList.fromArray(this.getExportedFrom(lane.toBitIds()));
    await scopeComponentsImporter.importWithoutDeps(ids.toVersionLatest(), {
      cache: false,
      lane,
      includeVersionHistory: true,
      reason: 'latest of the current lane',
    });

    await scopeComponentsImporter.importMany({ ids, lane, reason: 'for making sure the current lane has all ' });
    return lane;
  }

  async use(aspectIdStr: string): Promise<string> {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.use(aspectIdStr);
  }
  async unuse(aspectIdStr: string): Promise<boolean> {
    const compId = await this.resolveComponentId(aspectIdStr);
    return this.cleanFromConfig([compId]);
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
   * @todo: the return path here is Linux when asking for relative and os-based when asking for absolute. fix this to be consistent.
   *
   * Get the component root dir in the file system (relative to workspace or full)
   * @param componentId
   * @param relative return the path relative to the workspace or full path
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    return this.componentDirFromLegacyId(componentId, bitMapOptions, options);
  }

  /**
   * component's files in the workspace are symlinked to the node_modules, and a package.json file is generated on that
   * package directory to simulate a valid node package.
   * @returns the package directory inside the node_module.
   * by default the absolute path, unless `options.relative` was set
   */
  componentPackageDir(component: Component, options = { relative: false }): string {
    const packageName = this.componentPackageName(component);
    const packageDir = path.join('node_modules', packageName);
    return options.relative ? packageDir : this.consumer.toAbsolutePath(packageDir);
  }

  componentPackageName(component: Component): string {
    return this.dependencyResolver.getPackageName(component);
  }

  private componentDirFromLegacyId(
    bitId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    const componentMap = this.consumer.bitMap.getComponent(bitId, bitMapOptions);
    const relativeComponentDir = componentMap.getComponentDir();
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
    const bitMapId = this.consumer.bitMap.getExistingBitId(name, false);
    const bitMapEntry = bitMapId ? this.consumer.bitMap.getComponent(bitMapId) : undefined;
    if (bitMapEntry && bitMapEntry.defaultScope) {
      return bitMapEntry.defaultScope;
    }
    return this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFileMemoized(relativeComponentDir, name);
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
    excludeOrigins: ExtensionsOrigin[] = [],
    opts: ComponentExtensionsOpts = {}
  ): Promise<ComponentExtensionsResponse> {
    const optsWithDefaults: ComponentExtensionsOpts = Object.assign({ loadExtensions: true }, opts);
    const mergeRes: ComponentExtensionsResponse = await this.aspectsMerger.merge(
      componentId,
      componentFromScope,
      excludeOrigins
    );
    const envId = await this.envs.getEnvIdFromEnvsLegacyExtensions(mergeRes.extensions);
    if (optsWithDefaults.loadExtensions) {
      await this.loadComponentsExtensions(mergeRes.extensions, componentId);
      if (envId) {
        await this.warnAboutMisconfiguredEnv(envId);
      }
    }
    mergeRes.envId = envId;
    return mergeRes;
  }

  async warnAboutMisconfiguredEnv(envId: string) {
    if (!envId) return;
    if (this.envs.getCoreEnvsIds().includes(envId)) return;
    if (this.warnedAboutMisconfiguredEnvs.includes(envId)) return;
    let env: Component;
    try {
      const parsedEnvId = await this.resolveComponentId(envId);
      env = await this.get(parsedEnvId);
    } catch (err) {
      return; // unable to get the component for some reason. don't sweat it. forget about the warning
    }
    if (!this.envs.isUsingEnvEnv(env)) {
      this.warnedAboutMisconfiguredEnvs.push(envId);
      this.logger.consoleWarning(
        `env "${envId}" is not of type env. (correct the env's type, or component config with "bit env set ${envId} teambit.envs/env")`
      );
    }
  }

  getConfigMergeFilePath(): string {
    return path.join(this.path, MergeConfigFilename);
  }

  getConflictMergeFile(): MergeConflictFile {
    return this.aspectsMerger.mergeConflictFile;
  }

  getDepsDataOfMergeConfig(id: ComponentID): Record<string, any> | undefined {
    return this.aspectsMerger.getDepsDataOfMergeConfig(id);
  }

  /**
   * @deprecated
   * the workspace.jsonc conflicts are not written to the config-merge file anymore.
   * see https://github.com/teambit/bit/pull/8393 for more details.
   */
  getWorkspaceJsonConflictFromMergeConfig(): { data?: Record<string, any>; conflict: boolean } {
    const configMergeFile = this.getConflictMergeFile();
    let data: Record<string, any> | undefined;
    let conflict = false;
    try {
      data = configMergeFile.getConflictParsed('WORKSPACE');
    } catch (err) {
      if (!(err instanceof MergeConfigConflict)) {
        throw err;
      }
      conflict = true;
      this.logger.error(`unable to parse the config file for the workspace due to conflicts`);
    }
    return { data, conflict };
  }

  getWorkspaceIssues(): Error[] {
    const errors: Error[] = [];

    // since PR #8393, the workspace.jsonc conflicts are not written to the config-merge file anymore.
    // @todo remove this in the future. (maybe Q2 of 2024).
    const configMergeFile = this.getConflictMergeFile();
    try {
      configMergeFile.getConflictParsed('WORKSPACE');
    } catch (err) {
      if (err instanceof MergeConfigConflict) {
        errors.push(err);
      }
    }
    return errors;
  }

  async listComponentsDuringMerge(): Promise<ComponentID[]> {
    const unmergedComps = this.scope.legacyScope.objects.unmergedComponents.getComponents();
    const bitIds = unmergedComps.map((u) => ComponentID.fromObject(u.id));
    return this.resolveMultipleComponentIds(bitIds);
  }

  async getUnmergedComponent(componentId: ComponentID): Promise<Component | undefined> {
    const unmerged = this.scope.legacyScope.objects.unmergedComponents.getEntry(componentId);
    if (unmerged?.head) {
      return this.scope.get(componentId.changeVersion(unmerged?.head.toString()));
    }
    return undefined;
  }

  async isModified(component: Component): Promise<boolean> {
    const head = component.head;
    if (!head) {
      return false; // it's a new component
    }
    const consumerComp = component.state._consumer as ConsumerComponent;
    if (typeof consumerComp._isModified === 'boolean') return consumerComp._isModified;
    const componentStatus = await this.getComponentStatusById(component.id);
    return componentStatus.modified === true;
  }

  async isModifiedOrNew(component: Component): Promise<boolean> {
    const head = component.head;
    if (!head) {
      return true; // it's a new component
    }
    return this.isModified(component);
  }

  isExported(id: ComponentID): boolean {
    return this.consumer.isExported(id);
  }
  getExportedFrom(ids: ComponentID[]): ComponentID[] {
    const notExported = this.consumer.getNotExportedIds();
    return ids.filter((id) => !notExported.hasWithoutVersion(id));
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
    await this.bitMap.write('scope-set');
    return newComponentIds;
  }

  /**
   * @param scopeName
   * @param includeComponents whether to update new components in the workspace to use the new default-scope
   * this is relevant only for new components that were using the previous default-scope
   */
  async setDefaultScope(scopeName: string, includeComponents = true) {
    if (this.defaultScope === scopeName) {
      throw new Error(`the default-scope is already set as "${scopeName}", nothing to change`);
    }
    if (!isValidScopeName(scopeName)) {
      throw new InvalidScopeName(scopeName);
    }
    const workspaceConfig = this.getWorkspaceConfig();
    workspaceConfig.setExtension(
      WorkspaceAspect.id,
      { defaultScope: scopeName },
      { mergeIntoExisting: true, ignoreVersion: true }
    );
    if (includeComponents) {
      // fix also comps using the old default-scope
      this.bitMap.updateDefaultScope(this.config.defaultScope, scopeName);
    }

    this.config.defaultScope = scopeName;
    await workspaceConfig.write({ reasonForChange: `default-scope (${scopeName})` });
    await this.bitMap.write('scope-set');
  }

  async addSpecificComponentConfig(
    id: ComponentID,
    aspectId: string,
    config: Record<string, any> = {},
    {
      shouldMergeWithExisting,
      shouldMergeWithPrevious,
    }: {
      shouldMergeWithExisting?: boolean;
      /**
       * relevant only when writing to .bitmap.
       * eject config of the given aspect-id, so then it won't override previous config. (see "adding prod dep, tagging then adding devDep" e2e-test)
       */
      shouldMergeWithPrevious?: boolean;
    } = { shouldMergeWithExisting: false, shouldMergeWithPrevious: false }
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
        const existingConfig = await this.getAspectConfigForComponent(id, aspectId);
        config = existingConfig ? merge(existingConfig, config) : config;
      }
      this.bitMap.addComponentConfig(id, aspectId, config, shouldMergeWithExisting);
    }
  }

  async removeSpecificComponentConfig(id: ComponentID, aspectId: string, markWithMinusIfNotExist = false) {
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
      return bitId;
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
      const defaultScopeFromVariantsOrWs =
        await this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFileMemoized(relativeComponentDir, name);
      componentConfigFile = await ComponentConfigFile.load(
        absComponentDir,
        this.createAspectList.bind(this),
        defaultScopeFromVariantsOrWs
      );
    }

    return componentConfigFile;
  }

  /**
   * load aspects from the workspace and if not exists in the workspace, load from the scope.
   * keep in mind that the graph may have circles.
   */
  async loadAspects(
    ids: string[] = [],
    throwOnError = false,
    neededFor?: string,
    opts: WorkspaceLoadAspectsOptions = {}
  ): Promise<string[]> {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.loadAspects(ids, throwOnError, neededFor, opts);
  }

  async loadComponentsExtensions(
    extensions: ExtensionDataList,
    originatedFrom?: ComponentID,
    opts: WorkspaceLoadAspectsOptions = {}
  ): Promise<void> {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.loadComponentsExtensions(extensions, originatedFrom, opts);
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
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.resolveAspects(runtimeName, componentIds, opts);
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

  getWorkspaceAspectsLoader(): WorkspaceAspectsLoader {
    let resolveEnvsFromRoots = this.config.resolveEnvsFromRoots;
    if (resolveEnvsFromRoots === undefined) {
      const resolveEnvsFromRootsConfig = this.globalConfig.getSync(CFG_DEFAULT_RESOLVE_ENVS_FROM_ROOTS);
      const defaultResolveEnvsFromRoots: boolean =
        // @ts-ignore
        resolveEnvsFromRootsConfig === 'true' || resolveEnvsFromRootsConfig === true;
      resolveEnvsFromRoots = defaultResolveEnvsFromRoots;
    }

    const workspaceAspectsLoader = new WorkspaceAspectsLoader(
      this,
      this.scope,
      this.aspectLoader,
      this.envs,
      this.dependencyResolver,
      this.logger,
      this.globalConfig,
      this.harmony,
      this.onAspectsResolveSlot,
      this.onRootAspectAddedSlot,
      this.config.resolveAspectsFromNodeModules,
      resolveEnvsFromRoots
    );
    return workspaceAspectsLoader;
  }

  getCapsulePath() {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.getCapsulePath();
  }

  shouldUseHashForCapsules() {
    const workspaceAspectsLoader = this.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.shouldUseHashForCapsules();
  }

  /**
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
    this.bitMap = new BitMap(this.consumer.bitMap, this.consumer);
    await this.clearCache();
  }

  async getComponentPackagePath(component: Component) {
    const inInWs = await this.hasId(component.id);
    const relativePath = this.dependencyResolver.getRuntimeModulePath(component, inInWs);
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

  async resolveComponentIdFromPackageName(packageName: string): Promise<ComponentID> {
    if (!packageName.startsWith('@')) {
      throw new Error(`findComponentIdFromPackageName supports only packages that start with @, got ${packageName}`);
    }
    const errMsgPrefix = `unable to resolve a component-id from the package-name ${packageName}, `;
    const pkgJsonPath = path.join(this.path, 'node_modules', packageName, 'package.json');
    let pkgJson: Record<string, any> | undefined;
    try {
      pkgJson = await fs.readJson(pkgJsonPath);
    } catch (err) {
      // never mind the reason. probably it's not there.
    }
    if (pkgJson) {
      const compId = pkgJson.componentId;
      if (!compId) {
        throw new BitError(
          `${errMsgPrefix}the package.json file has no componentId field, it's probably not a component`
        );
      }
      return ComponentID.fromObject(compId);
    }

    const url = `https://node-registry.bit.cloud/${packageName}`;
    const token = await this.globalConfig.get(CFG_USER_TOKEN_KEY);
    const headers = token ? getAuthHeader(token) : {};
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new BitError(`${errMsgPrefix}got ${res.statusText} from the url: ${url}`);
    }
    const data = await res.json();
    const latest = data['dist-tags'].latest;
    if (!latest) throw new BitError(`${errMsgPrefix}the "dist-tags" has no latest field`);
    const version = data.versions[latest];
    if (!version) throw new BitError(`${errMsgPrefix}the "versions" is missing the latest "${latest}" field`);
    const compId = version.componentId;
    if (!compId)
      throw new BitError(
        `${errMsgPrefix}the package.json of version "${latest}" has no componentId field, it's probably not a component`
      );
    return ComponentID.fromObject(compId).changeVersion(undefined);
  }

  /**
   * Transform the id to ComponentId and get the exact id as appear in bitmap
   */
  async resolveComponentId(id: string | BitId | ComponentID): Promise<ComponentID> {
    if (id instanceof BitId && id.hasScope() && id.hasVersion()) {
      // an optimization to make it faster when BitId is passed
      return ComponentID.fromLegacy(id);
    }
    if (id instanceof ComponentID && id.hasVersion()) {
      return id;
    }
    if (typeof id === 'string' && id.startsWith('@')) {
      return this.resolveComponentIdFromPackageName(id);
    }
    const getDefaultScope = async (bitId: ComponentID, bitMapOptions?: GetBitMapComponentOptions) => {
      if (bitId.scope) {
        return bitId.scope;
      }
      const relativeComponentDir = this.componentDirFromLegacyId(bitId, bitMapOptions, { relative: true });
      const defaultScope = await this.componentDefaultScopeFromComponentDirAndName(
        relativeComponentDir,
        bitId.fullName
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
        return ComponentID.fromLegacy(legacyId._legacy, defaultScope);
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
          return ComponentID.fromLegacy(_bitmapIdWithVersionForSource._legacy, defaultScopeForBitmapId);
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
      return ComponentID.fromString(id.toString());
    }
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | ComponentID>): Promise<ComponentID[]> {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  /**
   * component-id coming from Scope don't have the defaultScope, the legacyComponentId.scope is always populated.
   * in the .bitmap we need to distinguish between the two, so the componentId needs to be corrected with the defaultScope.
   */
  resolveIdWithDefaultScope(componentId: ComponentID): ComponentID {
    const isExported = !this.consumer.getNotExportedIds().searchWithoutVersion(componentId);
    const bitId = componentId._legacy.changeScope(isExported ? componentId.scope : undefined);
    return ComponentID.fromLegacy(bitId, componentId.scope);
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
        extensionEntry.extensionId = resolvedId;
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
    const envComp = await this.get(ComponentID.fromString(envStrWithPossiblyVersion));
    const isEnv = this.envs.isEnv(envComp);
    if (!isEnv) throw new BitError(`the component ${envComp.id.toString()} is not an env`);
    const envIdStrNoVersion = envId.toStringWithoutVersion();
    await this.unsetEnvFromComponents(componentIds);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.addSpecificComponentConfig(componentId, envStrWithPossiblyVersion);
        await this.addSpecificComponentConfig(componentId, EnvsAspect.id, { env: envIdStrNoVersion });
      })
    );
    await this.bitMap.write(`env-set (${envId.toString()})`);
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
    const comps = await this.importAndGetMany([envId], `to get the env ${envId.toString()}`);
    const comp = comps[0];
    if (!comp) throw new BitError(`unable to find ${envId.toString()} in the workspace or in the remote`);
    return comp.id.toString();
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
        // the env that gets saved in the .bitmap file config root can be with or without version.
        // e.g. when a custom env is in .bitmap, it's saved without version, but when asking the component for the
        // env by `this.getAspectIdFromConfig`, it returns the env with version.
        // to make sure we remove the env from the .bitmap, we need to remove both with and without version.
        const currentEnvWithPotentialVersion = await this.getAspectIdFromConfig(id, currentEnv, true);
        await this.removeSpecificComponentConfig(id, currentEnv);
        if (currentEnvWithPotentialVersion && currentEnvWithPotentialVersion.includes('@')) {
          await this.removeSpecificComponentConfig(id, currentEnvWithPotentialVersion);
        }
        await this.removeSpecificComponentConfig(id, EnvsAspect.id);
        changed.push(id);
      })
    );
    await this.bitMap.write(`env-unset`);
    return { changed, unchanged };
  }

  async updateEnvForComponents(envIdStr?: string, pattern?: string) {
    const allWsComps = await this.list();
    const allWsIds = await this.listIds();
    const isInWs = (envId: ComponentID) => allWsIds.find((id) => id.isEqual(envId, { ignoreVersion: true }));
    const allEnvs = await this.envs.createEnvironment(allWsComps);
    const getEnvWithVersion = async (envId: ComponentID) => {
      if (envId.hasVersion()) return envId;
      if (isInWs(envId)) return envId;
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
        const envWithVer = await getEnvWithVersion(envCompId);
        return [envWithVer];
      }
      const allEnvsIds = allEnvs.runtimeEnvs.map((env) => env.id);
      const allEnvsCompIds = await this.resolveMultipleComponentIds(allEnvsIds);
      // check whether the envId has version, otherwise, it's a core env.
      const nonCoreEnvs = allEnvsCompIds.filter((envId) => envId.hasVersion());
      const envsWithVersions = await mapSeries(nonCoreEnvs, (envId) =>
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
        const envIsInWs = isInWs(envToUpdate);

        if (!envIsInWs && compEnv.id.version === envToUpdate.version) {
          // nothing to update
          alreadyUpToDate.push(comp.id);
          return;
        }
        if (envIsInWs && !(await this.getSpecificComponentConfig(comp.id, compEnv.id.toString()))) {
          // compEnv has version. If this id with version doesn't exist in .bitmap, either, it's not saved in .bitmap
          // (probably it's in the model) or it's in .bitmap without version (as expected). either way, nothing to update.
          alreadyUpToDate.push(comp.id);
          return;
        }
        // don't mark with minus if not exist in .bitmap. it's not needed. when the component is loaded, the
        // merge-operation of the aspects removes duplicate aspect-id with different versions.
        await this.removeSpecificComponentConfig(comp.id, compEnv.id.toString(), false);
        await this.addSpecificComponentConfig(
          comp.id,
          envIsInWs ? envToUpdate.toStringWithoutVersion() : envToUpdate.toString(),
          compEnv.config
        );
        (updated[envToUpdate.toString()] ||= []).push(comp.id);
      })
    );
    await this.bitMap.write('env-update');
    return { updated, alreadyUpToDate };
  }

  getComponentPathsRegExps() {
    return this.componentPathsRegExps;
  }

  async setComponentPathsRegExps() {
    const workspaceComponents = await this.list();
    const workspacePackageNames = workspaceComponents.map((c) => this.componentPackageName(c));
    const packageManager = this.dependencyResolver.getPackageManagerName();
    const isPnpmEnabled = typeof packageManager === 'undefined' || packageManager.includes('pnpm');
    const pathsExcluding = [
      generateNodeModulesPattern({
        packages: workspacePackageNames,
        target: PatternTarget.WEBPACK,
        isPnpmEnabled,
      }),
    ];
    this.componentPathsRegExps = [...pathsExcluding.map((stringPattern) => new RegExp(stringPattern))];
  }

  getInjectedDirs(component: Component): Promise<string[]> {
    const relativeCompDir = this.componentDir(component.id, undefined, {
      relative: true,
    });
    return this.dependencyResolver.getInjectedDirs(
      this.path,
      relativeCompDir,
      this.dependencyResolver.getPackageName(component)
    );
  }

  async getAutoDetectOverrides(configuredExtensions: ExtensionDataList, id: ComponentID, legacyFiles: SourceFile[]) {
    let policy = await this.dependencyResolver.mergeVariantPolicies(configuredExtensions, id, legacyFiles);
    // this is needed for "bit install" to install the dependencies from the merge config (see https://github.com/teambit/bit/pull/6849)
    const depsDataOfMergeConfig = this.getDepsDataOfMergeConfig(id);
    if (depsDataOfMergeConfig) {
      const policiesFromMergeConfig = VariantPolicy.fromConfigObject(depsDataOfMergeConfig, { source: 'auto' });
      policy = VariantPolicy.mergePolices([policy, policiesFromMergeConfig]);
    }
    return policy.toLegacyAutoDetectOverrides();
  }

  getAutoDetectConfigMerge(id: ComponentID) {
    const depsDataOfMergeConfig = this.getDepsDataOfMergeConfig(id);
    if (depsDataOfMergeConfig) {
      const policy = VariantPolicy.fromConfigObject(depsDataOfMergeConfig, { source: 'auto' });
      return policy.toLegacyAutoDetectOverrides();
    }
    return undefined;
  }

  async getManyComponentsStatuses(ids: ComponentID[]): Promise<ComponentStatusResult[]> {
    return this.componentStatusLoader.getManyComponentsStatuses(ids);
  }

  async getComponentStatusById(id: ComponentID): Promise<ComponentStatusLegacy> {
    return this.componentStatusLoader.getComponentStatusById(id);
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
