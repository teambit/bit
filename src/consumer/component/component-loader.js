// @flow
import path from 'path';
import { Consumer } from '..';
import { BitIds, BitId } from '../../bit-id';
import logger from '../../logger/logger';
import { Analytics } from '../../analytics/analytics';
import Component from './consumer-component';
import type { InvalidComponent } from '../component/consumer-component';
import { getLatestVersionNumber } from '../../utils';
import { COMPONENT_ORIGINS } from '../../constants';
import { DependencyResolver, updateDependenciesVersions } from './dependencies/dependency-resolver';

export default class ComponentLoader {
  _componentsCache: Object = {}; // cache loaded components
  consumer: Consumer;
  constructor(consumer: Consumer) {
    this.consumer = consumer;
  }

  async loadMany(
    ids: BitIds,
    throwOnFailure: boolean = true
  ): Promise<{ components: Component[], invalidComponents: InvalidComponent[] }> {
    logger.debug(`loading consumer-components from the file-system, ids: ${ids.join(', ')}`);
    Analytics.addBreadCrumb(
      'load components',
      `loading consumer-components from the file-system, ids: ${Analytics.hashData(ids)}`
    );
    const alreadyLoadedComponents = [];
    const idsToProcess: BitId[] = [];
    const invalidComponents: InvalidComponent[] = [];
    ids.forEach((id: BitId) => {
      if (!(id instanceof BitId)) {
        throw new TypeError(`consumer.loadComponents expects to get BitId instances, instead, got "${typeof id}"`);
      }
      const idWithoutVersion = id.toStringWithoutVersion();
      if (this._componentsCache[idWithoutVersion]) {
        logger.debug(`the component ${idWithoutVersion} has been already loaded, use the cached component`);
        Analytics.addBreadCrumb(
          'load components',
          `the component ${Analytics.hashData(idWithoutVersion)} has been already loaded, use the cached component`
        );
        alreadyLoadedComponents.push(this._componentsCache[idWithoutVersion]);
      } else {
        idsToProcess.push(id);
      }
    });
    if (!idsToProcess.length) return { components: alreadyLoadedComponents, invalidComponents };

    const driverExists = this.consumer.warnForMissingDriver(
      'Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run commit again.'
    );

    const components = idsToProcess.map(async (id: BitId) => {
      return this.loadOne(id, throwOnFailure, driverExists, invalidComponents);
    });

    const allComponents = [];
    for (const componentP of components) {
      // load the components one after another (not in parallel).
      const component = await componentP; // eslint-disable-line no-await-in-loop
      if (component) {
        this._componentsCache[component.id.toStringWithoutVersion()] = component;
        logger.debug(`Finished loading the component, ${component.id.toString()}`);
        Analytics.addBreadCrumb(
          'load components',
          `Finished loading the component, ${Analytics.hashData(component.id.toString())}`
        );
        allComponents.push(component);
      }
    }

    return { components: allComponents.concat(alreadyLoadedComponents), invalidComponents };
  }

  async loadOne(id: BitId, throwOnFailure: boolean, driverExists: boolean, invalidComponents: InvalidComponent[]) {
    const idWithConcreteVersion: BitId = getLatestVersionNumber(this.consumer.bitmapIds, id);

    const componentMap = this.consumer.bitMap.getComponent(idWithConcreteVersion);
    let bitDir = this.consumer.getPath();
    if (componentMap.rootDir) {
      bitDir = path.join(bitDir, componentMap.rootDir);
    }
    const componentFromModel = await this.consumer.loadComponentFromModelIfExist(idWithConcreteVersion);
    let component;
    try {
      component = await Component.loadFromFileSystem({
        bitDir,
        componentMap,
        id: idWithConcreteVersion,
        consumer: this.consumer,
        componentFromModel
      });
    } catch (err) {
      if (throwOnFailure) throw err;

      logger.error(`failed loading ${id.toString()} from the file-system`);
      Analytics.addBreadCrumb(
        'load components',
        `failed loading ${Analytics.hashData(id.toString())} from the file-system`
      );
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
    component.componentMap = this.consumer.bitMap.getComponent(idWithConcreteVersion);
    component.componentFromModel = componentFromModel;

    if (!driverExists || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      // no need to resolve dependencies
      return component;
    }
    const loadDependencies = async () => {
      const dependencyResolver = new DependencyResolver(component, this.consumer, idWithConcreteVersion);
      await dependencyResolver.loadDependenciesForComponent(bitDir);
      await updateDependenciesVersions(this.consumer, component);
    };
    await loadDependencies();
    return component;
  }

  static getInstance(consumer: Consumer): ComponentLoader {
    return new ComponentLoader(consumer);
  }
}
