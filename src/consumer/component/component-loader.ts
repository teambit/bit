import BluebirdPromise from 'bluebird';
import * as path from 'path';

import { BitId, BitIds } from '../../bit-id';
import { ANGULAR_PACKAGE_IDENTIFIER } from '../../constants';
import logger from '../../logger/logger';
import { ModelComponent } from '../../scope/models';
import { ObjectList } from '../../scope/objects/object-list';
import { getScopeRemotes } from '../../scope/scope-remotes';
import { getLatestVersionNumber } from '../../utils';
import { getLastModifiedPathsTimestampMs } from '../../utils/fs/last-modified';
import ComponentsPendingImport from '../component-ops/exceptions/components-pending-import';
import Component, { InvalidComponent } from '../component/consumer-component';
import Consumer from '../consumer';
import { ComponentFsCache } from './component-fs-cache';
import { updateDependenciesVersions } from './dependencies/dependency-resolver';
import { DependenciesLoader } from './dependencies/dependency-resolver/dependencies-loader';

type OnComponentLoadSubscriber = (component: Component) => Promise<Component>;

export default class ComponentLoader {
  _componentsCache: { [idStr: string]: Component } = {}; // cache loaded components
  _componentsCacheForCapsule: Record<string, any> = {}; // cache loaded components for capsule, must not use the cache for the workspace
  _shouldCheckForClearingDependenciesCache = true;
  consumer: Consumer;
  cacheResolvedDependencies: Record<string, any>;
  cacheProjectAst: Record<string, any> | undefined; // specific platforms may need to parse the entire project. (was used for Angular, currently not in use)
  componentFsCache: ComponentFsCache;
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.cacheResolvedDependencies = {};
    this.componentFsCache = new ComponentFsCache(consumer.scope.getPath());
  }

  static onComponentLoadSubscribers: OnComponentLoadSubscriber[] = [];
  static registerOnComponentLoadSubscriber(func: OnComponentLoadSubscriber) {
    this.onComponentLoadSubscribers.push(func);
  }

  clearComponentsCache() {
    this._componentsCache = {};
    this._componentsCacheForCapsule = {};
    this.cacheResolvedDependencies = {};
    this._shouldCheckForClearingDependenciesCache = true;
  }

  async invalidateDependenciesCacheIfNeeded(): Promise<void> {
    if (this._shouldCheckForClearingDependenciesCache) {
      const pathsToCheck = [
        path.join(this.consumer.getPath(), 'node_modules'),
        path.join(this.consumer.getPath(), 'package.json'),
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

  async loadForCapsule(id: BitId): Promise<Component> {
    logger.debugAndAddBreadCrumb('ComponentLoader', 'loadForCapsule, id: {id}', {
      id: id.toString(),
    });
    const idWithVersion: BitId = getLatestVersionNumber(this.consumer.bitmapIds, id);
    const idStr = idWithVersion.toString();
    if (!this._componentsCacheForCapsule[idStr]) {
      const { components } = await this.loadMany(BitIds.fromArray([id]));
      const component = components[0].clone();
      this._componentsCacheForCapsule[idStr] = component;
    }

    logger.debugAndAddBreadCrumb('ComponentLoader', 'loadForCapsule finished loading the component "{id}"', {
      id: id.toString(),
    });
    return this._componentsCacheForCapsule[idStr];
  }

  async loadMany(
    ids: BitIds,
    throwOnFailure = true
  ): Promise<{ components: Component[]; invalidComponents: InvalidComponent[] }> {
    logger.debugAndAddBreadCrumb('ComponentLoader', 'loading consumer-components from the file-system, ids: {ids}', {
      ids: ids.toString(),
    });
    const alreadyLoadedComponents: Component[] = [];
    const idsToProcess: BitId[] = [];
    const invalidComponents: InvalidComponent[] = [];
    ids.forEach((id: BitId) => {
      if (!(id instanceof BitId)) {
        throw new TypeError(`consumer.loadComponents expects to get BitId instances, instead, got "${typeof id}"`);
      }
      const idWithVersion: BitId = getLatestVersionNumber(this.consumer.bitmapIds, id);
      const idStr = idWithVersion.toString();
      if (this._componentsCache[idStr]) {
        alreadyLoadedComponents.push(this._componentsCache[idStr]);
      } else {
        idsToProcess.push(idWithVersion);
      }
    });
    logger.debugAndAddBreadCrumb(
      'ComponentLoader',
      `the following ${alreadyLoadedComponents.length} components have been already loaded, get them from the cache. {idsStr}`,
      { idsStr: alreadyLoadedComponents.map((c) => c.id.toString()).join(', ') }
    );
    if (!idsToProcess.length) return { components: alreadyLoadedComponents, invalidComponents };

    const allComponents: Component[] = [];
    await BluebirdPromise.mapSeries(idsToProcess, async (id: BitId) => {
      const component = await this.loadOne(id, throwOnFailure, invalidComponents);
      if (component) {
        this._componentsCache[component.id.toString()] = component;
        logger.debugAndAddBreadCrumb('ComponentLoader', 'Finished loading the component "{id}"', {
          id: component.id.toString(),
        });
        allComponents.push(component);
      }
    });

    return { components: allComponents.concat(alreadyLoadedComponents), invalidComponents };
  }

  private async loadOne(id: BitId, throwOnFailure: boolean, invalidComponents: InvalidComponent[]) {
    const componentMap = this.consumer.bitMap.getComponent(id);
    let bitDir = this.consumer.getPath();
    if (componentMap.rootDir) {
      bitDir = path.join(bitDir, componentMap.rootDir);
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
    try {
      component = await Component.loadFromFileSystem({
        bitDir,
        componentMap,
        id,
        consumer: this.consumer,
      });
    } catch (err) {
      return handleError(err);
    }
    component.loadedFromFileSystem = true;
    component.originallySharedDir = componentMap.originallySharedDir || undefined;
    component.wrapDir = componentMap.wrapDir || undefined;
    // reload component map as it may be changed after calling Component.loadFromFileSystem()
    component.componentMap = this.consumer.bitMap.getComponent(id);
    await this._handleOutOfSyncScenarios(component);

    const loadDependencies = async () => {
      await this.invalidateDependenciesCacheIfNeeded();
      const dependenciesLoader = new DependenciesLoader(component, this.consumer, {
        cacheResolvedDependencies: this.cacheResolvedDependencies,
        cacheProjectAst: this.cacheProjectAst,
        useDependenciesCache: true,
      });
      await dependenciesLoader.load();
      updateDependenciesVersions(this.consumer, component);
    };

    const runOnComponentLoadEvent = async () => {
      return BluebirdPromise.mapSeries(ComponentLoader.onComponentLoadSubscribers, async (subscriber) => {
        component = await subscriber(component);
      });
    };
    try {
      await loadDependencies();
      await runOnComponentLoadEvent();
    } catch (err) {
      return handleError(err);
    }

    return component;
  }

  private async _handleOutOfSyncScenarios(component: Component) {
    const { componentFromModel, componentMap } = component;
    // $FlowFixMe componentMap is set here
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentId: BitId = componentMap.id;
    let newId: BitId | null | undefined;
    if (componentFromModel && !currentId.hasVersion()) {
      // component is in the scope but .bitmap doesn't have version, sync .bitmap with the scope data
      newId = currentId.changeVersion(componentFromModel.version);
      if (componentFromModel.scope) newId = newId.changeScope(componentFromModel.scope);
    }
    if (componentFromModel && componentFromModel.scope && currentId.hasVersion() && !currentId.hasScope()) {
      // component is not exported in .bitmap but exported in the scope, sync .bitmap with the scope data
      newId = currentId.changeScope(componentFromModel.scope);
    }
    if (!componentFromModel && currentId.hasVersion()) {
      // the version used in .bitmap doesn't exist in the scope
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(currentId.changeVersion(undefined));
      if (modelComponent) {
        // the scope has this component but not the version used in .bitmap, sync .bitmap with
        // latest version from the scope
        await this._throwPendingImportIfNeeded(currentId);
        newId = currentId.changeVersion(modelComponent.latest());
        component.componentFromModel = await this.consumer.loadComponentFromModelIfExist(newId);
      } else if (!currentId.hasScope()) {
        // the scope doesn't have this component and .bitmap doesn't have scope, assume it's new
        newId = currentId.changeVersion(undefined);
      }
    }

    if (newId) {
      component.version = newId.version;
      component.scope = newId.scope;
      this.consumer.bitMap.updateComponentId(newId);
      component.componentMap = this.consumer.bitMap.getComponent(newId);
    }
  }

  private async _throwPendingImportIfNeeded(currentId: BitId) {
    if (currentId.hasScope()) {
      const remoteComponent: ModelComponent | null | undefined = await this._getRemoteComponent(currentId);
      // @todo-lanes: make it work with lanes. It needs to go through the objects one by one and check
      // whether one of the hashes exist.
      // @ts-ignore version is set here
      if (remoteComponent && remoteComponent.hasTag(currentId.version)) {
        throw new ComponentsPendingImport();
      }
    }
  }

  private async _getRemoteComponent(id: BitId): Promise<ModelComponent | null | undefined> {
    const remotes = await getScopeRemotes(this.consumer.scope);
    let objectList: ObjectList;
    try {
      objectList = await remotes.fetch({ [id.scope as string]: [id.toString()] }, this.consumer.scope);
    } catch (err) {
      return null; // probably doesn't exist
    }
    const bitObjectsList = await objectList.toBitObjects();
    return bitObjectsList.getComponents()[0];
  }

  private _isAngularProject(): boolean {
    return Boolean(
      this.consumer.packageJson &&
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.consumer.packageJson.dependencies &&
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.consumer.packageJson.dependencies[ANGULAR_PACKAGE_IDENTIFIER]
    );
  }

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
