import mapSeries from 'p-map-series';
import path from 'path';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import semver from 'semver';
import multimatch from 'multimatch';
import type { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type {
  AspectData,
  ComponentMain,
  ResolveAspectsOptions,
  Component,
  ComponentFactory,
  Snap,
  State,
} from '@teambit/component';
import { ComponentAspect, AspectEntry } from '@teambit/component';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import { IsolatorAspect } from '@teambit/isolator';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ExpressMain } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import type { DependenciesGraph, DepEdge, ModelComponent, Lane, Version } from '@teambit/objects';
import { Ref, Repository, ObjectList } from '@teambit/objects';
import type { Scope as LegacyScope, Types } from '@teambit/legacy.scope';
import { Scope, loadScopeIfExist } from '@teambit/legacy.scope';
import type { LegacyComponentLog as ComponentLog } from '@teambit/legacy-component-log';
import { ExportPersist, PostSign } from '@teambit/scope.remote-actions';
import type { DependencyResolverMain, NodeLinker } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { Remotes } from '@teambit/scope.remotes';
import { getScopeRemotes } from '@teambit/scope.remotes';
import { isMatchNamespacePatternItem } from '@teambit/workspace.modules.match-pattern';
import { isLikelyPackageName, resolveComponentIdFromPackageName } from '@teambit/pkg.modules.component-package-name';
import type { CompIdGraph, DepEdgeType } from '@teambit/graph';
import type { WatchOptions } from 'chokidar';
import chokidar from 'chokidar';
import type { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import { getDivergeData } from '@teambit/component.snap-distance';
import type { AuthData } from '@teambit/scope.network';
import { Http, DEFAULT_AUTH_TYPE, getAuthDataFromHeader } from '@teambit/scope.network';
import type { FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import { remove, ExternalActions } from '@teambit/legacy.scope-api';
import { BitError } from '@teambit/bit-error';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { GLOBAL_SCOPE } from '@teambit/legacy.constants';
import { BitId } from '@teambit/legacy-bit-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { compact, slice, difference, partition } from 'lodash';
import { ComponentNotFound } from './exceptions';
import { ScopeAspect } from './scope.aspect';
import { scopeSchema } from './scope.graphql';
import { ScopeUIRoot } from './scope.ui-root';
import { PutRoute, FetchRoute, ActionRoute, DeleteRoute } from './routes';
import { ScopeComponentLoader } from './scope-component-loader';
import { ScopeCmd } from './scope-cmd';
import { StagedConfig } from './staged-config';
import { NoIdMatchPattern } from './exceptions/no-id-match-pattern';
import type { ScopeLoadAspectsOptions } from './scope-aspects-loader';
import { ScopeAspectsLoader } from './scope-aspects-loader';
import { ClearCacheAction } from './clear-cache-action';
import { CatScopeCmd } from './debug-commands/cat-scope-cmd';
import { CatComponentCmd } from './debug-commands/cat-component-cmd';
import CatObjectCmd from './debug-commands/cat-object-cmd';
import CatLaneCmd from './debug-commands/cat-lane-cmd';
import { RunActionCmd } from './run-action/run-action.cmd';
import type { ConfigStoreMain, Store } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';

type RemoteEventMetadata = { auth?: AuthData; headers?: {} };
type RemoteEvent<Data> = (data: Data, metadata: RemoteEventMetadata, errors?: Array<string | Error>) => Promise<void>;
type OnPostPutData = { ids: ComponentID[]; lanes: Lane[] };
type OnPostDeleteData = { ids: ComponentID[] };
type OnPreFetchObjectData = { ids: string[]; fetchOptions: FETCH_OPTIONS };

type OnPostPut = RemoteEvent<OnPostPutData>;
type OnPostExport = RemoteEvent<OnPostPutData>;
type OnPostDelete = RemoteEvent<OnPostDeleteData>;
type OnPostObjectsPersist = RemoteEvent<undefined>;
type OnPreFetchObjects = RemoteEvent<OnPreFetchObjectData>;
type OnCompAspectReCalc = (component: Component) => Promise<AspectData | undefined>;

export type OnPostPutSlot = SlotRegistry<OnPostPut>;
export type OnPostDeleteSlot = SlotRegistry<OnPostDelete>;
export type OnPostExportSlot = SlotRegistry<OnPostExport>;
export type OnPostObjectsPersistSlot = SlotRegistry<OnPostObjectsPersist>;
export type OnPreFetchObjectsSlot = SlotRegistry<OnPreFetchObjects>;
export type OnCompAspectReCalcSlot = SlotRegistry<OnCompAspectReCalc>;
export type LoadOptions = {
  /**
   * In case the component we are loading is app, whether to load it as app (in a scope aspects capsule)
   */
  loadApps?: boolean;
  /**
   * In case the component we are loading is env, whether to load it as env (in a scope aspects capsule)
   */
  loadEnvs?: boolean;

  /**
   * Should we load the components' aspects (this useful when you only want sometime to load the component itself
   * as aspect but not its aspects)
   */
  loadCompAspects?: boolean;

  /**
   * Should we load the components' custom envs when loading from the scope
   * This is usually not required unless you load an aspect with custom env from the scope
   * usually when signing aspects
   */
  loadCustomEnvs?: boolean;
};

export type ScopeConfig = {
  httpTimeOut: number;
  description?: string;
  icon?: string;
  backgroundIconColor?: string;
  /**
   * Set a different package manager for the aspects capsules
   */
  aspectsPackageManager?: string;
  /**
   * Set a different node linker for the aspects capsules
   */
  aspectsNodeLinker?: NodeLinker;
};

export class ScopeMain implements ComponentFactory {
  componentLoader: ScopeComponentLoader;
  constructor(
    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony,
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    /**
     * component extension.
     */
    readonly componentExtension: ComponentMain,

    /**
     * slot registry for subscribing to build
     */

    readonly config: ScopeConfig,

    private postPutSlot: OnPostPutSlot,

    private postDeleteSlot: OnPostDeleteSlot,

    private postExportSlot: OnPostExportSlot,

    private postObjectsPersist: OnPostObjectsPersistSlot,

    public preFetchObjects: OnPreFetchObjectsSlot,

    private OnCompAspectReCalcSlot: OnCompAspectReCalcSlot,

    private isolator: IsolatorMain,

    private aspectLoader: AspectLoaderMain,

    private logger: Logger,

    private envs: EnvsMain,

    private dependencyResolver: DependencyResolverMain,

    private configStore: ConfigStoreMain
  ) {
    this.componentLoader = new ScopeComponentLoader(this, this.logger);
  }

  priority?: boolean | undefined;

  localAspects: string[] = [];

  /**
   * name of the scope
   */
  get name(): string {
    return this.legacyScope.name;
  }

  get icon(): string | undefined {
    return this.config.icon;
  }

  get backgroundIconColor(): string | undefined {
    return this.config.backgroundIconColor;
  }

  get description(): string | undefined {
    return this.config.description;
  }

  get path(): string {
    return this.legacyScope.path;
  }

  get isLegacy(): boolean {
    return this.legacyScope.isLegacy;
  }

  get isGlobalScope(): boolean {
    return this.path === GLOBAL_SCOPE;
  }

  get aspectsPackageManager(): string | undefined {
    return this.config.aspectsPackageManager;
  }

  get aspectsNodeLinker(): NodeLinker | undefined {
    return this.config.aspectsNodeLinker;
  }

  // We need to reload the aspects with their new version since:
  // during get many by legacy, we go load component which in turn go to getEnv
  // get env validates that the env written on the component is really exist by checking the envs slot registry
  // when we load here, it's env version in the aspect list already has the new version in case the env itself is being tagged
  // so we are search for the env in the registry with the new version number
  // but since the env only registered during the on load of the bit process (before the tag) it's version in the registry is only the old one
  // once we reload them we will have it registered with the new version as well
  async reloadAspectsWithNewVersion(components: ConsumerComponent[]): Promise<void> {
    const host = this.componentExtension.getHost();

    // Return only aspects that defined on components but not in the root config file (workspace.jsonc/scope.jsonc)
    const getUserAspectsIdsWithoutRootIds = (): string[] => {
      const allUserAspectIds = this.aspectLoader.getUserAspects();
      const rootIds = Object.keys(this.harmony.config.toObject());
      const diffIds = difference(allUserAspectIds, rootIds);
      return diffIds;
    };

    // Based on the list of components to be tagged return those who are loaded to harmony with their used version
    const getAspectsByPreviouslyUsedVersion = async (): Promise<string[]> => {
      const harmonyIds = getUserAspectsIdsWithoutRootIds();
      const aspectsIds: string[] = [];
      const aspectsP = components.map(async (component) => {
        const newId = await host.resolveComponentId(component.id);
        if (
          component.previouslyUsedVersion &&
          component.version &&
          component.previouslyUsedVersion !== component.version
        ) {
          const newIdWithPreviouslyUsedVersion = newId.changeVersion(component.previouslyUsedVersion);
          if (harmonyIds.includes(newIdWithPreviouslyUsedVersion.toString())) {
            aspectsIds.push(newId.toString());
          }
        }
      });
      await Promise.all(aspectsP);
      return aspectsIds;
    };

    const idsToLoad = await getAspectsByPreviouslyUsedVersion();
    await host.loadAspects(idsToLoad, false, 'scope.reloadAspectsWithNewVersion');
  }

  loadAspects(
    ids: string[],
    throwOnError?: boolean | undefined,
    neededFor?: string | undefined,
    lane?: Lane,
    opts?: ScopeLoadAspectsOptions
  ): Promise<string[]> {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.loadAspects(ids, throwOnError, neededFor, lane, opts);
  }
  resolveAspects(
    runtimeName?: string | undefined,
    componentIds?: ComponentID[] | undefined,
    opts?: ResolveAspectsOptions | undefined
  ): Promise<AspectDefinition[]> {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.resolveAspects(runtimeName, componentIds, opts);
  }

  async getResolvedAspects(
    components: Component[],
    opts?: { skipIfExists?: boolean; packageManagerConfigRootDir?: string; workspaceName?: string }
  ): Promise<RequireableComponent[]> {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.getResolvedAspects(components, opts);
  }

  async executeOnCompAspectReCalcSlot(component: Component) {
    const envsData = await this.envs.calcDescriptor(component, { skipWarnings: false });
    const policy = await this.dependencyResolver.mergeVariantPolicies(
      component.config.extensions,
      component.id,
      component.state._consumer.files,
      component.state._consumer.dependencies.dependencies
    );
    const dependenciesList = await this.dependencyResolver.extractDepsFromLegacy(component, policy);

    const depResolverData = {
      packageName: this.dependencyResolver.calcPackageName(component),
      dependencies: dependenciesList.serialize(),
      policy: policy.serialize(),
    };
    const resolvedEnvJsonc = await this.envs.calculateEnvManifest(
      component,
      component.state._consumer.files,
      component.state._consumer.dependencies.dependencies
    );
    if (resolvedEnvJsonc) {
      // @ts-ignore
      envsData.resolvedEnvJsonc = resolvedEnvJsonc;
    }
    // Make sure we are adding the envs / deps data first because other on load events might depend on it
    await Promise.all([
      this.upsertExtensionData(component, EnvsAspect.id, envsData),
      this.upsertExtensionData(component, DependencyResolverAspect.id, depResolverData),
    ]);

    // We are updating the component state with the envs and deps data here, so in case we have other slots that depend on this data
    // they will be able to get it, as it's very common use case that during on load someone want to access to the component env for example
    const aspectListWithEnvsAndDeps = await this.createAspectListFromExtensionDataList(
      component.state._consumer.extensions
    );
    component.state.aspects = aspectListWithEnvsAndDeps;

    const entries = this.OnCompAspectReCalcSlot.toArray();
    await mapSeries(entries, async ([extension, onLoad]) => {
      const data = await onLoad(component);
      await this.upsertExtensionData(component, extension, data);
      // Update the aspect list to have changes happened during the on load slot (new data added above)
      component.state.aspects.upsertEntry(await this.resolveComponentId(extension), data);
    });

    return component;
  }

  getDependencies(component: Component) {
    return this.dependencyResolver.getDependencies(component);
  }

  componentPackageName(component: Component): string {
    return this.dependencyResolver.getPackageName(component);
  }

  private async upsertExtensionData(component: Component, extension: string, data: any) {
    if (!data) return;
    const existingExtension = component.state._consumer.extensions.findExtension(extension);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }
    component.state._consumer.extensions.push(await this.getDataEntry(extension, data));
  }

  private async getDataEntry(extension: string, data: { [key: string]: any }): Promise<ExtensionDataEntry> {
    // TODO: @gilad we need to refactor the extension data entry api.
    return new ExtensionDataEntry(undefined, undefined, extension, undefined, data);
  }

  getIsolateAspectsOpts(opts?: {
    skipIfExists?: boolean;
    packageManagerConfigRootDir?: string;
    workspaceName?: string;
  }): IsolateComponentsOptions {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.getIsolateOpts(opts);
  }

  getAspectCapsulePath() {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.getAspectCapsulePath();
  }

  shouldUseHashForCapsules() {
    const scopeAspectsLoader = this.getScopeAspectsLoader();
    return scopeAspectsLoader.shouldUseHashForCapsules();
  }

  getManyByLegacy(components: ConsumerComponent[]): Promise<Component[]> {
    return mapSeries(components, async (component) => this.getFromConsumerComponent(component));
  }

  getScopeAspectsLoader(): ScopeAspectsLoader {
    const scopeAspectsLoader = new ScopeAspectsLoader(
      this,
      this.aspectLoader,
      this.envs,
      this.isolator,
      this.logger,
      this.configStore
    );
    return scopeAspectsLoader;
  }

  async clearCache() {
    this.logger.debug('clearing the components and the legacy cache');
    this.componentLoader.clearCache();
    await this.legacyScope.objects.clearCache();
  }

  /**
   * register to the post-export slot.
   */
  onPostPut(postPutFn: OnPostPut) {
    this.postPutSlot.register(postPutFn);
    return this;
  }

  /**
   * register to the post-delete slot.
   */
  onPostDelete(postDeleteFn: OnPostDelete) {
    this.postDeleteSlot.register(postDeleteFn);
    return this;
  }

  /**
   * register to the post-export slot.
   */
  registerOnPostExport(postExportFn: OnPostExport) {
    this.postExportSlot.register(postExportFn);
    return this;
  }

  registerOnPreFetchObjects(preFetchObjectsFn: OnPreFetchObjects) {
    this.preFetchObjects.register(preFetchObjectsFn);
    return this;
  }

  registerOnCompAspectReCalc(compAspectReCalcSlotFn: OnCompAspectReCalc) {
    this.OnCompAspectReCalcSlot.register(compAspectReCalcSlotFn);
  }

  registerOnPostObjectsPersist(postObjectsPersistFn: OnPostObjectsPersist) {
    this.postObjectsPersist.register(postObjectsPersistFn);
    return this;
  }

  /**
   * Will fetch a list of components into the current scope.
   * This will only fetch the object and won't write the files to the actual FS
   */
  fetch(ids: ComponentIdList) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  async delete(
    { ids, force, lanes }: { ids: string[]; force: boolean; lanes: boolean },
    headers?: Record<string, any>
  ) {
    const authData = getAuthDataFromHeader(headers?.authorization);
    const result = await remove({
      path: this.path,
      ids,
      force,
      lanes,
    });

    const fns = this.postDeleteSlot.values();
    const metadata = { auth: authData, headers };
    const componentIds = lanes ? [] : ids.map((id) => ComponentID.fromString(id));
    await mapSeries(fns, async (fn) => {
      try {
        await fn({ ids: componentIds }, metadata);
      } catch (err: any) {
        this.logger.error('failed to run delete slot', err);
      }
    });
    return result;
  }

  isExported(id: ComponentID): boolean {
    return this.legacyScope.isExported(id);
  }

  /**
   * for long-running processes, such as `bit start` or `bit watch`, it's important to keep the following data up to date:
   * 1. scope-index (.bit/index.json file).
   * 2. remote-refs (.bit/refs/*).
   * 3. global config. so for example if a user logs in or out it would be reflected.
   * it's possible that other commands (e.g. `bit import`) modified these files, while these processes are running.
   * Because these data are kept in memory, they're not up to date anymore.
   */
  async watchScopeInternalFiles(watchOptions: WatchOptions = {}) {
    const scopeIndexFile = this.legacyScope.objects.scopeIndex.getPath();
    const remoteLanesDir = this.legacyScope.objects.remoteLanes.basePath;
    const globalStore = this.configStore.stores.global;
    const scopeStore = this.configStore.stores.scope;
    const globalConfigFile = globalStore.getPath();
    const scopeJsonPath = scopeStore.getPath();
    const pathsToWatch = [scopeIndexFile, remoteLanesDir, globalConfigFile, scopeJsonPath];
    const watcher = chokidar.watch(pathsToWatch, watchOptions);
    watcher.on('ready', () => {
      this.logger.debug(`watchSystemFiles has started, watching ${pathsToWatch.join(', ')}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    watcher.on('change', async (filePath) => {
      if (filePath === scopeIndexFile) {
        this.logger.debug('scope index file has been changed, reloading it');
        await this.legacyScope.objects.reLoadScopeIndex();
      } else if (filePath.startsWith(remoteLanesDir)) {
        this.legacyScope.objects.remoteLanes.removeFromCacheByFilePath(filePath);
      } else if (filePath === globalConfigFile) {
        this.logger.debug('global config file has been changed, invalidating its cache');
        await globalStore.invalidateCache();
        this.configStore.invalidateCache();
      } else if (filePath === scopeJsonPath) {
        this.logger.debug('scope.json file has been changed, reloading it');
        await scopeStore.invalidateCache();
        this.configStore.invalidateCache();
      } else {
        this.logger.error(
          'unknown file has been changed, please check why it is watched by scope.watchSystemFiles',
          filePath
        );
      }
    });
  }

  async toObjectList(types: Types): Promise<ObjectList> {
    const objects = await this.legacyScope.objects.list(types);
    return ObjectList.fromBitObjects(objects);
  }

  // TODO: temporary compiler workaround - discuss this with david.
  private toJs(str: string) {
    if (str.endsWith('.ts')) return str.replace('.ts', '.js');
    return str;
  }

  async getGraph(ids?: ComponentID[]): Promise<Graph<Component, string>> {
    if (!ids || !ids.length) ids = (await this.list()).map((comp) => comp.id) || [];
    const components = await this.getMany(ids);
    const allFlattened = components.map((component) => component.state._consumer.getAllFlattenedDependencies()).flat();
    const allFlattenedUniq = ComponentIdList.uniqFromArray(allFlattened);
    await this.legacyScope.scopeImporter.importWithoutDeps(allFlattenedUniq, {
      cache: true,
      reason: `which are unique flattened dependencies to get the graph of ${ids.length} ids`,
    });
    const dependencies = await this.getMany(allFlattenedUniq);
    const allComponents: Component[] = [...components, ...dependencies];

    // build the graph
    const graph = new Graph<Component, string>();
    allComponents.forEach((comp) => graph.setNode(new Node(comp.id.toString(), comp)));
    await Promise.all(
      allComponents.map(async (comp) => {
        const deps = await this.dependencyResolver.getComponentDependencies(comp);
        deps.forEach((dep) => {
          const depCompId = dep.componentId;
          if (!graph.hasNode(depCompId.toString())) {
            throw new Error(`scope.getGraph: missing node of ${depCompId.toString()}`);
          }
          graph.setEdge(new Edge(comp.id.toString(), depCompId.toString(), dep.lifecycle));
        });
      })
    );
    return graph;
  }

  async getGraphIds(ids?: ComponentID[]): Promise<CompIdGraph> {
    if (!ids || !ids.length) ids = (await this.list()).map((comp) => comp.id) || [];
    const components = await this.getMany(ids);
    const graph = new Graph<ComponentID, DepEdgeType>();
    const componentsWithoutSavedGraph: Component[] = [];

    // try to add from saved graph
    await Promise.all(
      components.map(async (component) => {
        const compGraph = await this.getSavedGraphOfComponentIfExist(component);
        if (!compGraph) {
          componentsWithoutSavedGraph.push(component);
          return;
        }
        graph.merge([compGraph]);
      })
    );
    if (!componentsWithoutSavedGraph.length) {
      return graph;
    }

    // there are components that don't have the graph saved, create the graph by using Version objects of all flattened
    const lane = await this.legacyScope.getCurrentLaneObject();
    await this.import(
      componentsWithoutSavedGraph.map((c) => c.id),
      { reFetchUnBuiltVersion: false, lane, reason: `to build graph-ids from the scope` }
    );

    const allFlattened: ComponentID[] = componentsWithoutSavedGraph
      .map((component) => component.state._consumer.getAllFlattenedDependencies())
      .flat();
    const allFlattenedUniq = ComponentIdList.uniqFromArray(allFlattened.concat(ids));

    const addEdges = (compId: ComponentID, dependencies: ConsumerComponent['dependencies'], label: DepEdgeType) => {
      dependencies.get().forEach((dep) => {
        const depId = dep.id;
        graph.setNode(new Node(depId.toString(), depId));
        graph.setEdge(new Edge(compId.toString(), depId.toString(), label));
      });
    };
    const componentsAndVersions = await this.legacyScope.getComponentsAndVersions(allFlattenedUniq);
    componentsAndVersions.forEach(({ component, version, versionStr }) => {
      const compId = component.toComponentId().changeVersion(versionStr);
      graph.setNode(new Node(compId.toString(), compId));
      addEdges(compId, version.dependencies, 'prod');
      addEdges(compId, version.devDependencies, 'dev');
      addEdges(compId, version.extensionDependencies, 'ext');
    });

    return graph;
  }

  async getFlattenedEdges(id: ComponentID): Promise<DepEdge[] | undefined> {
    let versionObj: Version;
    try {
      versionObj = await this.legacyScope.getVersionInstance(id);
    } catch {
      return undefined;
    }

    const flattenedEdges = await versionObj.getFlattenedEdges(this.legacyScope.objects);
    return flattenedEdges;
  }

  private async getSavedGraphOfComponentIfExist(component: Component): Promise<Graph<ComponentID, DepEdgeType> | null> {
    const consumerComponent = component.state._consumer as ConsumerComponent;
    const flattenedEdges = await this.getFlattenedEdges(component.id);
    if (!flattenedEdges)
      throw new Error(
        'getSavedGraphOfComponentIfExist failed to get flattenedEdges, it must not be undefined because the version object exists'
      );
    if (!flattenedEdges.length && consumerComponent.flattenedDependencies.length) {
      // there are flattenedDependencies, so must be edges, if they're empty, it's because the component was tagged
      // with a version < ~0.0.901, so this flattenedEdges wasn't exist.
      return null;
    }
    const edges = flattenedEdges.map((edge) => ({
      ...edge,
      source: edge.source,
      target: edge.target,
    }));
    const nodes = consumerComponent.flattenedDependencies;

    const graph = new Graph<ComponentID, DepEdgeType>();
    graph.setNode(new Node(component.id.toString(), component.id));
    nodes.forEach((node) => graph.setNode(new Node(node.toString(), node)));
    edges.forEach((edge) => graph.setEdge(new Edge(edge.source.toString(), edge.target.toString(), edge.type)));
    return graph;
  }

  /**
   * import components into the scope.
   */
  async import(
    ids: ComponentID[],
    {
      useCache = true,
      reFetchUnBuiltVersion = true,
      preferDependencyGraph = true,
      includeUpdateDependents = false,
      lane,
      reason,
    }: {
      /**
       * if the component exists locally, don't go to the server to search for updates.
       */
      useCache?: boolean;
      /**
       * if the Version objects exists locally, but its `buildStatus` is Pending or Failed, reach the remote to find
       * whether the version was already built there.
       */
      reFetchUnBuiltVersion?: boolean;
      /**
       * if the component is on a lane, provide the lane object. the component will be fetched from the lane-scope and
       * not from the component-scope.
       */
      lane?: Lane;
      /**
       * if an external is missing and the remote has it with the dependency graph, don't fetch all its dependencies
       */
      preferDependencyGraph?: boolean;
      /**
       * include the updateDependents components on a lane (generally, on a workspace, it's not needed)
       */
      includeUpdateDependents?: boolean;
      /**
       * reason why this import is needed (to show in the terminal)
       */
      reason?: string;
    } = {}
  ): Promise<void> {
    const withoutOwnScopeAndLocals = ids.filter((id) => {
      return id.scope !== this.name && id._legacy.hasScope();
    });
    await this.legacyScope.scopeImporter.importMany({
      ids: ComponentIdList.fromArray(withoutOwnScopeAndLocals),
      cache: useCache,
      throwForDependencyNotFound: false,
      reFetchUnBuiltVersion,
      lane,
      preferDependencyGraph,
      includeUpdateDependents,
      reason,
    });
  }

  async get(id: ComponentID, useCache = true, importIfMissing = true): Promise<Component | undefined> {
    return this.componentLoader.get(id, importIfMissing, useCache);
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    return this.componentLoader.getFromConsumerComponent(consumerComponent);
  }

  /**
   * get a component from a remote without importing it
   * by default, when on a lane, it loads the component from the lane. unless `fromMain` is set to true.
   */
  async getRemoteComponent(id: ComponentID, fromMain = false): Promise<Component> {
    return this.componentLoader.getRemoteComponent(id, fromMain);
  }

  /**
   * get a component from a remote without importing it
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<Component[]> {
    return this.componentLoader.getManyRemoteComponents(ids);
  }

  /**
   * list all components in the scope.
   */
  async list(
    filter?: { offset: number; limit: number; namespaces?: string[] },
    includeCache = false,
    includeFromLanes = false,
    includeDeleted = false
  ): Promise<Component[]> {
    const patternsWithScope =
      (filter?.namespaces && filter?.namespaces.map((pattern) => `**/${pattern || '**'}`)) || undefined;
    const componentsIds = await this.listIds(includeCache, includeFromLanes, patternsWithScope);

    const comps = await this.getMany(
      filter && filter.limit ? slice(componentsIds, filter.offset, filter.offset + filter.limit) : componentsIds
    );

    return includeDeleted ? comps : comps.filter((comp) => !comp.isDeleted());
  }

  /**
   * for now, list of invalid components are mostly useful for the workspace.
   * in the future, this can return components that failed to load in the scope due to objects file
   * corruption or similar issues.
   */
  async listInvalid() {
    return [];
  }

  /**
   * get ids of all scope components.
   * @param includeCache whether or not include components that their scope-name is different than the current scope-name
   */
  async listIds(includeCache = false, includeFromLanes = false, patterns?: string[]): Promise<ComponentID[]> {
    const localScopeOnly = !includeCache;
    const allModelComponents = await this.legacyScope.list(localScopeOnly);
    const filterByCacheAndLanes = (modelComponent: ModelComponent) => {
      const lanesFilter = includeFromLanes ? true : modelComponent.hasHead();
      return lanesFilter;
    };
    const modelComponentsToList = allModelComponents.filter(filterByCacheAndLanes);
    let ids = modelComponentsToList.map((component) => component.toComponentIdWithLatestVersion());
    if (patterns && patterns.length > 0) {
      ids = ids.filter((id) =>
        patterns?.some((pattern) => isMatchNamespacePatternItem(id.toStringWithoutVersion(), pattern).match)
      );
    }
    this.logger.debug(`scope listIds: total ${ids.length} components after filter scope`);
    return ids;
  }

  /**
   * Check if a specific id exist in the scope
   * @param componentId
   */
  async hasId(componentId: ComponentID, includeCache = false): Promise<boolean> {
    if (!includeCache && componentId.scope !== this.name) return false;
    const opts = {
      includeVersion: true,
    };

    return this.legacyScope.hasId(componentId, opts);
  }

  async hasIdNested(componentId: ComponentID, includeCache = false): Promise<boolean> {
    return this.hasId(componentId, includeCache);
  }

  /**
   * determine whether a component exists in the scope.
   */
  exists(modelComponent: ModelComponent) {
    return modelComponent.scope === this.name;
  }

  async getMany(ids: ComponentID[], throwIfNotExist = false): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const componentsP = mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      return throwIfNotExist ? this.getOrThrow(id) : this.get(id);
    });
    const components = await componentsP;
    return compact(components);
  }

  /**
   * important! you probably want to use `getMany`, which returns the components from the scope.
   * this method loads all aspects of the loaded components. (which hurts performance)
   */
  async loadMany(
    ids: ComponentID[],
    lane?: Lane,
    opts: LoadOptions = { loadApps: true, loadEnvs: true, loadCompAspects: true, loadCustomEnvs: false }
  ): Promise<Component[]> {
    const components = await mapSeries(ids, (id) => this.load(id, lane, opts));
    return compact(components);
  }

  async loadManyCompsAspects(components: Component[], lane?: Lane): Promise<Component[]> {
    const loadedComponents = await mapSeries(components, (id) => this.loadCompAspects(id, lane));
    return compact(loadedComponents);
  }

  /**
   * get a component and throw an exception if not found.
   * @param id component id
   */
  async getOrThrow(id: ComponentID): Promise<Component> {
    const component = await this.get(id);
    if (!component) throw new ComponentNotFound(id);
    return component;
  }

  /**
   * returns a specific state of a component.
   * @param id component ID.
   * @param hash state hash.
   */
  async getState(id: ComponentID, hash: string): Promise<State> {
    return this.componentLoader.getState(id, hash);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    const modelComponent = await this.legacyScope.getModelComponent(id);
    const ref = modelComponent.getRef(hash);
    if (!ref) throw new Error(`ref was not found: ${id.toString()} with tag ${hash}`);
    return this.componentLoader.getSnap(id, ref.toString());
  }

  /**
   * get component log sorted by the timestamp in ascending order (from the earliest to the latest)
   */
  async getLogs(
    id: ComponentID,
    shortHash = false,
    startsFrom?: string,
    throwIfMissing = false
  ): Promise<ComponentLog[]> {
    return this.legacyScope.loadComponentLogs(id, shortHash, startsFrom, throwIfMissing);
  }

  async getStagedConfig() {
    const currentLaneId = this.legacyScope.getCurrentLaneId();
    return StagedConfig.load(this.path, this.logger, currentLaneId);
  }

  /**
   * whether a component is soft-removed.
   * the version is required as it can be removed on a lane. in which case, the version is the head in the lane.
   */
  async isComponentRemoved(id: ComponentID): Promise<boolean> {
    const version = id.version;
    if (!version) throw new Error(`isComponentRemoved expect to get version, got ${id.toString()}`);
    const modelComponent = await this.legacyScope.getModelComponent(id);
    const versionObj = await modelComponent.loadVersion(version, this.legacyScope.objects);
    return versionObj.isRemoved();
  }

  /**
   * whether the id with the specified version exits in the local scope.
   */
  async isComponentInScope(id: ComponentID): Promise<boolean> {
    return this.legacyScope.isComponentInScope(id);
  }

  /**
   * resolve a component ID.
   * @param id component ID.
   */
  async resolveComponentId(id: string | BitId | ComponentID): Promise<ComponentID> {
    if (id instanceof ComponentID) return id;
    if (id instanceof BitId) return this.resolveComponentIdFromBitId(id);
    const idStr = id.toString();

    if (isLikelyPackageName(idStr)) {
      return resolveComponentIdFromPackageName(idStr, this.dependencyResolver);
    }

    const component = await this.legacyScope.loadModelComponentByIdStr(idStr);
    const getIdToCheck = () => {
      if (component) return idStr; // component exists in the scope with the scope-name.
      if (idStr.startsWith(`${this.name}/`)) {
        // component with the full name doesn't exist in the scope, it might be locally tagged
        return idStr.replace(`${this.name}/`, '');
      }
      return idStr;
    };
    const IdToCheck = getIdToCheck();
    const legacyId = await this.legacyScope.getParsedId(IdToCheck);
    return legacyId;
  }

  private resolveComponentIdFromBitId(id: BitId) {
    return id.hasScope() ? ComponentID.fromLegacy(id) : ComponentID.fromLegacy(id, this.name);
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | ComponentID>) {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  /**
   * @deprecated use `this.idsByPattern` instead for consistency, which supports also negation and list of patterns.
   */
  async byPattern(patterns: string[], scope = '**'): Promise<Component[]> {
    const patternsWithScope = patterns.map((pattern) => `${scope}/${pattern || '**'}`);

    const ids = await this.listIds(true, false, patternsWithScope);

    const components = await this.getMany(ids);
    return components;
  }

  /**
   * get component-ids matching the given pattern. a pattern can have multiple patterns separated by a comma.
   * it uses multimatch (https://www.npmjs.com/package/multimatch) package for the matching algorithm, which supports
   * (among others) negate character "!" to exclude ids. See the package page for more supported characters.
   */
  async idsByPattern(pattern: string, throwForNoMatch = true): Promise<ComponentID[]> {
    if (!pattern.includes('*') && !pattern.includes(',')) {
      // if it's not a pattern but just id, resolve it without multimatch to support specifying id without scope-name
      const id = await this.resolveComponentId(pattern);
      const exists = await this.hasId(id, true);
      if (exists) return [id];
      if (throwForNoMatch) throw new BitError(`unable to find "${pattern}" in the scope`);
      return [];
    }
    const ids = await this.listIds(true);
    return this.filterIdsFromPoolIdsByPattern(pattern, ids, throwForNoMatch);
  }

  // todo: move this to somewhere else (where?)
  async filterIdsFromPoolIdsByPattern(
    pattern: string,
    ids: ComponentID[],
    throwForNoMatch = true,
    filterByStateFunc?: (state: any, poolIds: ComponentID[]) => Promise<ComponentID[]>
  ) {
    const patterns = pattern.split(',').map((p) => p.trim());

    if (patterns.every((p) => p.startsWith('!'))) {
      // otherwise it'll never match anything. don't use ".push()". it must be the first item in the array.
      patterns.unshift('**');
    }
    // check also as legacyId.toString, as it doesn't have the defaultScope
    const idsToCheck = (id: ComponentID) => [id._legacy.toStringWithoutVersion(), id.toStringWithoutVersion()];
    const [statePatterns, nonStatePatterns] = partition(patterns, (p) => p.startsWith('$') || p.includes(' AND '));
    const nonStatePatternsNoVer = nonStatePatterns.map((p) => p.split('@')[0]); // no need for the version
    const idsFiltered = nonStatePatternsNoVer.length
      ? ids.filter((id) => multimatch(idsToCheck(id), nonStatePatternsNoVer).length)
      : [];

    const idsStateFiltered = await mapSeries(statePatterns, async (statePattern) => {
      if (!filterByStateFunc) {
        throw new Error(`filter by a state (${statePattern}) is currently supported on the workspace only`);
      }
      if (statePattern.includes(' AND ')) {
        let filteredByAnd: ComponentID[] = ids;
        const patternSplit = statePattern.split(' AND ').map((p) => p.trim());
        for await (const onePattern of patternSplit) {
          filteredByAnd = onePattern.startsWith('$')
            ? await filterByStateFunc(onePattern.replace('$', ''), filteredByAnd)
            : filteredByAnd.filter((id) => multimatch(idsToCheck(id), [onePattern.split('@')[0]]).length);
        }
        return filteredByAnd;
      }
      return filterByStateFunc(statePattern.replace('$', ''), ids);
    });
    const idsStateFilteredFlat = idsStateFiltered.flat();
    const combineFilteredIds = () => {
      if (!idsStateFiltered) return idsFiltered;
      const allIds = [...idsFiltered, ...idsStateFilteredFlat];
      return ComponentIdList.uniqFromArray(allIds);
    };
    const allIdsFiltered = combineFilteredIds();
    if (throwForNoMatch && !allIdsFiltered.length) {
      throw new NoIdMatchPattern(pattern);
    }
    return allIdsFiltered;
  }

  async getSnapDistance(id: ComponentID, throws = true, workspaceId?: ComponentID): Promise<SnapsDistance> {
    const modelComp = await this.legacyScope.getModelComponent(id);
    await modelComp.setDivergeData(this.legacyScope.objects, throws, undefined, workspaceId);
    return modelComp.getDivergeData();
  }
  /**
   * get the distance for a component between two lanes. for example, lane-b forked from lane-a and lane-b added some new snaps
   * @param componentId
   * @param sourceHead head on the source lane. leave empty if the source is main
   * @param targetHead head on the target lane. leave empty if the target is main
   * @returns
   */
  async getSnapsDistanceBetweenTwoSnaps(
    componentId: ComponentID,
    sourceHead?: string,
    targetHead?: string,
    throws?: boolean
  ): Promise<SnapsDistance> {
    if (!sourceHead && !targetHead) {
      throw new Error(`getDivergeData got sourceHead and targetHead empty. at least one of them should be populated`);
    }
    const modelComponent = await this.legacyScope.getModelComponent(componentId);
    return getDivergeData({
      modelComponent,
      repo: this.legacyScope.objects,
      sourceHead: sourceHead ? Ref.from(sourceHead) : modelComponent.head || null,
      targetHead: targetHead ? Ref.from(targetHead) : modelComponent.head || null,
      throws,
    });
  }

  async getExactVersionBySemverRange(id: ComponentID, range: string): Promise<string | undefined> {
    const modelComponent = await this.legacyScope.getModelComponent(id);
    const versions = modelComponent.listVersions();
    return semver.maxSatisfying<string>(versions, range, { includePrerelease: true })?.toString();
  }

  /**
   * @deprecated use `this.resolveComponentId` instead.
   */
  async resolveId(id: string): Promise<ComponentID> {
    return this.resolveComponentId(id);
  }

  /**
   * @deprecated use `this.getRemoteScopes()` instead.
   */
  async _legacyRemotes(): Promise<Remotes> {
    return getScopeRemotes(this.legacyScope);
  }
  async getRemoteScopes(): Promise<Remotes> {
    return getScopeRemotes(this.legacyScope);
  }

  /**
   * list all component ids from a remote-scope
   */
  async listRemoteScope(scopeName: string): Promise<ComponentID[]> {
    const remotes = await this.getRemoteScopes();
    const remote = await remotes.resolve(scopeName);
    const results = await remote.list();
    return results.map(({ id }) => id);
  }

  async getLegacyMinimal(id: ComponentID): Promise<ConsumerComponent | undefined> {
    try {
      return await this.legacyScope.getConsumerComponent(id);
    } catch {
      // in case the component is missing locally, this.get imports it.
      return (await this.get(id))?.state._consumer;
    }
  }

  /**
   * ModelComponent is of type `BitObject` which gets saved into the local scope as an object file.
   * It has data about the tags and the component head. It doesn't have any data about the source-files/artifacts etc.
   */
  async getBitObjectModelComponent(id: ComponentID, throwIfNotExist = false): Promise<ModelComponent | undefined> {
    return throwIfNotExist ? this.legacyScope.getModelComponent(id) : this.legacyScope.getModelComponentIfExist(id);
  }

  /**
   * Version BitObject holds the data of the source files and build artifacts of a specific snap/tag.
   */
  async getBitObjectVersion(
    modelComponent: ModelComponent,
    version: string,
    throwIfNotExist = false
  ): Promise<Version | undefined> {
    return modelComponent.loadVersion(version, this.legacyScope.objects, throwIfNotExist);
  }

  async getBitObjectVersionById(id: ComponentID, throwIfNotExist = false): Promise<Version | undefined> {
    const modelComponent = await this.getBitObjectModelComponent(id, throwIfNotExist);
    if (!modelComponent) return undefined;
    return this.getBitObjectVersion(modelComponent, id.version, throwIfNotExist);
  }

  /**
   * get a component and load its aspect
   */
  async load(
    id: ComponentID,
    lane?: Lane,
    opts: LoadOptions = { loadApps: true, loadEnvs: true, loadCompAspects: true, loadCustomEnvs: false }
  ): Promise<Component | undefined> {
    const component = await this.get(id);
    if (!component) return undefined;
    const optsWithDefaults = { loadApps: true, loadEnvs: true, loadCompAspects: true, ...opts };
    return this.loadCompAspects(component, lane, optsWithDefaults);
  }

  async loadCompAspects(
    component: Component,
    lane?: Lane,
    opts: LoadOptions = { loadApps: true, loadEnvs: true, loadCompAspects: true, loadCustomEnvs: false }
  ): Promise<Component> {
    const optsWithDefaults = { loadApps: true, loadEnvs: true, loadCompAspects: true, ...opts };
    const aspectIds = optsWithDefaults.loadCompAspects ? component.state.aspects.ids : [];
    // load components from type aspects as aspects.
    // important! previously, this was running for any aspect, not only apps. (the if statement was `this.aspectLoader.isAspectComponent(component)`)
    // Ran suggests changing it and if it breaks something, we'll document is and fix it.
    if (optsWithDefaults.loadApps) {
      const appData = component.state.aspects.get('teambit.harmony/application');
      if (appData?.data?.appName) {
        aspectIds.push(component.id.toString());
      }
    }
    if (optsWithDefaults.loadEnvs) {
      const envsData = component.state.aspects.get(EnvsAspect.id);
      if (envsData?.data?.services || envsData?.data?.self || envsData?.data?.type === 'env') {
        aspectIds.push(component.id.toString());
      }
    }
    if (aspectIds && aspectIds.length) {
      await this.loadAspects(aspectIds, true, component.id.toString(), lane, {
        loadCustomEnvs: optsWithDefaults.loadCustomEnvs,
      });
    }

    return component;
  }

  async loadComponentsAspect(component: Component) {
    const aspectIds = component.state.aspects.ids;
    await this.loadAspects(aspectIds, true, component.id.toString());
  }

  public async createAspectListFromExtensionDataList(extensionDataList: ExtensionDataList) {
    const entries = await Promise.all(extensionDataList.map((entry) => this.extensionDataEntryToAspectEntry(entry)));
    return this.componentExtension.createAspectListFromEntries(entries);
  }

  private async extensionDataEntryToAspectEntry(dataEntry: ExtensionDataEntry): Promise<AspectEntry> {
    return new AspectEntry(await this.resolveComponentId(dataEntry.id), dataEntry);
  }

  getLastMergedPath() {
    return path.join(this.path, 'last-merged');
  }

  getConfigStore(): Store {
    return {
      list: () => this.legacyScope.scopeJson.config || {},
      set: (key: string, value: string) => {
        this.legacyScope.scopeJson.setConfig(key, value);
      },
      del: (key: string) => {
        this.legacyScope.scopeJson.rmConfig(key);
      },
      write: async () => {
        await this.legacyScope.scopeJson.writeIfChanged();
      },
      invalidateCache: async () => {
        await this.legacyScope.reloadScopeJson();
      },
      getPath: () => this.legacyScope.scopeJson.scopeJsonPath,
    };
  }

  async isModified(): Promise<boolean> {
    return false;
  }

  async write() {
    // no-op (it's relevant for the workspace only)
  }

  async hasObjects(hashes: string[]): Promise<string[]> {
    const refs = hashes.map((h) => Ref.from(h));
    const results = await this.legacyScope.objects.hasMultiple(refs);
    return results.map((r) => r.hash);
  }

  /**
   * declare the slots of scope extension.
   */
  static slots = [
    Slot.withType<OnPostPut>(),
    Slot.withType<OnPostDelete>(),
    Slot.withType<OnPostExport>(),
    Slot.withType<OnPostObjectsPersist>(),
    Slot.withType<OnPreFetchObjects>(),
    Slot.withType<OnCompAspectReCalc>(),
  ];
  static runtime = MainRuntime;

  static dependencies = [
    ComponentAspect,
    UIAspect,
    GraphqlAspect,
    CLIAspect,
    IsolatorAspect,
    AspectLoaderAspect,
    ExpressAspect,
    LoggerAspect,
    EnvsAspect,
    DependencyResolverAspect,
    ConfigStoreAspect,
  ];

  static defaultConfig: ScopeConfig = {
    httpTimeOut: 600000,
  };

  static async provider(
    [componentExt, ui, graphql, cli, isolator, aspectLoader, express, loggerMain, envs, depsResolver, configStore]: [
      ComponentMain,
      UiMain,
      GraphqlMain,
      CLIMain,
      IsolatorMain,
      AspectLoaderMain,
      ExpressMain,
      LoggerMain,
      EnvsMain,
      DependencyResolverMain,
      ConfigStoreMain,
    ],
    config: ScopeConfig,
    [
      postPutSlot,
      postDeleteSlot,
      postExportSlot,
      postObjectsPersistSlot,
      preFetchObjectsSlot,
      OnCompAspectReCalcSlot,
    ]: [
      OnPostPutSlot,
      OnPostDeleteSlot,
      OnPostExportSlot,
      OnPostObjectsPersistSlot,
      OnPreFetchObjectsSlot,
      OnCompAspectReCalcSlot,
    ],
    harmony: Harmony
  ) {
    const bitConfig: any = harmony.config.get('teambit.harmony/bit');
    const debugCommands = [new CatScopeCmd(), new CatComponentCmd(), new CatObjectCmd(), new CatLaneCmd()];
    const allCommands = [new ScopeCmd(), ...debugCommands, new RunActionCmd()];
    const legacyScope = await loadScopeIfExist(bitConfig?.cwd);
    if (!legacyScope) {
      cli.register(...allCommands);
      return undefined;
    }

    const logger = loggerMain.createLogger(ScopeAspect.id);
    const scope = new ScopeMain(
      harmony,
      legacyScope,
      componentExt,
      config,
      postPutSlot,
      postDeleteSlot,
      postExportSlot,
      postObjectsPersistSlot,
      preFetchObjectsSlot,
      OnCompAspectReCalcSlot,
      isolator,
      aspectLoader,
      logger,
      envs,
      depsResolver,
      configStore
    );
    configStore.addStore('scope', scope.getConfigStore());
    cli.register(...allCommands);
    cli.registerOnStart(async (hasWorkspace: boolean) => {
      if (hasWorkspace) return;
      await scope.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions(), undefined, 'scope.cli.registerOnStart');
    });

    const onPutHook = async (ids: string[], lanes: Lane[], authData?: AuthData): Promise<void> => {
      logger.debug(`onPutHook, started. (${ids.length} components)`);
      scope.componentLoader.clearCache();
      const componentIds = await scope.resolveMultipleComponentIds(ids);
      const fns = postPutSlot.values();
      const data = {
        ids: componentIds,
        lanes,
      };
      const metadata = { auth: authData };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPutHook, completed. (${ids.length} components)`);
    };

    const getAuthData = (): AuthData | undefined => {
      const token = Http.getToken();
      return token ? { type: DEFAULT_AUTH_TYPE, credentials: token } : undefined;
    };

    const onPostExportHook = async (ids: ComponentID[], lanes: Lane[]): Promise<void> => {
      logger.debug(`onPostExportHook, started. (${ids.length} components)`);
      const fns = postExportSlot.values();
      const data = {
        ids,
        lanes,
      };
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPostExportHook, completed. (${ids.length} components)`);
    };

    const onPostObjectsPersistHook = async (): Promise<void> => {
      logger.debug(`onPostObjectsPersistHook, started`);
      const fns = postObjectsPersistSlot.values();
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(undefined, metadata)));
      logger.debug(`onPostObjectsPersistHook, completed`);
    };

    ExportPersist.onPutHook = onPutHook;
    PostSign.onPutHook = onPutHook;
    Scope.onPostExport = onPostExportHook;
    Repository.onPostObjectsPersist = onPostObjectsPersistHook;
    ExternalActions.externalActions.push(new ClearCacheAction(scope));

    express.register([
      new PutRoute(scope, postPutSlot),
      new FetchRoute(scope, logger),
      new ActionRoute(scope),
      new DeleteRoute(scope),
    ]);
    // @ts-ignore - @ran to implement the missing functions and remove it
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(() => scopeSchema(scope));
    componentExt.registerHost(scope);

    return scope;
  }

  public getDependenciesGraphByComponentIds(componentIds: ComponentID[]): Promise<DependenciesGraph | undefined> {
    return this.legacyScope.getDependenciesGraphByComponentIds(componentIds);
  }
}

ScopeAspect.addRuntime(ScopeMain);
