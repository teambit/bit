/**
 * WorkspaceComponentLoader — loads components from the workspace.
 *
 * Public surface:
 *   getMany(ids)        — load many components, with batching and shared phases
 *   get(id)             — load one component
 *   getIfExist(id)      — load one, return undefined on not-found
 *   getInvalid(ids)     — return components that fail to load
 *   clearCache(),
 *   clearComponentCache(id)
 *
 * Internal call shape (getMany):
 *
 *   getMany
 *    ├─ getFromCache (per id)                      [components cache]
 *    └─ getAndLoadSlotOrdered (for cache misses)
 *        ├─ groupAndUpdateIds → classifyIds         [discovery.ts, pure]
 *        ├─ buildLoadGroups
 *        │   ├─ populateScopeAndExtensionsCache    [warms scratch caches]
 *        │   └─ buildLoadPlanGroups                 [load-plan.ts, pure]
 *        │       ├─ groupEnvsByDepLayer             [env-dag-sort.ts, pure]
 *        │       └─ groupExtsByDepLayer             [dep-dag-sort.ts, pure]
 *        └─ getAndLoadSlot (per group, in order)
 *            ├─ getComponentsWithoutLoadExtensions
 *            │   └─ consumer.loadComponents → loadOne
 *            ├─ loadComponentsExtensions           [optional]
 *            ├─ executeLoadSlot                    [onComponentLoad subscribers]
 *            └─ loadCompsAsAspects                 [register as Harmony aspects]
 *
 * Caching: see D-002 in docs/rfcs/component-loading-rewrite/DECISIONS.md.
 * Recursion / load-order: see D-001 in the same file.
 */

