import { Component, ComponentFS, ComponentID, Config, State, TagMap } from '@teambit/component';
import { BitId } from 'bit-bin/dist/bit-id';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import mapSeries from 'p-map-series';
import { compact } from 'ramda-adjunct';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { MissingBitMapComponent } from 'bit-bin/dist/consumer/bit-map/exceptions';
import { getLatestVersionNumber } from 'bit-bin/dist/utils';
import { ComponentNotFound } from 'bit-bin/dist/scope/exceptions';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config';
import ComponentNotFoundInPath from 'bit-bin/dist/consumer/component/exceptions/component-not-found-in-path';

import { Workspace } from '../workspace';
import { WorkspaceComponent } from './workspace-component';

export class WorkspaceComponentLoader {
  _componentsCache: { [idStr: string]: Component } = {}; // cache loaded components
  _componentsCacheForCapsule: { [idStr: string]: Component } = {}; // cache loaded components for capsule, must not use the cache for the workspace
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain
  ) {}

  async getMany(ids: Array<ComponentID>, forCapsule = false): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const errors: { id: ComponentID; err: Error }[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    const componentsP = mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      longProcessLogger.logProgress(id.toString());
      return this.get(id, forCapsule).catch((err) => {
        if (this.isComponentNotExistsError(err)) {
          errors.push({
            id,
            err,
          });
          return undefined;
        }
        throw err;
      });
    });
    const components = await componentsP;
    errors.forEach((err) => {
      if (!this.workspace.consumer.isLegacy) {
        this.logger.console(`failed loading component ${err.id.toString()}, see full error in debug.log file`);
      }
      this.logger.warn(`failed loading component ${err.id.toString()}`, err.err);
    });
    // remove errored components
    const filteredComponents: Component[] = compact(components);
    longProcessLogger.end();
    return filteredComponents;
  }

  async get(
    componentId: ComponentID,
    forCapsule = false,
    legacyComponent?: ConsumerComponent,
    useCache = true,
    storeInCache = true
  ): Promise<Component> {
    const bitIdWithVersion: BitId = getLatestVersionNumber(
      this.workspace.consumer.bitmapIdsFromCurrentLane,
      componentId._legacy
    );
    const id = bitIdWithVersion.version ? componentId.changeVersion(bitIdWithVersion.version) : componentId;
    const fromCache = this.getFromCache(id, forCapsule);
    if (fromCache && useCache) {
      return fromCache;
    }
    const consumerComponent = legacyComponent || (await this.getConsumerComponent(id, forCapsule));
    const component = await this.loadOne(id, consumerComponent);
    if (storeInCache) {
      this.saveInCache(component, forCapsule);
    }
    return component;
  }

  clearCache() {
    this._componentsCache = {};
    this._componentsCacheForCapsule = {};
  }
  clearComponentCache(id: ComponentID) {
    const idStr = id.toString();
    delete this._componentsCache[idStr];
    delete this._componentsCacheForCapsule[idStr];
  }

  private async loadOne(id: ComponentID, consumerComponent?: ConsumerComponent) {
    const componentFromScope = await this.workspace.scope.get(id);
    if (!consumerComponent) {
      if (!componentFromScope) throw new MissingBitMapComponent(id.toString());
      return componentFromScope;
    }

    let extensionDataList = await this.workspace.componentExtensions(id, componentFromScope);
    const extensionsFromConsumerComponent = consumerComponent.extensions || new ExtensionDataList();
    // Merge extensions added by the legacy code in memory (for example data of dependency resolver)
    extensionDataList = ExtensionDataList.mergeConfigs([extensionsFromConsumerComponent, extensionDataList]);

    // temporarily mutate consumer component extensions until we remove all direct access from legacy to extensions data
    // TODO: remove this once we remove all direct access from legacy code to extensions data
    consumerComponent.extensions = extensionDataList;

    const state = new State(
      new Config(consumerComponent.mainFile, extensionDataList),
      await this.workspace.createAspectList(extensionDataList),
      ComponentFS.fromVinyls(consumerComponent.files),
      consumerComponent.dependencies,
      consumerComponent
    );
    if (componentFromScope) {
      componentFromScope.state = state;
      const workspaceComponent = WorkspaceComponent.fromComponent(componentFromScope, this.workspace);
      return this.executeLoadSlot(workspaceComponent);
    }
    return this.executeLoadSlot(this.newComponentFromState(id, state));
  }

  private saveInCache(component: Component, forCapsule: boolean): void {
    if (forCapsule) {
      this._componentsCacheForCapsule[component.id.toString()] = component;
    } else {
      this._componentsCache[component.id.toString()] = component;
    }
  }

  private getFromCache(id: ComponentID, forCapsule: boolean) {
    return forCapsule ? this._componentsCacheForCapsule[id.toString()] : this._componentsCache[id.toString()];
  }

  private async getConsumerComponent(id: ComponentID, forCapsule = false) {
    try {
      return forCapsule
        ? await this.workspace.consumer.loadComponentForCapsule(id._legacy)
        : await this.workspace.consumer.loadComponent(id._legacy);
    } catch (err) {
      // don't return undefined for any error. otherwise, if the component is invalid (e.g. main
      // file is missing) it returns the model component later unexpectedly, or if it's new, it
      // shows MissingBitMapComponent error incorrectly.
      this.logger.error(`failed loading component ${id.toString()}`, err);
      if (this.isComponentNotExistsError(err)) {
        return undefined;
      }
      throw err;
    }
  }

  private isComponentNotExistsError(err: Error): boolean {
    return (
      err instanceof ComponentNotFound ||
      err instanceof MissingBitMapComponent ||
      err instanceof ComponentNotFoundInPath
    );
  }

  private async executeLoadSlot(component: Component) {
    const entries = this.workspace.onComponentLoadSlot.toArray();
    const promises = entries.map(async ([extension, onLoad]) => {
      const data = await onLoad(component);
      return this.upsertExtensionData(component, extension, data);
    });

    // Special load events which runs from the workspace but should run from the correct aspect
    // TODO: remove this once those extensions dependent on workspace
    const envsData = await this.workspace.getEnvSystemDescriptor(component);
    // Move to deps resolver main runtime once we switch ws<> deps resolver direction
    const dependencies = await this.dependencyResolver.extractDepsFromLegacy(component);
    const policy = await this.dependencyResolver.mergeVariantPolicies(component.config.extensions);

    const depResolverData = {
      dependencies,
      policy: policy.serialize(),
    };

    promises.push(this.upsertExtensionData(component, DependencyResolverAspect.id, depResolverData));
    promises.push(this.upsertExtensionData(component, EnvsAspect.id, envsData));

    await Promise.all(promises);

    // Update the aspect list to have changes happened during the on load slot (new data added above)
    const updatedAspectList = await this.workspace.createAspectList(component.state.config.extensions);
    component.state.aspects = updatedAspectList;
    return component;
  }

  private newComponentFromState(id: ComponentID, state: State): Component {
    return new WorkspaceComponent(id, null, state, new TagMap(), this.workspace);
  }

  private async upsertExtensionData(component: Component, extension: string, data: any) {
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
