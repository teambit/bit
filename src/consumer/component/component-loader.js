// @flow
import path from 'path';
import pMapSeries from 'p-map-series';
import type Consumer from '../consumer';
import { BitIds, BitId } from '../../bit-id';
import logger from '../../logger/logger';
import Component from './consumer-component';
import type { InvalidComponent } from '../component/consumer-component';
import { getLatestVersionNumber } from '../../utils';
import { COMPONENT_ORIGINS } from '../../constants';
import { DependencyResolver, updateDependenciesVersions } from './dependencies/dependency-resolver';
import { getScopeRemotes } from '../../scope/scope-remotes';
import { ModelComponent } from '../../scope/models';
import ComponentsPendingImport from '../component-ops/exceptions/components-pending-import';

export default class ComponentLoader {
  _componentsCache: Object = {}; // cache loaded components
  consumer: Consumer;
  cacheResolvedDependencies: Object;
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.cacheResolvedDependencies = {};
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
    let componentFromModel = await this.consumer.loadComponentFromModelIfExist(id);
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
    let newId;
    if (componentFromModel && !componentFromModel.scope && !componentMap.id.hasVersion()) {
      newId = componentMap.id.changeVersion(componentFromModel.version);
      this.consumer.bitMap.updateComponentId(newId);
      component.version = componentFromModel.version;
    }
    if (componentFromModel && componentFromModel.scope && !componentMap.id.hasVersion()) {
      newId = componentMap.id.changeVersion(componentFromModel.version).changeScope(componentFromModel.scope);
      this.consumer.bitMap.updateComponentId(newId);
      component.version = newId.version;
      component.scope = newId.scope;
    }
    if (!componentFromModel && componentMap.id.hasVersion() && !componentMap.id.hasScope()) {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(componentMap.id.changeVersion(null));
      if (modelComponent) {
        // consumer has tagged component with one version and the model component doesn't have that version. assume it's latest
        newId = componentMap.id.changeVersion(modelComponent.latest());
        componentFromModel = await this.consumer.loadComponentFromModelIfExist(newId);
      } else {
        // consumer has tagged component but the component is missing from the scope. assume it's new.
        newId = componentMap.id.changeVersion(null);
      }
      this.consumer.bitMap.updateComponentId(newId);
      component.version = newId.version;
    }
    if (!componentFromModel && componentMap.id.hasVersion() && componentMap.id.hasScope()) {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(componentMap.id.changeVersion(null));
      if (modelComponent) {
        const remoteComponent: ?ModelComponent = await this.getRemoteComponent(id);
        // $FlowFixMe version is set here
        if (remoteComponent && remoteComponent.hasVersion(componentMap.id.version)) {
          throw new ComponentsPendingImport();
        }
        newId = componentMap.id.changeVersion(modelComponent.latest());
        this.consumer.bitMap.updateComponentId(newId);
        component.version = newId.version;
        componentFromModel = await this.consumer.loadComponentFromModelIfExist(newId);
      } else {
        // another case, the component is not in the scope and also not in the remote.
        // TBD what should be done. for now, bit status shows the import-pending message,
        // which is good enough.
      }
    }

    component.loadedFromFileSystem = true;
    component.originallySharedDir = componentMap.originallySharedDir || null;
    component.wrapDir = componentMap.wrapDir || null;
    // reload component map as it may be changed after calling Component.loadFromFileSystem()
    component.componentMap = this.consumer.bitMap.getComponent(newId || id);
    component.componentFromModel = componentFromModel;

    if (!driverExists || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      // no need to resolve dependencies
      return component;
    }
    const loadDependencies = async () => {
      const dependencyResolver = new DependencyResolver(component, this.consumer, id);
      await dependencyResolver.loadDependenciesForComponent(bitDir, this.cacheResolvedDependencies);
      updateDependenciesVersions(this.consumer, component);
    };
    await loadDependencies();
    return component;
  }

  async getRemoteComponent(id: BitId): Promise<?ModelComponent> {
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

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