import pMap from 'p-map';
import { getLatestVersionNumber } from '@teambit/legacy.utils';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import type { Component, InvalidComponent } from '@teambit/component';
import { ComponentFS, Config, State, TagMap } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import mapSeries from 'p-map-series';
import { compact, fromPairs, pick, uniq, uniqBy } from 'lodash';
import type { ComponentLoadOptions as LegacyComponentLoadOptions } from '@teambit/legacy.consumer-component';
import { ComponentNotFoundInPath, ConsumerComponent, Dependencies } from '@teambit/legacy.consumer-component';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { IssuesClasses } from '@teambit/component-issues';
import { ComponentNotFound } from '@teambit/legacy.scope';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { Logger } from '@teambit/logger';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { getMaxSizeForComponents, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { Workspace } from '../workspace';
import { WorkspaceComponent } from './workspace-component';
import { MergeConfigConflict } from '../exceptions/merge-config-conflict';
import { buildLoadPlanGroups } from './load-plan';
import type { LoadPlanInput } from './load-plan';
import { classifyIds } from './discovery';
import type { DiscoveredIds } from './discovery';

type GetManyRes = {
  components: Component[];
  invalidComponents: InvalidComponent[];
};

export type ComponentLoadOptions = LegacyComponentLoadOptions & {
  loadExtensions?: boolean;
  executeLoadSlot?: boolean;
  idsToNotLoadAsAspects?: string[];
  loadSeedersAsAspects?: boolean;
  resolveExtensionsVersions?: boolean;
};

type LoadGroup = { workspaceIds: ComponentID[]; scopeIds: ComponentID[] } & LoadGroupMetadata;
type LoadGroupMetadata = {
  core?: boolean;
  aspects?: boolean;
  seeders?: boolean;
  envs?: boolean;
};

type GetAndLoadSlotOpts = ComponentLoadOptions & LoadGroupMetadata;

type ComponentGetOneOptions = {
  resolveIdVersion?: boolean;
};

type WorkspaceScopeIdsMap = {
  scopeIds: Map<string, ComponentID>;
  workspaceIds: Map<string, ComponentID>;
};

export type LoadCompAsAspectsOptions = {
  /**
   * In case the component we are loading is app, whether to load it as app (in a scope aspects capsule)
   */
  loadApps?: boolean;
  /**
   * In case the component we are loading is env, whether to load it as env (in a scope aspects capsule)
   */
  loadEnvs?: boolean;

  /**
   * In case the component we are loading is a regular aspect, whether to load it as aspect (in a scope aspects capsule)
   */
  loadAspects?: boolean;

  idsToNotLoadAsAspects?: string[];

  /**
   * Are this core aspects
   */
  core?: boolean;

  /**
   * Are this aspects seeders of the load many operation
   */
  seeders?: boolean;
};

export class WorkspaceComponentLoader {
  // Loader caches — see D-002 in docs/rfcs/component-loading-rewrite/DECISIONS.md
  // for the full invariants. Briefly:
  //
  //   componentsCache             — final loaded Component objects. Key is
  //                                 `${id}:${json(load-opts)}`. Lookup follows
  //                                 the "exact-match-or-fully-loaded" rule
  //                                 (see getFromCache).
  //   scopeComponentsCache        — scratch state for one load operation:
  //                                 the scope-only Component for an id.
  //                                 Read by populateScopeAndExtensionsCache
  //                                 and load-plan.ts via the loader's lookups.
  //   componentsExtensionsCache   — scratch state for one load operation:
  //                                 the merged extensions / envId for an id,
  //                                 produced before the full load runs.
  //   componentLoadedSelfAsAspects — memoization flag (not a value cache):
  //                                 ensures each component is registered as
  //                                 an aspect at most once.
  private componentsCache: InMemoryCache<Component>;
  private scopeComponentsCache: InMemoryCache<Component>;
  private componentsExtensionsCache: InMemoryCache<{
    extensions: ExtensionDataList;
    errors: Error[] | undefined;
    envId: string | undefined;
  }>;
  private componentLoadedSelfAsAspects: InMemoryCache<boolean>;
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain
  ) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.scopeComponentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.componentsExtensionsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.componentLoadedSelfAsAspects = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
  }

  async getMany(ids: Array<ComponentID>, loadOpts?: ComponentLoadOptions, throwOnFailure = true): Promise<GetManyRes> {
    const idsWithoutEmpty = compact(ids);
    if (!idsWithoutEmpty.length) {
      return { components: [], invalidComponents: [] };
    }
    const callId = Math.floor(Math.random() * 1000); // generate a random callId to be able to identify the call from the logs
    this.logger.profileTrace(`getMany-${callId}`);
    this.logger.setStatusLine(`loading ${ids.length} component(s)`);
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      // We don't want to load extension or execute the load slot at this step
      // we will do it later
      // this important for better performance
      // We don't want to resolveExtensionsVersions as with get many we call aspect merger merge before update dependencies
      // so we will have the correct versions for extensions already and update them after will resolve wrong versions
      // in some cases
      { loadExtensions: false, executeLoadSlot: false, loadSeedersAsAspects: true, resolveExtensionsVersions: false },
      loadOpts || {}
    );

    const loadOrCached: { idsToLoad: ComponentID[]; fromCache: Component[] } = { idsToLoad: [], fromCache: [] };
    idsWithoutEmpty.forEach((id) => {
      const componentFromCache = this.getFromCache(id, loadOptsWithDefaults);
      if (componentFromCache) {
        loadOrCached.fromCache.push(componentFromCache);
      } else {
        loadOrCached.idsToLoad.push(id);
      }
    }, loadOrCached);

    const { components: loadedComponents, invalidComponents } = await this.getAndLoadSlotOrdered(
      loadOrCached.idsToLoad || [],
      loadOptsWithDefaults,
      callId
    );

    invalidComponents.forEach(({ err }) => {
      if (throwOnFailure) throw err;
    });

    const components = uniqBy([...loadedComponents, ...loadOrCached.fromCache], (comp) => {
      return comp.id.toString();
    });

    // Save under the "fully loaded" key even though loadOptsWithDefaults may have
    // had loadExtensions/executeLoadSlot set to false. By this point in getMany
    // the slot has fired (executeLoadSlot runs unconditionally inside getAndLoadSlot)
    // and extensions were loaded when requested, so the post-load shape is
    // fully-loaded. See D-002 for why the key tracks post-load state.
    components.forEach((comp) => {
      this.saveInCache(comp, { loadExtensions: true, executeLoadSlot: true });
    });
    const idsWithEmptyStrs = ids.map((id) => id.toString());
    const requestedComponents = components.filter(
      (comp) =>
        idsWithEmptyStrs.includes(comp.id.toString()) || idsWithEmptyStrs.includes(comp.id.toStringWithoutVersion())
    );
    this.logger.profileTrace(`getMany-${callId}`);
    this.logger.clearStatusLine();
    return { components: requestedComponents, invalidComponents };
  }

  private async getAndLoadSlotOrdered(
    ids: ComponentID[],
    loadOpts: ComponentLoadOptions,
    callId = 0
  ): Promise<GetManyRes> {
    if (!ids?.length) return { components: [], invalidComponents: [] };

    const workspaceScopeIdsMap: WorkspaceScopeIdsMap = await this.groupAndUpdateIds(ids);
    this.logger.profileTrace('buildLoadGroups');
    const groupsToHandle = await this.buildLoadGroups(workspaceScopeIdsMap);
    this.logger.profileTrace('buildLoadGroups');
    // prefix your command with "BIT_LOG=*" to see the detailed groups
    if (process.env.BIT_LOG) {
      printGroupsToHandle(groupsToHandle, this.logger);
    }
    const groupsRes = compact(
      await mapSeries(groupsToHandle, async (group, index) => {
        const { scopeIds, workspaceIds, aspects, core, seeders, envs } = group;
        const groupDesc = `getMany-${callId} group ${index + 1}/${groupsToHandle.length} - ${loadGroupToStr(group)}`;
        this.logger.profileTrace(groupDesc);
        if (!workspaceIds.length && !scopeIds.length) {
          throw new Error('getAndLoadSlotOrdered - group has no ids to load');
        }
        const res = await this.getAndLoadSlot(workspaceIds, scopeIds, { ...loadOpts, core, seeders, aspects, envs });
        this.logger.profileTrace(groupDesc);
        // We don't want to return components that were not asked originally (we do want to load them)
        if (!group.seeders) return undefined;
        return res;
      })
    );
    const finalRes = groupsRes.reduce(
      (acc, curr) => {
        return {
          components: [...acc.components, ...curr.components],
          invalidComponents: [...acc.invalidComponents, ...curr.invalidComponents],
        };
      },
      { components: [], invalidComponents: [] }
    );
    return finalRes;
  }

  private async buildLoadGroups(workspaceScopeIdsMap: WorkspaceScopeIdsMap): Promise<Array<LoadGroup>> {
    const wsIds = Array.from(workspaceScopeIdsMap.workspaceIds.values());
    const scopeIds = Array.from(workspaceScopeIdsMap.scopeIds.values());

    // Phase 1 (side-effecting): warm the extensions cache for everything that needs to
    // factor into the plan. This is iterative — we have to populate non-core-envs first
    // to discover what extension components they reference, then populate those too.
    const allIds = [...wsIds, ...scopeIds];
    const nonCoreEnvs = allIds.filter((id) => !this.envs.isCoreEnv(id.toStringWithoutVersion()));
    await this.populateScopeAndExtensionsCache(nonCoreEnvs, workspaceScopeIdsMap);

    const allExtIds = new Map<string, ComponentID>();
    for (const id of nonCoreEnvs) {
      const fromCache = this.componentsExtensionsCache.get(id.toString());
      if (!fromCache?.extensions) continue;
      for (const ext of fromCache.extensions) {
        if (!allExtIds.has(ext.stringId) && ext.newExtensionId) {
          allExtIds.set(ext.stringId, ext.newExtensionId);
        }
      }
    }
    await this.populateScopeAndExtensionsCache(Array.from(allExtIds.values()), workspaceScopeIdsMap);

    // Phase 2 (pure): build the canonical group structure using cached state.
    const planInput: LoadPlanInput = {
      workspaceIds: wsIds,
      scopeIds,
      isCoreEnv: (id) => this.envs.isCoreEnv(id.toStringWithoutVersion()),
      extensionsOf: (id) => {
        const fromCache = this.componentsExtensionsCache.get(id.toString());
        if (!fromCache?.extensions) return [];
        return Array.from(fromCache.extensions).map((ext) => ({
          stringId: ext.stringId,
          newExtensionId: ext.newExtensionId,
        }));
      },
      envIdOf: (id) => this.componentsExtensionsCache.get(id.toString())?.envId,
    };
    const { groups: rawGroups, extraExtensionIds } = buildLoadPlanGroups(planInput);

    // Phase 3 (side-effecting): register extension comp ids that weren't in the input,
    // then split each group's ids by ws/scope using the up-to-date map.
    await this.groupAndUpdateIds(extraExtensionIds, workspaceScopeIdsMap);
    return rawGroups.map((group) => {
      const wsIdsInGroup: ComponentID[] = [];
      const scopeIdsInGroup: ComponentID[] = [];
      for (const id of group.ids) {
        if (workspaceScopeIdsMap.workspaceIds.has(id.toString())) wsIdsInGroup.push(id);
        else scopeIdsInGroup.push(id);
      }
      return {
        workspaceIds: wsIdsInGroup,
        scopeIds: scopeIdsInGroup,
        core: group.core,
        aspects: group.aspects,
        seeders: group.seeders,
        envs: group.envs,
      };
    });
  }

  private async getAndLoadSlot(
    workspaceIds: ComponentID[],
    scopeIds: ComponentID[],
    loadOpts: GetAndLoadSlotOpts
  ): Promise<GetManyRes> {
    const { workspaceComponents, scopeComponents, invalidComponents } = await this.getComponentsWithoutLoadExtensions(
      workspaceIds,
      scopeIds,
      loadOpts
    );

    // If we are here it means we are on workspace, in that case we don't want to load
    // aspects of scope components as aspects only aspects of workspace components
    // const components = workspaceComponents.concat(scopeComponents);
    const allExtensions: ExtensionDataList[] = workspaceComponents.map((component) => {
      return component.state._consumer.extensions;
    });

    // Ensure we won't load the same extension many times
    // We don't want to ignore version here, as we do want to load different extensions with same id but different versions here
    const mergedExtensions = ExtensionDataList.mergeConfigs(allExtensions, false);
    const filteredMergeExtensions = mergedExtensions.filter((ext) => {
      return !loadOpts.idsToNotLoadAsAspects?.includes(ext.stringId);
    });
    if (loadOpts.loadExtensions) {
      this.logger.profileTrace('loadComponentsExtensions');
      await this.workspace.loadComponentsExtensions(filteredMergeExtensions);
      this.logger.profileTrace('loadComponentsExtensions');
    }
    let wsComponentsWithAspects = workspaceComponents;
    // if (loadOpts.seeders) {
    this.logger.profileTrace('executeLoadSlot');
    wsComponentsWithAspects = await pMapPool(workspaceComponents, (component) => this.executeLoadSlot(component), {
      concurrency: concurrentComponentsLimit(),
    });
    this.logger.profileTrace('executeLoadSlot');
    await this.warnAboutMisconfiguredEnvs(wsComponentsWithAspects);
    // }

    const withAspects = wsComponentsWithAspects.concat(scopeComponents);

    // It's important to load the workspace components as aspects here
    // otherwise the envs from the workspace won't be loaded at time
    // so we will get wrong dependencies from component who uses envs from the workspace
    this.logger.profileTrace('loadCompsAsAspects');
    if (loadOpts.loadSeedersAsAspects || (loadOpts.core && loadOpts.aspects)) {
      await this.loadCompsAsAspects(workspaceComponents.concat(scopeComponents), {
        loadApps: true,
        loadEnvs: true,
        loadAspects: loadOpts.aspects,
        core: loadOpts.core,
        seeders: loadOpts.seeders,
        idsToNotLoadAsAspects: loadOpts.idsToNotLoadAsAspects,
      });
    }
    this.logger.profileTrace('loadCompsAsAspects');

    return { components: withAspects, invalidComponents };
  }

  // TODO: this is similar to scope.main.runtime loadCompAspects func, we should merge them.
  async loadCompsAsAspects(
    components: Component[],
    opts: LoadCompAsAspectsOptions = { loadApps: true, loadEnvs: true, loadAspects: true }
  ): Promise<void> {
    const aspectIds: string[] = [];
    components.forEach((component) => {
      const firstTimeToLoad = this.componentLoadedSelfAsAspects.get(component.id.toString()) === undefined;
      const excluded = opts.idsToNotLoadAsAspects?.includes(component.id.toString());
      const isCore = this.aspectLoader.isCoreAspect(component.id.toStringWithoutVersion());
      const alreadyLoaded = this.aspectLoader.isAspectLoaded(component.id.toString());
      const skipLoading = excluded || isCore || alreadyLoaded || !firstTimeToLoad;

      if (skipLoading) {
        return;
      }
      const idStr = component.id.toString();
      const appData = component.state.aspects.get('teambit.harmony/application');
      if (opts.loadApps && appData?.data?.appName) {
        aspectIds.push(idStr);
        this.componentLoadedSelfAsAspects.set(idStr, true);
      }
      const envsData = component.state.aspects.get(EnvsAspect.id);
      if (opts.loadEnvs && (envsData?.data?.services || envsData?.data?.self || envsData?.data?.type === 'env')) {
        aspectIds.push(idStr);
        this.componentLoadedSelfAsAspects.set(idStr, true);
      }
      if (opts.loadAspects && envsData?.data?.type === 'aspect') {
        aspectIds.push(idStr);
        this.componentLoadedSelfAsAspects.set(idStr, true);
      }
    });
    if (!aspectIds.length) return;

    try {
      await this.workspace.loadAspects(aspectIds, true, 'self loading aspects', { useScopeAspectsCapsule: true });
    } catch (err: any) {
      this.logger.warn(`failed loading components as aspects for components ${aspectIds.join(', ')}`, err);
      // we ignore that errors at the moment
    }
  }

  private async populateScopeAndExtensionsCache(ids: ComponentID[], workspaceScopeIdsMap: WorkspaceScopeIdsMap) {
    return mapSeries(ids, async (id) => {
      const idStr = id.toString();
      let componentFromScope;
      if (!this.scopeComponentsCache.has(idStr)) {
        try {
          // Do not import automatically if it's missing, it will throw an error later
          componentFromScope = await this.workspace.scope.get(id, undefined, false);
          if (componentFromScope) {
            this.scopeComponentsCache.set(idStr, componentFromScope);
          }
          // This is fine here, as it will be handled later in the process
        } catch (err: any) {
          const wsAspectLoader = this.workspace.getWorkspaceAspectsLoader();
          wsAspectLoader.throwWsJsoncAspectNotFoundError(err);
          this.logger.warn(`populateScopeAndExtensionsCache - failed loading component ${idStr} from scope`, err);
        }
      }
      if (!this.componentsExtensionsCache.has(idStr) && workspaceScopeIdsMap.workspaceIds.has(idStr)) {
        componentFromScope = componentFromScope || this.scopeComponentsCache.get(idStr);
        const { extensions, errors, envId } = await this.workspace.componentExtensions(
          id,
          componentFromScope,
          undefined,
          {
            loadExtensions: false,
          }
        );
        this.componentsExtensionsCache.set(idStr, { extensions, errors, envId });
      }
    });
  }

  private async warnAboutMisconfiguredEnvs(components: Component[]) {
    const allIds = uniq(components.map((component) => this.envs.getEnvId(component)));
    return Promise.all(allIds.map((envId) => this.workspace.warnAboutMisconfiguredEnv(envId)));
  }

  private async groupAndUpdateIds(
    ids: ComponentID[],
    existingGroups?: WorkspaceScopeIdsMap
  ): Promise<WorkspaceScopeIdsMap> {
    // Fetch the workspace's id surface once. Under V1 each call into
    // isInWsIncludeDeleted re-fetched locallyDeletedIds() per component; the result
    // is identical for every call within one invocation, so caching here is a behavior-
    // preserving optimization (and makes the inner classifier pure/synchronous).
    const knownWorkspaceIds = this.workspace.listIds().concat(await this.workspace.locallyDeletedIds());
    return classifyIds(
      ids,
      {
        knownWorkspaceIds,
        resolveWorkspaceVersion: (id) => this.resolveVersion(id),
      },
      existingGroups as DiscoveredIds | undefined
    );
  }

  private async isInWsIncludeDeleted(componentId: ComponentID): Promise<boolean> {
    const nonDeletedWsIds = this.workspace.listIds();
    const deletedWsIds = await this.workspace.locallyDeletedIds();
    const allWsIds = nonDeletedWsIds.concat(deletedWsIds);
    const inWs = allWsIds.find((id) => id.isEqual(componentId, { ignoreVersion: !componentId.hasVersion() }));
    return !!inWs;
  }

  private async getComponentsWithoutLoadExtensions(
    workspaceIds: ComponentID[],
    scopeIds: ComponentID[],
    loadOpts: GetAndLoadSlotOpts
  ) {
    const invalidComponents: InvalidComponent[] = [];
    const errors: { id: ComponentID; err: Error }[] = [];
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      // We don't want to load extension or execute the load slot at this step
      // we will do it later
      // this important for better performance
      // We don't want to store deps in fs cache, as at this point extensions are not loaded yet
      // so it might save a wrong deps into the cache
      { loadExtensions: false, executeLoadSlot: false },
      loadOpts || {}
    );

    const idsIndex = {};

    workspaceIds.forEach((id) => {
      idsIndex[id.toString()] = id;
    });
    this.logger.profileTrace('consumer.loadComponents');
    const {
      components: legacyComponents,
      invalidComponents: legacyInvalidComponents,
      removedComponents,
    } = await this.workspace.consumer.loadComponents(
      ComponentIdList.fromArray(workspaceIds),
      false,
      loadOptsWithDefaults
    );
    this.logger.profileTrace('consumer.loadComponents');
    const allLegacyComponents = legacyComponents.concat(removedComponents);
    legacyInvalidComponents.forEach((invalidComponent) => {
      const entry = { id: idsIndex[invalidComponent.id.toString()], err: invalidComponent.error };
      if (ConsumerComponent.isComponentInvalidByErrorType(invalidComponent.error)) {
        invalidComponents.push(entry);
        return;
      }
      if (
        this.isComponentNotExistsError(invalidComponent.error) ||
        invalidComponent.error instanceof ComponentNotFoundInPath
      ) {
        errors.push(entry);
      }
    });

    const getWithCatch = (id, legacyComponent) => {
      return this.get(id, legacyComponent, undefined, undefined, loadOptsWithDefaults).catch((err) => {
        if (ConsumerComponent.isComponentInvalidByErrorType(err)) {
          invalidComponents.push({
            id,
            err,
          });
          return undefined;
        }
        if (this.isComponentNotExistsError(err) || err instanceof ComponentNotFoundInPath) {
          errors.push({
            id,
            err,
          });
          return undefined;
        }
        throw err;
      });
    };

    // await this.getConsumerComponent(id, loadOpts)
    const componentsP = pMap(
      allLegacyComponents,
      (legacyComponent: ConsumerComponent) => {
        // const componentsP = Promise.all(
        //   allLegacyComponents.map(async (legacyComponent) => {
        let id = idsIndex[legacyComponent.id.toString()];
        if (!id) {
          const withoutVersion = idsIndex[legacyComponent.id.toStringWithoutVersion()] || legacyComponent.id;
          if (withoutVersion) {
            id = withoutVersion.changeVersion(legacyComponent.id.version);
            idsIndex[legacyComponent.id.toString()] = id;
          }
        }
        return getWithCatch(id, legacyComponent);
      },
      {
        concurrency: concurrentComponentsLimit(),
      }
    );

    errors.forEach((err) => {
      this.logger.console(`failed loading component ${err.id.toString()}, see full error in debug.log file`);
      this.logger.warn(`failed loading component ${err.id.toString()}`, err.err);
    });
    const components: Component[] = compact(await componentsP);

    // Here we need to load many, otherwise we will get wrong overrides dependencies data
    // as when loading the next batch of components (next group) we won't have the envs loaded

    try {
      const scopeComponents = await this.workspace.scope.getMany(scopeIds);

      // We don't want to load envs as part of this step, they will be loaded later
      // const scopeComponents = await this.workspace.scope.loadMany(scopeIds, undefined, {
      //   loadApps: false,
      //   loadEnvs: true,
      //   loadCompAspects: false,
      // });
      return {
        workspaceComponents: components,
        scopeComponents,
        invalidComponents,
      };
    } catch (err) {
      const wsAspectLoader = this.workspace.getWorkspaceAspectsLoader();
      wsAspectLoader.throwWsJsoncAspectNotFoundError(err);
      throw err;
    }
  }

  async getInvalid(ids: Array<ComponentID>): Promise<InvalidComponent[]> {
    const idsWithoutEmpty = compact(ids);
    const errors: InvalidComponent[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    await mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      longProcessLogger.logProgress(id.toString());
      try {
        await this.workspace.consumer.loadComponent(id);
      } catch (err: any) {
        if (ConsumerComponent.isComponentInvalidByErrorType(err)) {
          errors.push({
            id,
            err,
          });
          return;
        }
        throw err;
      }
    });
    return errors;
  }

  async get(
    componentId: ComponentID,
    legacyComponent?: ConsumerComponent,
    useCache = true,
    storeInCache = true,
    loadOpts?: ComponentLoadOptions,
    getOpts: ComponentGetOneOptions = { resolveIdVersion: true }
  ): Promise<Component> {
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      { loadExtensions: true, executeLoadSlot: true },
      loadOpts || {}
    );
    const id = getOpts?.resolveIdVersion ? this.resolveVersion(componentId) : componentId;
    const fromCache = this.getFromCache(id, loadOptsWithDefaults);
    if (fromCache && useCache) {
      return fromCache;
    }
    let consumerComponent = legacyComponent;
    const inWs = await this.isInWsIncludeDeleted(id);
    if (inWs && !consumerComponent) {
      consumerComponent = await this.getConsumerComponent(id, loadOptsWithDefaults);
    }

    // in case of out-of-sync, the id may changed during the load process
    const updatedId = consumerComponent ? consumerComponent.id : id;
    const component = await this.loadOne(updatedId, consumerComponent, loadOptsWithDefaults);
    if (storeInCache) {
      this.addMultipleEnvsIssueIfNeeded(component); // it's in storeInCache block, otherwise, it wasn't fully loaded
      this.saveInCache(component, loadOptsWithDefaults);
    }
    return component;
  }

  async getIfExist(componentId: ComponentID) {
    try {
      return await this.get(componentId);
    } catch (err: any) {
      if (this.isComponentNotExistsError(err)) {
        return undefined;
      }
      throw err;
    }
  }

  private resolveVersion(componentId: ComponentID): ComponentID {
    const bitIdWithVersion: ComponentID = getLatestVersionNumber(
      this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved,
      componentId
    );
    const id = bitIdWithVersion.version ? componentId.changeVersion(bitIdWithVersion.version) : componentId;
    return id;
  }

  private addMultipleEnvsIssueIfNeeded(component: Component) {
    const envs = this.envs.getAllEnvsConfiguredOnComponent(component);
    const envIds = uniq(envs.map((env) => env.id));
    if (envIds.length < 2) {
      return;
    }
    component.state.issues.getOrCreate(IssuesClasses.MultipleEnvs).data = envIds;
  }

  clearCache() {
    this.componentsCache.deleteAll();
    this.scopeComponentsCache.deleteAll();
    this.componentsExtensionsCache.deleteAll();
    this.componentLoadedSelfAsAspects.deleteAll();
  }

  clearComponentCache(id: ComponentID) {
    const idStr = id.toString();
    const cachesToClear = [
      this.componentsCache,
      this.scopeComponentsCache,
      this.componentsExtensionsCache,
      this.componentLoadedSelfAsAspects,
    ];
    cachesToClear.forEach((cache) => {
      for (const cacheKey of cache.keys()) {
        if (cacheKey === idStr || cacheKey.startsWith(`${idStr}:`)) {
          cache.delete(cacheKey);
        }
      }
    });
  }

  private async loadOne(id: ComponentID, consumerComponent?: ConsumerComponent, loadOpts?: ComponentLoadOptions) {
    const idStr = id.toString();
    const componentFromScope = this.scopeComponentsCache.has(idStr)
      ? this.scopeComponentsCache.get(idStr)
      : await this.workspace.scope.get(id);
    if (!consumerComponent) {
      if (!componentFromScope) throw new MissingBitMapComponent(id.toString());
      return componentFromScope;
    }
    const extErrorsFromCache = this.componentsExtensionsCache.has(idStr)
      ? this.componentsExtensionsCache.get(idStr)
      : undefined;
    const { extensions, errors } =
      extErrorsFromCache ||
      (await this.workspace.componentExtensions(id, componentFromScope, undefined, {
        loadExtensions: loadOpts?.loadExtensions,
      }));
    if (errors?.some((err) => err instanceof MergeConfigConflict)) {
      consumerComponent.issues.getOrCreate(IssuesClasses.MergeConfigHasConflict).data = true;
    }

    // temporarily mutate consumer component extensions until we remove all direct access from legacy to extensions data
    // TODO: remove this once we remove all direct access from legacy code to extensions data
    consumerComponent.extensions = extensions;

    const state = new State(
      new Config(consumerComponent),
      await this.workspace.createAspectList(extensions),
      ComponentFS.fromVinyls(consumerComponent.files),
      consumerComponent.dependencies,
      consumerComponent
    );
    if (componentFromScope) {
      // Removed by @gilad. do not mutate the component from the scope
      // componentFromScope.state = state;
      // const workspaceComponent = WorkspaceComponent.fromComponent(componentFromScope, this.workspace);
      const workspaceComponent = new WorkspaceComponent(
        componentFromScope.id,
        componentFromScope.head,
        state,
        componentFromScope.tags,
        this.workspace
      );
      if (loadOpts?.executeLoadSlot) {
        return this.executeLoadSlot(workspaceComponent, loadOpts);
      }
      // const updatedComp = await this.executeLoadSlot(workspaceComponent, loadOpts);
      return workspaceComponent;
    }
    const newComponent = this.newComponentFromState(id, state);
    if (!loadOpts?.executeLoadSlot) {
      return newComponent;
    }
    return this.executeLoadSlot(newComponent, loadOpts);
  }

  /**
   * Cache the loaded Component under a key derived from `loadOpts`. Callers
   * typically pass `{ loadExtensions: true, executeLoadSlot: true }` even when
   * the *initial* load options had those false — by the time the loader
   * reaches save, the slot has fired and (when applicable) extensions have
   * been registered, so the post-load state is "fully loaded". See D-002.
   */
  private saveInCache(component: Component, loadOpts?: ComponentLoadOptions): void {
    const cacheKey = createComponentCacheKey(component.id, loadOpts);
    this.componentsCache.set(cacheKey, component);
  }

  /**
   * Lookup follows the "exact-match-or-fully-loaded" rule (D-002): try the
   * caller's exact load-opts shape first; on miss, fall back to the
   * `{ loadExtensions: true, executeLoadSlot: true }` shape that getMany /
   * get use when saving. A fully-loaded Component is a superset of any
   * less-loaded one, so the caller gets at least what it asked for.
   *
   * Also enforces an id-equality check (not just a string match) — when a
   * component was loaded out-of-sync the canonical id-string is the same
   * but the legacy id may have a different scope. We don't want to return
   * the stale cached version in that case.
   */
  private getFromCache(componentId: ComponentID, loadOpts?: ComponentLoadOptions): Component | undefined {
    const bitIdWithVersion: ComponentID = this.resolveVersion(componentId);
    const id = bitIdWithVersion.version ? componentId.changeVersion(bitIdWithVersion.version) : componentId;
    const cacheKey = createComponentCacheKey(id, loadOpts);
    const cacheKeyForFullyLoaded = createComponentCacheKey(id, { loadExtensions: true, executeLoadSlot: true });
    const fromCache = this.componentsCache.get(cacheKey) || this.componentsCache.get(cacheKeyForFullyLoaded);
    if (fromCache && fromCache.id.isEqual(id)) {
      return fromCache;
    }
    return undefined;
  }

  private async getConsumerComponent(
    id: ComponentID,
    loadOpts: ComponentLoadOptions = {}
  ): Promise<ConsumerComponent | undefined> {
    loadOpts.originatedFromHarmony = true;
    try {
      const { components, removedComponents } = await this.workspace.consumer.loadComponents(
        ComponentIdList.fromArray([id]),
        true,
        loadOpts
      );
      return components?.[0] || removedComponents?.[0];
    } catch (err: any) {
      // don't return undefined for any error. otherwise, if the component is invalid (e.g. main
      // file is missing) it returns the model component later unexpectedly, or if it's new, it
      // shows MissingBitMapComponent error incorrectly.
      if (this.isComponentNotExistsError(err)) {
        this.logger.debug(
          `failed loading component "${id.toString()}" from the workspace due to "${err.name}" error\n${err.message}`
        );
        return undefined;
      }
      throw err;
    }
  }

  private isComponentNotExistsError(err: Error): boolean {
    return err instanceof ComponentNotFound || err instanceof MissingBitMapComponent;
  }

  private async executeLoadSlot(component: Component, loadOpts?: ComponentLoadOptions) {
    if (component.state._consumer.removed) {
      // if it was soft-removed now, the component is not in the FS. loading aspects such as composition ends up with
      // errors as they try to read component files from the filesystem.
      return component;
    }

    // Special load events which runs from the workspace but should run from the correct aspect
    // TODO: remove this once those extensions dependent on workspace
    const envsData = await this.envs.calcDescriptor(component, { skipWarnings: !!this.workspace.inInstallContext });

    const wsDeps = component.state._consumer.dependencies.dependencies || [];
    const modelDeps = component.state._consumer.componentFromModel?.dependencies.dependencies || [];
    const merged = Dependencies.merge([wsDeps, modelDeps]);
    const envExtendsDeps = merged.get();

    // Move to deps resolver main runtime once we switch ws<> deps resolver direction
    const policy = await this.dependencyResolver.mergeVariantPolicies(
      component.config.extensions,
      component.id,
      component.state._consumer.files,
      envExtendsDeps
    );
    const dependenciesList = await this.dependencyResolver.extractDepsFromLegacy(component, policy);
    const resolvedEnvJsonc = await this.envs.calculateEnvManifest(
      component,
      component.state._consumer.files,
      envExtendsDeps
    );
    if (resolvedEnvJsonc) {
      // @ts-ignore
      envsData.resolvedEnvJsonc = resolvedEnvJsonc;
    }

    const depResolverData = {
      packageName: this.dependencyResolver.calcPackageName(component),
      dependencies: dependenciesList.serialize(),
      policy: policy.serialize(),
      componentRangePrefix: this.dependencyResolver.calcComponentRangePrefixByConsumerComponent(
        component.state._consumer
      ),
    };

    // Make sure we are adding the envs / deps data first because other on load events might depend on it
    await Promise.all([
      this.upsertExtensionData(component, EnvsAspect.id, envsData),
      this.upsertExtensionData(component, DependencyResolverAspect.id, depResolverData),
    ]);

    // We are updating the component state with the envs and deps data here, so in case we have other slots that depend on this data
    // they will be able to get it, as it's very common use case that during on load someone want to access to the component env for example
    const aspectListWithEnvsAndDeps = await this.workspace.createAspectList(component.state.config.extensions);
    component.state.aspects = aspectListWithEnvsAndDeps;

    const entries = this.workspace.onComponentLoadSlot.toArray();
    await mapSeries(entries, async ([extension, onLoad]) => {
      const data = await onLoad(component, loadOpts);
      await this.upsertExtensionData(component, extension, data);
      // Update the aspect list to have changes happened during the on load slot (new data added above)
      component.state.aspects.upsertEntry(await this.workspace.resolveComponentId(extension), data);
    });

    return component;
  }

  private newComponentFromState(id: ComponentID, state: State): Component {
    return new WorkspaceComponent(id, null, state, new TagMap(), this.workspace);
  }

  private async upsertExtensionData(component: Component, extension: string, data: any) {
    if (!data) return;
    const existingExtension = component.state.config.extensions.findExtension(extension);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }
    component.state.config.extensions.push(await this.getDataEntry(extension, data));
  }

  private async getDataEntry(extension: string, data: { [key: string]: any }): Promise<ExtensionDataEntry> {
    // TODO: @gilad we need to refactor the extension data entry api.
    return new ExtensionDataEntry(undefined, undefined, extension, undefined, data);
  }
}

