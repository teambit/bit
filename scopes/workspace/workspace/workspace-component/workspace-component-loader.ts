import { Component, ComponentFS, ComponentID, Config, InvalidComponent, State, TagMap } from '@teambit/component';
import { BitId } from '@teambit/legacy-bit-id';
import mapSeries from 'p-map-series';
import { compact, fromPairs, groupBy, uniq } from 'lodash';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { MissingBitMapComponent } from '@teambit/legacy/dist/consumer/bit-map/exceptions';
import { getLatestVersionNumber } from '@teambit/legacy/dist/utils';
import { IssuesClasses } from '@teambit/component-issues';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { getMaxSizeForComponents, InMemoryCache } from '@teambit/legacy/dist/cache/in-memory-cache';
import { createInMemoryCache } from '@teambit/legacy/dist/cache/cache-factory';
import ComponentNotFoundInPath from '@teambit/legacy/dist/consumer/component/exceptions/component-not-found-in-path';
import { ComponentLoadOptions as LegacyComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import { Workspace } from '../workspace';
import { WorkspaceComponent } from './workspace-component';
import { MergeConfigConflict } from '../exceptions/merge-config-conflict';

type GetManyRes = {
  components: Component[];
  invalidComponents: InvalidComponent[];
};

type ComponentLoadOptions = LegacyComponentLoadOptions & {
  loadExtensions?: boolean;
  executeLoadSlot?: boolean;
};

type ComponentGetOneOptions = {
  resolveIdVersion?: boolean;
};

export class WorkspaceComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private envs: EnvsMain
  ) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
  }

  async getMany(ids: Array<ComponentID>, loadOpts?: ComponentLoadOptions, throwOnFailure = true): Promise<GetManyRes> {
    // console.log(
    //   '🚀 ~ file: workspace-component-loader.ts:40 ~ WorkspaceComponentLoader ~ getMany ~ getMany:',
    //   ids.map((i) => i.toString())
    // );
    // console.time('getMany');
    // console.time('getMany - load comps');
    const idsWithoutEmpty = compact(ids);
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      // We don't want to load extension or execute the load slot at this step
      // we will do it later
      // this important for better performance
      { loadExtensions: false, executeLoadSlot: false },
      loadOpts || {}
    );

    const loadOrCached: { idsToLoad: ComponentID[]; fromCache: Component[] } = { idsToLoad: [], fromCache: [] };
    idsWithoutEmpty.forEach((id) => {
      const componentFromCache = this.getFromCache(id, loadOpts);
      if (componentFromCache) {
        loadOrCached.fromCache.push(componentFromCache);
      } else {
        loadOrCached.idsToLoad.push(id);
      }
    }, loadOrCached);

    const groupedByIsCoreEnvs = groupBy(loadOrCached.idsToLoad, (id) => {
      return this.envs.isCoreEnv(id.toStringWithoutVersion());
    });

    const { components: coreEnvsComponents, invalidComponents: coreEnvsInvalidComponents } = await this.getAndLoadSlot(
      groupedByIsCoreEnvs.true || [],
      loadOptsWithDefaults,
      throwOnFailure,
      longProcessLogger
    );
    // if (groupedByIsCoreEnvs.true) {
    //   console.log(
    //     '🚀 ~ file: workspace-component-loader.ts:51 ~ WorkspaceComponentLoader ~ getMany ~ groupedByIsCoreEnvs.true:',
    //     groupedByIsCoreEnvs.true.map((id) => id.toString())
    //   );
    // }

    const { components: regularComponents, invalidComponents: regularInvalidComponents } = await this.getAndLoadSlot(
      groupedByIsCoreEnvs.false || [],
      loadOptsWithDefaults,
      throwOnFailure,
      longProcessLogger
    );

    const components = [...coreEnvsComponents, ...regularComponents, ...loadOrCached.fromCache];
    const invalidComponents = [...coreEnvsInvalidComponents, ...regularInvalidComponents];

    longProcessLogger.end();
    // console.log('\n-----------------------');
    // console.timeEnd('getMany');
    // console.log('-----------------------');
    return { components, invalidComponents };
  }

  private async getAndLoadSlot(
    ids: ComponentID[],
    loadOpts: ComponentLoadOptions,
    throwOnFailure = true,
    longProcessLogger
  ): Promise<GetManyRes> {
    if (!ids?.length) return { components: [], invalidComponents: [] };
    console.log(
      '🚀 ~ file: workspace-component-loader.ts:98 ~ WorkspaceComponentLoader ~ ids:',
      ids.map((i) => i.toString())
    );
    const { components, invalidComponents } = await this.getComponentsWithoutLoadExtensions(
      ids,
      loadOpts,
      throwOnFailure,
      longProcessLogger
    );

    const allExtensions: ExtensionDataList[] = components.map((component) => {
      return component.state._consumer.extensions;
    });
    // console.log("🚀 ~ file: workspace-component-loader.ts:108 ~ WorkspaceComponentLoader ~ allExtensions:", allExtensions)

    // Ensure we won't load the same extension many times
    const mergedExtensions = ExtensionDataList.mergeConfigs(allExtensions);
    await this.workspace.loadComponentsExtensions(mergedExtensions);

    const withAspects = await Promise.all(
      components.map((component) => {
        return this.executeLoadSlot(component);
      })
    );

    return { components: withAspects, invalidComponents };
  }

  private async getComponentsWithoutLoadExtensions(
    ids: ComponentID[],
    loadOpts: ComponentLoadOptions,
    throwOnFailure = true,
    longProcessLogger
  ) {
    const invalidComponents: InvalidComponent[] = [];
    const errors: { id: ComponentID; err: Error }[] = [];
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      // We don't want to load extension or execute the load slot at this step
      // we will do it later
      // this important for better performance
      { loadExtensions: false, executeLoadSlot: false },
      loadOpts || {}
    );

    const idsWithUpdatedVersions = compact(
      await Promise.all(
        ids.map(async (componentId) => {
          const inWs = await this.workspace.hasId(componentId);
          if (!inWs) return undefined;
          return this.resolveVersion(componentId);
        })
      )
    );
    const legacyIdsIndex = {};

    const legacyIds = idsWithUpdatedVersions.map((id) => {
      legacyIdsIndex[id._legacy.toString()] = id;
      return id._legacy;
    });
    if (ids.length > 100) {
      console.time('consumer.loadComponents');
    }

    const { components: legacyComponents, invalidComponents: legacyInvalidComponents } =
      await this.workspace.consumer.loadComponents(BitIds.fromArray(legacyIds), false, loadOpts);
    if (ids.length > 100) {
      console.timeEnd('consumer.loadComponents');
    }
    legacyInvalidComponents.forEach((invalidComponent) => {
      const entry = { id: legacyIdsIndex[invalidComponent.id.toString()], err: invalidComponent.error };
      if (ConsumerComponent.isComponentInvalidByErrorType(invalidComponent.error)) {
        if (throwOnFailure) throw invalidComponent.error;
        invalidComponents.push(entry);
      }
      if (
        this.isComponentNotExistsError(invalidComponent.error) ||
        invalidComponent.error instanceof ComponentNotFoundInPath
      ) {
        errors.push(entry);
      }
    });

    // await this.getConsumerComponent(id, loadOpts)

    const componentsP = Promise.all(
      legacyComponents.map(async (legacyComponent) => {
        const id = legacyIdsIndex[legacyComponent.id.toString()];
        longProcessLogger.logProgress(id.toString());
        return this.get(id, legacyComponent, undefined, undefined, loadOptsWithDefaults).catch((err) => {
          if (ConsumerComponent.isComponentInvalidByErrorType(err) && !throwOnFailure) {
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
      })
    );
    errors.forEach((err) => {
      this.logger.console(`failed loading component ${err.id.toString()}, see full error in debug.log file`);
      this.logger.warn(`failed loading component ${err.id.toString()}`, err.err);
    });
    const components = compact(await componentsP);
    return { components, invalidComponents };
  }

  async getInvalid(ids: Array<ComponentID>): Promise<InvalidComponent[]> {
    const idsWithoutEmpty = compact(ids);
    const errors: InvalidComponent[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    await mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      longProcessLogger.logProgress(id.toString());
      try {
        await this.workspace.consumer.loadComponent(id._legacy);
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
    const id = getOpts?.resolveIdVersion ? this.resolveVersion(componentId) : componentId;
    const fromCache = this.getFromCache(componentId, loadOpts);
    if (fromCache && useCache) {
      return fromCache;
    }
    const consumerComponent = legacyComponent || (await this.getConsumerComponent(id, loadOpts));
    // in case of out-of-sync, the id may changed during the load process
    const updatedId = consumerComponent ? ComponentID.fromLegacy(consumerComponent.id, id.scope) : id;
    const component = await this.loadOne(updatedId, consumerComponent, loadOpts);
    if (storeInCache) {
      this.addMultipleEnvsIssueIfNeeded(component); // it's in storeInCache block, otherwise, it wasn't fully loaded
      this.saveInCache(component, loadOpts);
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
    const bitIdWithVersion: BitId = getLatestVersionNumber(
      this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved,
      componentId._legacy
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
  }
  clearComponentCache(id: ComponentID) {
    const idStr = id.toString();
    for (const cacheKey of this.componentsCache.keys()) {
      if (cacheKey === idStr || cacheKey.startsWith(`${idStr}:`)) {
        this.componentsCache.delete(cacheKey);
      }
    }
  }

  private async loadOne(id: ComponentID, consumerComponent?: ConsumerComponent, loadOpts?: ComponentLoadOptions) {
    const componentFromScope = await this.workspace.scope.get(id);
    if (!consumerComponent) {
      if (!componentFromScope) throw new MissingBitMapComponent(id.toString());
      return componentFromScope;
    }
    const { extensions, errors } = await this.workspace.componentExtensions(id, componentFromScope, undefined, {
      loadExtensions: loadOpts?.loadExtensions,
    });
    if (errors?.some((err) => err instanceof MergeConfigConflict)) {
      consumerComponent.issues.getOrCreate(IssuesClasses.MergeConfigHasConflict).data = true;
    }

    // temporarily mutate consumer component extensions until we remove all direct access from legacy to extensions data
    // TODO: remove this once we remove all direct access from legacy code to extensions data
    consumerComponent.extensions = extensions;

    const state = new State(
      new Config(consumerComponent.mainFile, extensions),
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
    const bitIdWithVersion: BitId = getLatestVersionNumber(
      this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved,
      componentId._legacy
    );
    const id = bitIdWithVersion.version ? componentId.changeVersion(bitIdWithVersion.version) : componentId;
    const cacheKey = createComponentCacheKey(id, loadOpts);
    const fromCache = this.componentsCache.get(cacheKey);
    if (fromCache && fromCache.id._legacy.isEqual(id._legacy)) {
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
        BitIds.fromArray([id._legacy]),
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
      component.id._legacy,
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
  return `${id.toString()}:${JSON.stringify(sortKeys(loadOpts ?? {}))}`;
}

function sortKeys(obj: Object) {
  return fromPairs(Object.entries(obj).sort(([k1], [k2]) => k1.localeCompare(k2)));
}
