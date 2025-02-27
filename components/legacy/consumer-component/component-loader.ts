import mapSeries from 'p-map-series';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import * as path from 'path';
import { ComponentIssue } from '@teambit/component-issues';
import { getMaxSizeForComponents, InMemoryCache, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { BIT_MAP } from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import { ModelComponent, VERSION_ZERO } from '@teambit/objects';
import { getLatestVersionNumber } from '@teambit/legacy.utils';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { getLastModifiedPathsTimestampMs } from '@teambit/toolbox.fs.last-modified';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { Component, InvalidComponent } from './consumer-component';
import { Consumer, ComponentsPendingImport } from '@teambit/legacy.consumer';
import { FsCache } from '@teambit/workspace.modules.fs-cache';
import { ComponentMap } from '@teambit/legacy.bit-map';
import { loader } from '@teambit/legacy.loader';

export type ComponentLoadOptions = {
  loadDocs?: boolean;
  loadCompositions?: boolean;
  originatedFromHarmony?: boolean;
  loadExtensions?: boolean;
  storeInCache?: boolean;
  storeDepsInFsCache?: boolean;
  resolveExtensionsVersions?: boolean;
};
export type LoadManyResult = {
  components: Component[];
  invalidComponents: InvalidComponent[];
  removedComponents: Component[];
};

type OnComponentLoadSubscriber = (component: Component, loadOpts?: ComponentLoadOptions) => Promise<Component>;
type OnComponentIssuesCalcSubscriber = (component: Component) => Promise<ComponentIssue[]>;

export type DependencyLoaderOpts = {
  cacheResolvedDependencies: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
  useDependenciesCache: boolean;
  storeInFsCache?: boolean;
  resolveExtensionsVersions?: boolean;
};

type LoadDepsFunc = (component: Component, opts: DependencyLoaderOpts) => Promise<any>;

export class ComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  _shouldCheckForClearingDependenciesCache = true;
  consumer: Consumer;
  cacheResolvedDependencies: Record<string, any>;
  cacheProjectAst: Record<string, any> | undefined; // specific platforms may need to parse the entire project. (was used for Angular, currently not in use)
  componentFsCache: FsCache;
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.cacheResolvedDependencies = {};
    this.componentFsCache = new FsCache(consumer.scope.getPath());
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
  }

  static onComponentLoadSubscribers: OnComponentLoadSubscriber[] = [];
  static registerOnComponentLoadSubscriber(func: OnComponentLoadSubscriber) {
    this.onComponentLoadSubscribers.push(func);
  }

  static onComponentIssuesCalcSubscribers: OnComponentIssuesCalcSubscriber[] = [];
  static registerOnComponentIssuesCalcSubscriber(func: OnComponentIssuesCalcSubscriber) {
    this.onComponentIssuesCalcSubscribers.push(func);
  }

  static loadDeps: LoadDepsFunc;

  clearComponentsCache() {
    this.componentsCache.deleteAll();
    this.cacheResolvedDependencies = {};
    this._shouldCheckForClearingDependenciesCache = true;
  }

  clearOneComponentCache(id: ComponentID) {
    const idStr = id.toString();
    this.componentsCache.delete(idStr);
    this.cacheResolvedDependencies = {};
  }

  async invalidateDependenciesCacheIfNeeded(): Promise<void> {
    if (this._shouldCheckForClearingDependenciesCache) {
      const pathsToCheck = [
        path.join(this.consumer.getPath(), 'node_modules'),
        path.join(this.consumer.getPath(), 'package.json'),
        path.join(this.consumer.getPath(), 'pnpm-lock.yaml'),
        path.join(this.consumer.getPath(), 'yarn.lock'),
        path.join(this.consumer.getPath(), BIT_MAP),
        this.consumer.config.path,
      ];
      const lastModified = await getLastModifiedPathsTimestampMs(pathsToCheck);
      const dependenciesCacheList = await this.componentFsCache.listDependenciesDataCache();
      const lastUpdateAllComps = Object.keys(dependenciesCacheList).map((key) => dependenciesCacheList[key].time);
      const firstCacheEntered = Math.min(...lastUpdateAllComps);
      // if lastUpdateAllComps is empty, firstCacheEntered is Infinity so shouldInvalidate is
      // always false, which is good. no need to invalidate the cache if nothing there.
      const shouldInvalidate = lastModified > firstCacheEntered;
      if (shouldInvalidate) {
        // at least one component inserted to the cache before workspace-config/node-modules
        // modification, invalidate the entire deps-cache.
        logger.debug(
          'component-loader, invalidating dependencies cache because either node-modules or workspace config had been changed'
        );
        await this.componentFsCache.deleteAllDependenciesDataCache();
      }
    }
    this._shouldCheckForClearingDependenciesCache = false;
  }

  async loadMany(
    ids: ComponentIdList,
    throwOnFailure = true,
    loadOpts?: ComponentLoadOptions
  ): Promise<LoadManyResult> {
    logger.debugAndAddBreadCrumb('ComponentLoader', 'loading consumer-components from the file-system, ids: {ids}', {
      ids: ids.toString(),
    });
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      { loadExtensions: true, executeLoadSlot: true },
      loadOpts || {}
    );
    const alreadyLoadedComponents: Component[] = [];
    const idsToProcess: ComponentID[] = [];
    const invalidComponents: InvalidComponent[] = [];
    const removedComponents: Component[] = [];
    ids.forEach((id: ComponentID) => {
      if (id.constructor.name !== ComponentID.name) {
        throw new TypeError(
          `consumer.loadComponents expects to get ComponentID instances, instead, got "${typeof id}"`
        );
      }
      const idWithVersion = getLatestVersionNumber(this.consumer.bitmapIdsFromCurrentLaneIncludeRemoved, id);
      const idStr = idWithVersion.toString();
      const fromCache = this.componentsCache.get(idStr);
      if (fromCache) {
        alreadyLoadedComponents.push(fromCache);
      } else if (!idsToProcess.includes(idWithVersion)) {
        idsToProcess.push(idWithVersion);
      }
    });
    logger.debugAndAddBreadCrumb(
      'ComponentLoader',
      `the following ${alreadyLoadedComponents.length} components have been already loaded, get them from the cache. {idsStr}`,
      { idsStr: alreadyLoadedComponents.map((c) => c.id.toString()).join(', ') }
    );
    if (!idsToProcess.length) return { components: alreadyLoadedComponents, invalidComponents, removedComponents };
    const storeInCache = loadOptsWithDefaults?.storeInCache ?? true;
    const allComponents: Component[] = [];
    const shouldRunInParallel = await this.shouldRunInParallel(idsToProcess);
    logger.debug(`loading ${idsToProcess.length} components in parallel: ${shouldRunInParallel.toString()}`);
    await pMapPool(
      idsToProcess,
      async (id: ComponentID) => {
        const component = await this.loadOne(
          id,
          throwOnFailure,
          invalidComponents,
          removedComponents,
          loadOptsWithDefaults
        );
        if (component) {
          if (storeInCache) {
            this.componentsCache.set(component.id.toString(), component);
          }
          logger.debugAndAddBreadCrumb('ComponentLoader', 'Finished loading the component "{id}"', {
            id: component.id.toString(),
          });
          allComponents.push(component);
        }
      },
      { concurrency: shouldRunInParallel ? concurrentComponentsLimit() : 1 }
    );

    return { components: allComponents.concat(alreadyLoadedComponents), invalidComponents, removedComponents };
  }

  private async loadOne(
    id: ComponentID,
    throwOnFailure: boolean,
    invalidComponents: InvalidComponent[],
    removedComponents: Component[],
    loadOpts?: ComponentLoadOptions
  ) {
    let componentMap = this.consumer.bitMap.getComponent(id);
    if (componentMap.isRemoved()) {
      const fromModel = await this.consumer.scope.getConsumerComponentIfExist(id);
      if (!fromModel) {
        invalidComponents.push({
          id,
          error: new Error(
            `fatal: ${id.toString()} is marked as removed but its objects are missing from the local scope, try to import this component individually with --objects flag`
          ),
          component: undefined,
        });
        return null;
      }
      fromModel.setRemoved();
      fromModel.componentMap = componentMap;
      removedComponents.push(fromModel);
      return null;
    }
    let component: Component;
    const handleError = (error) => {
      if (throwOnFailure) throw error;

      logger.errorAndAddBreadCrumb('component-loader.loadOne', 'failed loading {id} from the file-system', {
        id: id.toString(),
      });
      if (Component.isComponentInvalidByErrorType(error)) {
        invalidComponents.push({ id, error, component });
        return null;
      }
      throw error;
    };
    const newId = await this._handleOutOfSyncScenarios(componentMap);
    if (newId) {
      componentMap = this.consumer.bitMap.getComponent(newId);
    }
    const updatedId = newId || id;

    try {
      component = await Component.loadFromFileSystem({
        componentMap,
        id: updatedId,
        consumer: this.consumer,
        loadOpts,
      });
    } catch (err: any) {
      return handleError(err);
    }
    component.loadedFromFileSystem = true;
    // reload component map as it may be changed after calling Component.loadFromFileSystem()
    component.componentMap = this.consumer.bitMap.getComponent(updatedId);

    const loadDependencies = async () => {
      await ComponentLoader.loadDeps(component, {
        cacheResolvedDependencies: this.cacheResolvedDependencies,
        cacheProjectAst: this.cacheProjectAst,
        useDependenciesCache: component.issues.isEmpty(),
        storeInFsCache: loadOpts?.storeDepsInFsCache,
        resolveExtensionsVersions: loadOpts?.resolveExtensionsVersions,
      });
    };

    const runOnComponentLoadEvent = async () => {
      return mapSeries(ComponentLoader.onComponentLoadSubscribers, async (subscriber) => {
        component = await subscriber(component, loadOpts);
      });
    };

    try {
      await loadDependencies();
      if (loadOpts?.loadExtensions) {
        await runOnComponentLoadEvent();
      }
    } catch (err: any) {
      return handleError(err);
    }

    return component;
  }

  private async runOnComponentIssuesCalcEvent(component: Component) {
    return mapSeries(ComponentLoader.onComponentIssuesCalcSubscribers, async (subscriber) => {
      const issues = await subscriber(component);
      issues.forEach((issue) => {
        component.issues.add(issue);
      });
    });
  }

  /**
   * when multiple components don't have the dependencies cache, we have to parse lots of files to get the dependencies.
   * in many cases, the same files are parsed for multiple components, so loading multiple components in parallel hurts
   * the performance by making unnecessary fs calls.
   * this function returns true only if the dependencies cache has all the components. or when only one component is missing.
   */
  private async shouldRunInParallel(ids: ComponentID[]): Promise<boolean> {
    await this.invalidateDependenciesCacheIfNeeded();
    if (ids.length < 2) {
      return false;
    }
    const dependenciesCacheList = await this.componentFsCache.listDependenciesDataCache();
    const depsInCache = Object.keys(dependenciesCacheList);
    if (!depsInCache.length) {
      return false;
    }
    const idsStr = ids.map((id) => id.toString());
    const notInCache = idsStr.filter((id) => !depsInCache.includes(id));
    return notInCache.length < 2;
  }

  private async _handleOutOfSyncScenarios(componentMap: ComponentMap): Promise<ComponentID | undefined> {
    const currentId = componentMap.id;
    const modelComponent = await this.consumer.scope.getModelComponentIfExist(currentId.changeVersion(undefined));
    if (modelComponent && !currentId.hasVersion()) {
      // for Harmony, we know ahead the defaultScope, so even then .bitmap shows it as new and
      // there is nothing in the scope, we can check if there is a component with the same
      // default-scope in the objects
      const existingVersion = modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);
      if (existingVersion === VERSION_ZERO) {
        // this might happen when a component was created on another lane.
        // we don't allow two components with the same name and different history graph.
        loader.stop();
        logger.console(
          `component ${currentId.toString()} exists already in the local-scope without head.
it was probably created on another lane and if so, consider removing this component and merge it from the lane`,
          'warn',
          'yellow'
        );
        return undefined;
      }
    }

    const componentFromModel = await this.consumer.loadComponentFromModelIfExist(currentId);
    let newId: ComponentID | undefined;
    if (componentFromModel && !currentId.hasVersion()) {
      // component is in the scope but .bitmap doesn't have version, sync .bitmap with the scope data
      newId = currentId.changeVersion(componentFromModel.version);
      if (componentFromModel.scope) newId = newId.changeScope(componentFromModel.scope);
    }
    if (
      componentFromModel &&
      componentFromModel.scope &&
      modelComponent?.scopesList.length &&
      currentId.hasVersion() &&
      !currentId._legacy.hasScope()
    ) {
      // component is not exported in .bitmap but exported in the scope, sync .bitmap with the scope data
      newId = currentId.changeScope(componentFromModel.scope);
    }
    if (!componentFromModel && currentId.hasVersion()) {
      // the version used in .bitmap doesn't exist in the scope
      if (modelComponent) {
        // the scope has this component but not the version used in .bitmap, sync .bitmap with
        // latest version from the scope
        await this._throwPendingImportIfNeeded(currentId);
        newId = currentId.changeVersion(modelComponent.getHeadRegardlessOfLaneAsTagOrHash());
      } else if (!currentId._legacy.hasScope()) {
        // the scope doesn't have this component and .bitmap doesn't have scope, assume it's new
        newId = currentId.changeVersion(undefined);
      }
    }
    // in case the component was loaded using a short-hash, replace the id with the full-hash
    if (
      componentFromModel?.version &&
      currentId.hasVersion() &&
      componentFromModel.version !== currentId.version &&
      componentFromModel.version.startsWith(currentId.version)
    ) {
      newId = currentId.changeVersion(componentFromModel.version);
    }

    if (newId) {
      this.consumer.bitMap.updateComponentId(newId);
    }
    return newId;
  }

  private async _throwPendingImportIfNeeded(currentId: ComponentID) {
    if (this.consumer.isExported(currentId)) {
      const remoteComponent: ModelComponent | null | undefined = await this._getRemoteComponent(currentId);
      // @todo-lanes: make it work with lanes. It needs to go through the objects one by one and check
      // whether one of the hashes exist.
      // @ts-ignore version is set here
      if (remoteComponent && remoteComponent.hasTag(currentId.version)) {
        throw new ComponentsPendingImport([currentId.toString()]);
      }
    }
  }

  private async _getRemoteComponent(id: ComponentID): Promise<ModelComponent | null | undefined> {
    const scopeComponentsImporter = this.consumer.scope.scopeImporter;
    const objectList = await scopeComponentsImporter.getRemoteComponent(id);
    if (!objectList) return null;
    const components = objectList.getComponents();
    if (!components.length) return null; // probably doesn't exist
    return components[0];
  }

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