/**
 * Cache key composition for `componentsCache`. Includes only the four flags
 * that genuinely produce a different Component:
 *
 *   - loadExtensions: false → external aspects aren't registered with Harmony
 *   - executeLoadSlot: false → onComponentLoad slots don't fire, so state.aspects
 *                              doesn't accumulate post-slot upserts
 *   - loadDocs: false → docs aspect's slot subscriber early-returns
 *                       (docs.main.runtime.ts:220), data is empty
 *   - loadCompositions: false → compositions aspect's slot subscriber
 *                               early-returns (compositions.main.runtime.ts:141)
 *
 * Other ComponentLoadOptions (storeInCache, originatedFromHarmony, etc.) don't
 * change the Component value and would split the cache without value if included.
 */
function createComponentCacheKey(id: ComponentID, loadOpts?: ComponentLoadOptions): string {
  const relevantOpts = pick(loadOpts, ['loadExtensions', 'executeLoadSlot', 'loadDocs', 'loadCompositions']);
  return `${id.toString()}:${JSON.stringify(sortKeys(relevantOpts ?? {}))}`;
}

function sortKeys(obj: object) {
  return fromPairs(Object.entries(obj).sort(([k1], [k2]) => k1.localeCompare(k2)));
}

function printGroupsToHandle(groupsToHandle: Array<LoadGroup>, logger: Logger): void {
  groupsToHandle.forEach((group) => {
    const { scopeIds, workspaceIds, aspects, core, seeders, envs } = group;
    logger.console(
      `workspace-component-loader ~ groupsToHandle ${JSON.stringify(
        {
          scopeIds: scopeIds.map((id) => id.toString()),
          workspaceIds: workspaceIds.map((id) => id.toString()),
          aspects,
          core,
          seeders,
          envs,
        },
        null,
        2
      )}`
    );
  });
}

function loadGroupToStr(loadGroup: LoadGroup): string {
  const { scopeIds, workspaceIds, aspects, core, seeders, envs } = loadGroup;

  const attr: string[] = [];
  if (aspects) attr.push('aspects');
  if (core) attr.push('core');
  if (seeders) attr.push('seeders');
  if (envs) attr.push('envs');

  return `workspaceIds: ${workspaceIds.length}, scopeIds: ${scopeIds.length}, (${attr.join('+')})`;
}
