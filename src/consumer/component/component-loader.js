// @flow
import path from 'path';
import pMapSeries from 'p-map-series';
import type Consumer from '../consumer';
import { BitIds, BitId } from '../../bit-id';
import logger from '../../logger/logger';
import Component from './consumer-component';
import type { InvalidComponent } from '../component/consumer-component';
import { getLatestVersionNumber } from '../../utils';
import { ANGULAR_PACKAGE_IDENTIFIER } from '../../constants';
import { DependencyResolver, updateDependenciesVersions } from './dependencies/dependency-resolver';
import { getScopeRemotes } from '../../scope/scope-remotes';
import { ModelComponent } from '../../scope/models';
import ComponentsPendingImport from '../component-ops/exceptions/components-pending-import';

export default class ComponentLoader {
  _componentsCache: Object = {}; // cache loaded components
  _componentsCacheForCapsule: Object = {}; // cache loaded components for capsule, must not use the cache for the workspace
  consumer: Consumer;
  cacheResolvedDependencies: Object;
  cacheProjectAst: ?{ angular: Object }; // specific platforms (like Angular) need to parse the entire project
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.cacheResolvedDependencies = {};
    if (this._isAngularProject()) {
      this.cacheProjectAst = { angular: {} };
    }
  }

  async loadForCapsule(id: BitId): Promise<Component> {
    const idWithVersion: BitId = getLatestVersionNumber(this.consumer.bitmapIds, id);
    const idStr = idWithVersion.toString();
    if (this._componentsCacheForCapsule[idStr]) {
      return this._componentsCacheForCapsule[idStr];
    }
    const { components } = await this.loadMany(BitIds.fromArray([id]));
    const component = components[0].clone();
    this._componentsCacheForCapsule[idStr] = component;
    return component;
  }

  async loadMany(
    ids: BitIds,
    throwOnFailure: boolean = true
  ): Promise<{ components: Component[], invalidComponents: InvalidComponent[] }> {
    logger.debugAndAddBreadCrumb('ComponentLoader', 'loading consumer-components from the file-system, ids: {ids}', {
      ids: ids.toString()
    });
    const alreadyLoadedComponents = [];
    const idsToProcess: BitId[] = [];
    const invalidComponents: InvalidComponent[] = [];
    ids.forEach((id: BitId) => {
      if (!(id instanceof BitId)) {
        throw new TypeError(`consumer.loadComponents expects to get BitId instances, instead, got "${typeof id}"`);
      }
      const idWithVersion: BitId = getLatestVersionNumber(this.consumer.bitmapIds, id);
      const idStr = idWithVersion.toString();
      if (this._componentsCache[idStr]) {
        logger.debugAndAddBreadCrumb(
          'ComponentLoader',
          'the component {idStr} has been already loaded, use the cached component',
          { idStr }
        );
        alreadyLoadedComponents.push(this._componentsCache[idStr]);
      } else {
        idsToProcess.push(idWithVersion);
      }
    });
    if (!idsToProcess.length) return { components: alreadyLoadedComponents, invalidComponents };

    const driverExists = this.consumer.warnForMissingDriver(
      'Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run tag again.'
    );

    const allComponents = [];
    await pMapSeries(idsToProcess, async (id: BitId) => {
      const component = await this.loadOne(id, throwOnFailure, driverExists, invalidComponents);
      if (component) {
        this._componentsCache[component.id.toString()] = component;
        logger.debugAndAddBreadCrumb('ComponentLoader', 'Finished loading the component "{id}"', {
          id: component.id.toString()
        });
        allComponents.push(component);
      }
    });

    return { components: allComponents.concat(alreadyLoadedComponents), invalidComponents };
  }

  async loadOne(id: BitId, throwOnFailure: boolean, driverExists: boolean, invalidComponents: InvalidComponent[]) {
    const componentMap = this.consumer.bitMap.getComponent(id);
    let bitDir = this.consumer.getPath();
    if (componentMap.rootDir) {
      bitDir = path.join(bitDir, componentMap.rootDir);
    }
    const componentFromModel = await this.consumer.loadComponentFromModelIfExist(id);
    let component;
    try {
      component = await Component.loadFromFileSystem({
        bitDir,
        componentMap,
        id,
        consumer: this.consumer,
        componentFromModel
      });
    } catch (err) {
      if (throwOnFailure) throw err;

      logger.errorAndAddBreadCrumb('component-loader.loadOne', 'failed loading {id} from the file-system', {
        id: id.toString()
      });
      if (Component.isComponentInvalidByErrorType(err)) {
        invalidComponents.push({ id, error: err });
        return null;
      }
      throw err;
    }
    component.loadedFromFileSystem = true;
    component.originallySharedDir = componentMap.originallySharedDir || null;
    component.wrapDir = componentMap.wrapDir || null;
    // reload component map as it may be changed after calling Component.loadFromFileSystem()
    component.componentMap = this.consumer.bitMap.getComponent(id);
    component.componentFromModel = componentFromModel;
    await this._handleOutOfSyncScenarios(component);

    if (!driverExists) {
      // no need to resolve dependencies
      return component;
    }
    const loadDependencies = async () => {
      const dependencyResolver = new DependencyResolver(component, this.consumer, id);
      await dependencyResolver.loadDependenciesForComponent(
        bitDir,
        this.cacheResolvedDependencies,
        this.cacheProjectAst
      );
      updateDependenciesVersions(this.consumer, component);
    };
    await loadDependencies();
    return component;
  }

  async _handleOutOfSyncScenarios(component: Component) {
    const { componentFromModel, componentMap } = component;
    // $FlowFixMe componentMap is set here
    const currentId: BitId = componentMap.id;
    let newId: ?BitId;
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
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(currentId.changeVersion(null));
      if (modelComponent) {
        // the scope has this component but not the version used in .bitmap, sync .bitmap with
        // latest version from the scope
        await this._throwPendingImportIfNeeded(currentId);
        newId = currentId.changeVersion(modelComponent.latest());
        component.componentFromModel = await this.consumer.loadComponentFromModelIfExist(newId);
      } else if (!currentId.hasScope()) {
        // the scope doesn't have this component and .bitmap doesn't have scope, assume it's new
        newId = currentId.changeVersion(null);
      }
    }

    if (newId) {
      component.version = newId.version;
      component.scope = newId.scope;
      this.consumer.bitMap.updateComponentId(newId);
      component.componentMap = this.consumer.bitMap.getComponent(newId);
    }
  }

  async _throwPendingImportIfNeeded(currentId: BitId) {
    if (currentId.hasScope()) {
      const remoteComponent: ?ModelComponent = await this._getRemoteComponent(currentId);
      // $FlowFixMe version is set here
      if (remoteComponent && remoteComponent.hasVersion(currentId.version)) {
        throw new ComponentsPendingImport();
      }
    }
  }

  async _getRemoteComponent(id: BitId): Promise<?ModelComponent> {
    const remotes = await getScopeRemotes(this.consumer.scope);
    let componentsObjects;
    try {
      componentsObjects = await remotes.fetch([id], this.consumer.scope, false);
    } catch (err) {
      return null; // probably doesn't exist
    }
    const remoteComponent = await componentsObjects[0].toObjectsAsync(this.consumer.scope.objects);
    return remoteComponent.component;
  }

  _isAngularProject(): boolean {
    return Boolean(
      this.consumer.config.packageJsonObject &&
        this.consumer.config.packageJsonObject.dependencies &&
        this.consumer.config.packageJsonObject.dependencies[ANGULAR_PACKAGE_IDENTIFIER]
    );
  }

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
