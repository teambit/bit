import pMap from 'p-map';
import { concurrentComponentsLimit, getLatestVersionNumber, pMapPool } from '@teambit/legacy.utils';
import { Component, ComponentFS, Config, InvalidComponent, State, TagMap } from '@teambit/component';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import mapSeries from 'p-map-series';
import { compact, fromPairs, groupBy, pick, uniq } from 'lodash';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { IssuesClasses } from '@teambit/component-issues';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { getMaxSizeForComponents, InMemoryCache, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import ComponentNotFoundInPath from '@teambit/legacy/dist/consumer/component/exceptions/component-not-found-in-path';
import { ComponentLoadOptions as LegacyComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import { Workspace } from '../workspace';
import { WorkspaceComponent } from './workspace-component';
import { MergeConfigConflict } from '../exceptions/merge-config-conflict';

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
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  /**
   * Cache components that loaded from scope (especially for get many for perf improvements)
   */
  private scopeComponentsCache: InMemoryCache<Component>;
  /**
   * Cache extension list for components. used by get many for perf improvements.
   * And to make sure we load extensions first.
   */
  private componentsExtensionsCache: InMemoryCache<{
    extensions: ExtensionDataList;
    errors: Error[] | undefined;
    envId: string | undefined;
  }>;

  private componentLoadedSelfAsAspects: InMemoryCache<boolean>; // cache loaded components
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
    const callId = Math.floor(Math.random() * 1000); // generate a random callId to be able to identify the call from the logs
    this.logger.profile(`getMany-${callId}`);
    const idsWithoutEmpty = compact(ids);
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

    const components = [...loadedComponents, ...loadOrCached.fromCache];

    // this.logger.clearStatusLine();
    components.forEach((comp) => {
      this.saveInCache(comp, { loadExtensions: true, executeLoadSlot: true });
    });
    this.logger.profile(`getMany-${callId}`);
    return { components, invalidComponents };
  }

  private async getAndLoadSlotOrdered(
    ids: ComponentID[],
    loadOpts: ComponentLoadOptions,
    callId = 0
  ): Promise<GetManyRes> {
    if (!ids?.length) return { components: [], invalidComponents: [] };

    const workspaceScopeIdsMap: WorkspaceScopeIdsMap = await this.groupAndUpdateIds(ids);
    this.logger.profile('buildLoadGroups');
    const groupsToHandle = await this.buildLoadGroups(workspaceScopeIdsMap);
    this.logger.profile('buildLoadGroups');
    // prefix your command with "BIT_LOG=*" to see the detailed groups
    if (process.env.BIT_LOG) {
      printGroupsToHandle(groupsToHandle, this.logger);
    }
    const groupsRes = compact(
      await mapSeries(groupsToHandle, async (group, index) => {
        const { scopeIds, workspaceIds, aspects, core, seeders, envs } = group;
        const groupDesc = `getMany-${callId} group ${index + 1}/${groupsToHandle.length} - ${loadGroupToStr(group)}`;
        this.logger.profile(groupDesc);
        if (!workspaceIds.length && !scopeIds.length) {
          throw new Error('getAndLoadSlotOrdered - group has no ids to load');
        }
        const res = await this.getAndLoadSlot(workspaceIds, scopeIds, { ...loadOpts, core, seeders, aspects, envs });
        this.logger.profile(groupDesc);
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
    const allIds = [...wsIds, ...scopeIds];
    const groupedByIsCoreEnvs = groupBy(allIds, (id) => {
      return this.envs.isCoreEnv(id.toStringWithoutVersion());
    });
    const nonCoreEnvs = groupedByIsCoreEnvs.false || [];
    await this.populateScopeAndExtensionsCache(nonCoreEnvs, workspaceScopeIdsMap);
    const allExtIds: Map<string, ComponentID> = new Map();
    nonCoreEnvs.forEach((id) => {
      const idStr = id.toString();
      const fromCache = this.componentsExtensionsCache.get(idStr);
      if (!fromCache || !fromCache.extensions) {
        return;
      }
      fromCache.extensions.forEach((ext) => {
        if (!allExtIds.has(ext.stringId) && ext.newExtensionId) {
          allExtIds.set(ext.stringId, ext.newExtensionId);
        }
      });
    });
    const allExtCompIds = Array.from(allExtIds.values());
    await this.populateScopeAndExtensionsCache(allExtCompIds || [], workspaceScopeIdsMap);

    // const allExtIdsStr = allExtCompIds.map((id) => id.toString());

    const envsIdsOfWsComps = new Set<string>();
    wsIds.forEach((id) => {
      const idStr = id.toString();
      const fromCache = this.componentsExtensionsCache.get(idStr);
      if (!fromCache || !fromCache.extensions) {
        return;
      }
      const envId = fromCache.envId;
      if (envId) {
        envsIdsOfWsComps.add(envId);
      }
    });

    const groupedByIsEnvOfWsComps = groupBy(allExtCompIds, (id) => {
      const idStr = id.toString();
      const withoutVersion = idStr.split('@')[0];
      return envsIdsOfWsComps.has(idStr) || envsIdsOfWsComps.has(withoutVersion);
    });
    const notEnvOfWsCompsStrs = (groupedByIsEnvOfWsComps.false || []).map((id) => id.toString());

    const groupedByIsExtOfAnother = groupBy(nonCoreEnvs, (id) => {
      return notEnvOfWsCompsStrs.includes(id.toString());
    });
    const extIdsFromTheList = (groupedByIsExtOfAnother.true || []).map((id) => id.toString());
    const extsNotFromTheList: ComponentID[] = [];
    for (const [, id] of allExtIds.entries()) {
      if (!extIdsFromTheList.includes(id.toString())) {
        extsNotFromTheList.push(id);
      }
    }

    await this.groupAndUpdateIds(extsNotFromTheList, workspaceScopeIdsMap);

    const layeredExtFromTheList = this.regroupExtIdsFromTheList(groupedByIsExtOfAnother.true);
    const layeredExtGroups = layeredExtFromTheList.map((ids) => {
      return {
        ids,
        core: false,
        aspects: true,
        seeders: true,
        envs: false,
      };
    });

    const groupsToHandle = [
      // Always load first core envs
      { ids: groupedByIsCoreEnvs.true || [], core: true, aspects: true, seeders: true, envs: true },
      { ids: groupedByIsEnvOfWsComps.true || [], core: false, aspects: true, seeders: false, envs: true },
      { ids: extsNotFromTheList || [], core: false, aspects: true, seeders: false, envs: false },
      ...layeredExtGroups,
      { ids: groupedByIsExtOfAnother.false || [], core: false, aspects: false, seeders: true, envs: false },
    ];
    const groupsByWsScope = groupsToHandle.map((group) => {
      if (!group.ids?.length) return undefined;
      const groupedByWsScope = groupBy(group.ids, (id) => {
        return workspaceScopeIdsMap.workspaceIds.has(id.toString());
      });
      return {
        workspaceIds: groupedByWsScope.true || [],
        scopeIds: groupedByWsScope.false || [],
        core: group.core,
        aspects: group.aspects,
        seeders: group.seeders,
        envs: group.envs,
      };
    });
    return compact(groupsByWsScope);
  }

  private regroupExtIdsFromTheList(ids: ComponentID[]): Array<ComponentID[]> {
    // TODO: implement this function
    // this should handle a case when you have:
    // compA that has extA and that extA has extB
    // in that case we now get the following group:
    // ids: [extA, extB]
    // while we need extB to be in a different group before extA
    return [ids];
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
    this.logger.profile('loadComponentsExtensions');
    await this.workspace.loadComponentsExtensions(mergedExtensions);
    this.logger.profile('loadComponentsExtensions');
    let wsComponentsWithAspects = workspaceComponents;
    // if (loadOpts.seeders) {
    this.logger.profile('executeLoadSlot');
    wsComponentsWithAspects = await pMapPool(workspaceComponents, (component) => this.executeLoadSlot(component), {
      concurrency: concurrentComponentsLimit(),
    });
    this.logger.profile('executeLoadSlot');
    await this.warnAboutMisconfiguredEnvs(wsComponentsWithAspects);
    // }

    const withAspects = wsComponentsWithAspects.concat(scopeComponents);

    // It's important to load the workspace components as aspects here
    // otherwise the envs from the workspace won't be loaded at time
    // so we will get wrong dependencies from component who uses envs from the workspace
    this.logger.profile('loadCompsAsAspects');
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
    this.logger.profile('loadCompsAsAspects');

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
    const result: WorkspaceScopeIdsMap = existingGroups || {
      scopeIds: new Map(),
      workspaceIds: new Map(),
    };

    await Promise.all(
      ids.map(async (componentId) => {
        const inWs = await this.isInWsIncludeDeleted(componentId);

        if (!inWs) {
          result.scopeIds.set(componentId.toString(), componentId);
          return undefined;
        }
        const resolvedVersions = this.resolveVersion(componentId);
        result.workspaceIds.set(resolvedVersions.toString(), resolvedVersions);
        return undefined;
      })
    );
    return result;
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
    this.logger.profile('consumer.loadComponents');
    const {
      components: legacyComponents,
      invalidComponents: legacyInvalidComponents,
      removedComponents,
    } = await this.workspace.consumer.loadComponents(
      ComponentIdList.fromArray(workspaceIds),
      false,
      loadOptsWithDefaults
    );
    this.logger.profile('consumer.loadComponents');
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
    const fromCache = this.getFromCache(componentId, loadOptsWithDefaults);
    if (fromCache && useCache) {
      return fromCache;
    }
    let consumerComponent = legacyComponent;
    const inWs = await this.isInWsIncludeDeleted(componentId);
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

  private saveInCache(component: Component, loadOpts?: ComponentLoadOptions): void {
    const cacheKey = createComponentCacheKey(component.id, loadOpts);
    this.componentsCache.set(cacheKey, component);
  }

  /**
   * make sure that not only the id-str match, but also the legacy-id.
   * this is needed because the ComponentID.toString() is the same whether or not the legacy-id has
   * scope-name, as it includes the defaultScope if the scope is empty.
   * as a result, when out-of-sync is happening and the id is changed to include scope-name in the
   * legacy-id, the component is the cache has the old id.
   */
  private getFromCache(componentId: ComponentID, loadOpts?: ComponentLoadOptions): Component | undefined {
    const bitIdWithVersion: ComponentID = this.resolveVersion(componentId);
    const id = bitIdWithVersion.version ? componentId.changeVersion(bitIdWithVersion.version) : componentId;
    const cacheKey = createComponentCacheKey(id, loadOpts);
    // If we try to look for the cache without load extensions/ without execute load slot
    // but there is an entry after the load, we want to use it as well.
    // as we want the component, so if we already loaded it with everything, it's fine.
    // this sometime relevant for cases with tiny cache size (during tag)
    const cacheKeyWithTrueLoadOpts = createComponentCacheKey(id, { loadExtensions: true, executeLoadSlot: true });
    const fromCache = this.componentsCache.get(cacheKey) || this.componentsCache.get(cacheKeyWithTrueLoadOpts);
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

    // Move to deps resolver main runtime once we switch ws<> deps resolver direction
    const policy = await this.dependencyResolver.mergeVariantPolicies(
      component.config.extensions,
      component.id,
      component.state._consumer.files
    );
    const dependenciesList = await this.dependencyResolver.extractDepsFromLegacy(component, policy);

    const depResolverData = {
      packageName: this.dependencyResolver.calcPackageName(component),
      dependencies: dependenciesList.serialize(),
      policy: policy.serialize(),
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

function createComponentCacheKey(id: ComponentID, loadOpts?: ComponentLoadOptions): string {
  const relevantOpts = pick(loadOpts, ['loadExtensions', 'executeLoadSlot', 'loadDocs', 'loadCompositions']);
  return `${id.toString()}:${JSON.stringify(sortKeys(relevantOpts ?? {}))}`;
}

function sortKeys(obj: Object) {
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
