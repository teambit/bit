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

    if (!driverExists || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      // no need to resolve dependencies
      return component;
    }
    const loadDependencies = async () => {
      const dependencyResolver = new DependencyResolver(component, this.consumer, id);
      await dependencyResolver.loadDependenciesForComponent(bitDir, this.cacheResolvedDependencies);
      await updateDependenciesVersions(this.consumer, component);
    };
    await loadDependencies();
    return component;
  }

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
