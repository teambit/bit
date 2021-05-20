import chalk from 'chalk';
import mapSeries from 'p-map-series';
import type { PubsubMain } from '@teambit/pubsub';
import { IssuesList } from '@teambit/component-issues';
import type { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { getAspectDef } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import {
  AspectEntry,
  ComponentMain,
  Component,
  ComponentFactory,
  ComponentID,
  ComponentMap,
  AspectList,
  AspectData,
} from '@teambit/component';
import { ComponentScopeDirMap } from '@teambit/config';
import {
  DependencyLifecycleType,
  DependencyResolverMain,
  PackageManagerInstallOptions,
  ComponentDependency,
  WorkspacePolicyEntry,
  LinkingOptions,
  LinkResults,
  DependencyList,
} from '@teambit/dependency-resolver';
import { EnvsMain, EnvsAspect, EnvServiceList, DEFAULT_ENV } from '@teambit/envs';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony } from '@teambit/harmony';
import { IsolatorMain } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { isMatchNamespacePatternItem } from '@teambit/workspace.modules.match-pattern';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { ResolvedComponent } from '@teambit/harmony.modules.resolved-component';
import type { VariantsMain } from '@teambit/variants';
import { link, importAction } from '@teambit/legacy/dist/api/consumer';
import LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import { ImportOptions } from '@teambit/legacy/dist/consumer/component-ops/import-components';
import { NothingToImport } from '@teambit/legacy/dist/consumer/exceptions';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { BitId, InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import AddComponents from '@teambit/legacy/dist/consumer/component-ops/add-components';
import type {
  AddActionResults,
  Warnings,
} from '@teambit/legacy/dist/consumer/component-ops/add-components/add-components';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { NoComponentDir } from '@teambit/legacy/dist/consumer/component/exceptions/no-component-dir';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { buildOneGraphForComponents } from '@teambit/legacy/dist/scope/graph/components-graph';
import { pathIsInside } from '@teambit/legacy/dist/utils';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import findCacheDir from 'find-cache-dir';
import fs from 'fs-extra';
import { slice, uniqBy } from 'lodash';
import path, { join } from 'path';
import { difference } from 'ramda';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import type { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import { ComponentConfigFile } from './component-config-file';
import { DependencyTypeNotSupportedInPolicy } from './exceptions';
import {
  OnComponentAdd,
  OnComponentChange,
  OnComponentEventResult,
  OnComponentLoad,
  OnComponentRemove,
  SerializableResults,
} from './on-component-events';
import { WorkspaceExtConfig } from './types';
import { Watcher } from './watch/watcher';
import { ComponentStatus } from './workspace-component/component-status';
import {
  OnComponentAddSlot,
  OnComponentChangeSlot,
  OnComponentLoadSlot,
  OnComponentRemoveSlot,
} from './workspace.provider';
import { WorkspaceComponentLoader } from './workspace-component/workspace-component-loader';
import { IncorrectEnvAspect } from './exceptions/incorrect-env-aspect';

export type EjectConfResult = {
  configPath: string;
};

export const ComponentAdded = 'componentAdded';
export const ComponentChanged = 'componentChanged';

export interface EjectConfOptions {
  propagate?: boolean;
  override?: boolean;
}

export type WorkspaceInstallOptions = {
  variants?: string;
  lifecycleType?: DependencyLifecycleType;
  dedupe: boolean;
  import: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  updateExisting: boolean;
};

export type WorkspaceLinkOptions = LinkingOptions;

export type TrackData = {
  rootDir: PathOsBasedRelative; // path relative to the workspace
  componentName?: string; // if empty, it'll be generated from the path
  mainFile?: string; // if empty, attempts will be made to guess the best candidate
};

export type TrackResult = { componentName: string; files: string[]; warnings: Warnings };

const DEFAULT_VENDOR_DIR = 'vendor';

/**
 * API of the Bit Workspace
 */
export class Workspace implements ComponentFactory {
  priority = true;
  owner?: string;
  componentsScopeDirsMap: ComponentScopeDirMap;
  componentLoader: WorkspaceComponentLoader;
  constructor(
    /**
     * private pubsub.
     */
    private pubsub: PubsubMain,

    private config: WorkspaceExtConfig,
    /**
     * private access to the legacy consumer instance.
     */
    public consumer: Consumer,

    /**
     * access to the workspace `Scope` instance
     */
    readonly scope: ScopeMain,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentAspect: ComponentMain,

    private isolator: IsolatorMain,

    private dependencyResolver: DependencyResolverMain,

    private variants: VariantsMain,

    private aspectLoader: AspectLoaderMain,

    private logger: Logger,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony,

    /**
     * on component load slot.
     */
    public onComponentLoadSlot: OnComponentLoadSlot,

    /**
     * on component change slot.
     */
    private onComponentChangeSlot: OnComponentChangeSlot,

    private envs: EnvsMain,

    /**
     * on component add slot.
     */
    private onComponentAddSlot: OnComponentAddSlot,

    private onComponentRemoveSlot: OnComponentRemoveSlot,

    private graphql: GraphqlMain
  ) {
    // TODO: refactor - prefer to avoid code inside the constructor.
    this.owner = this.config?.defaultOwner;
    this.componentLoader = new WorkspaceComponentLoader(this, logger, dependencyResolver);
    this.validateConfig();
  }

  private validateConfig() {
    const defaultScope = this.config.defaultScope;
    if (this.consumer.isLegacy) return;
    if (!defaultScope) throw new Error('defaultScope is missing');
    if (!isValidScopeName(defaultScope)) throw new InvalidScopeName(defaultScope);
  }

  /**
   * watcher api.
   */
  readonly watcher = new Watcher(this, this.pubsub);

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
  }

  get isLegacy(): boolean {
    return this.consumer.isLegacy;
  }

  onComponentLoad(loadFn: OnComponentLoad) {
    this.onComponentLoadSlot.register(loadFn);
    return this;
  }

  registerOnComponentChange(onComponentChangeFunc: OnComponentChange) {
    this.onComponentChangeSlot.register(onComponentChangeFunc);
    return this;
  }

  registerOnComponentAdd(onComponentAddFunc: OnComponentAdd) {
    this.onComponentAddSlot.register(onComponentAddFunc);
    return this;
  }

  registerOnComponentRemove(onComponentRemoveFunc: OnComponentRemove) {
    this.onComponentRemoveSlot.register(onComponentRemoveFunc);
    return this;
  }

  /**
   * name of the workspace as configured in either `workspace.json`.
   * defaults to workspace root directory name.
   */
  get name() {
    if (this.config.name) return this.config.name;
    const tokenizedPath = this.path.split('/');
    return tokenizedPath[tokenizedPath.length - 1];
  }

  get icon() {
    return this.config.icon;
  }

  async hasModifiedDependencies(component: Component) {
    const componentsList = new ComponentsList(this.consumer);
    const listAutoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
    const isAutoTag = listAutoTagPendingComponents.find((consumerComponent) =>
      consumerComponent.id.isEqualWithoutVersion(component.id._legacy)
    );
    if (isAutoTag) return true;
    return false;
  }

  /**
   * get Component issues
   */
  async getComponentIssues(component: Component): Promise<IssuesList | null> {
    return component.state._consumer.issues || null;
  }

  /**
   * provides status of all components in the workspace.
   */
  async getComponentStatus(component: Component): Promise<ComponentStatus> {
    const status = await this.consumer.getComponentStatusById(component.id._legacy);
    const hasModifiedDependencies = await this.hasModifiedDependencies(component);
    return ComponentStatus.fromLegacy(status, hasModifiedDependencies, component.isOutdated());
  }

  /**
   * list all workspace components.
   */
  async list(filter?: { offset: number; limit: number }): Promise<Component[]> {
    const legacyIds = this.consumer.bitMap.getAllIdsAvailableOnLane();
    const ids = await this.resolveMultipleComponentIds(legacyIds);
    return this.getMany(filter && filter.limit ? slice(ids, filter.offset, filter.offset + filter.limit) : ids);
  }

  /**
   * get ids of all workspace components.
   */
  async listIds(): Promise<ComponentID[]> {
    return this.resolveMultipleComponentIds(this.consumer.bitmapIdsFromCurrentLane);
  }

  /**
   * Check if a specific id exist in the workspace
   * @param componentId
   */
  async hasId(componentId: ComponentID): Promise<boolean> {
    const ids = await this.listIds();
    const found = ids.find((id) => {
      return id.isEqual(componentId);
    });
    return !!found;
  }

  /**
   * Check if a specific id exist in the workspace or in the scope
   * @param componentId
   */
  async hasIdNested(componentId: ComponentID, includeCache = true): Promise<boolean> {
    const found = await this.hasId(componentId);
    if (found) return found;
    return this.scope.hasIdNested(componentId, includeCache);
  }

  /**
   * list all modified components in the workspace.
   */
  async modified() {
    const ids: any = await this.componentList.listModifiedComponents(false);
    const componentIds = ids.map(ComponentID.fromLegacy);
    return this.getMany(componentIds);
  }

  /**
   * list all new components in the workspace.
   */
  async newComponents() {
    const ids: any = await this.componentList.listNewComponents(false);
    const componentIds = ids.map(ComponentID.fromLegacy);
    return this.getMany(componentIds);
  }

  /**
   * get all workspace component-ids, include vendor components.
   * (exclude nested dependencies in case dependencies are saved as components and not packages)
   */
  getAllComponentIds(): Promise<ComponentID[]> {
    const bitIds = this.consumer.bitMap.getAuthoredAndImportedBitIds();
    return this.resolveMultipleComponentIds(bitIds);
  }

  async getNewAndModifiedIds(): Promise<ComponentID[]> {
    const ids = await this.componentList.listTagPendingComponents();
    return this.resolveMultipleComponentIds(ids);
  }

  async getLogs(id: ComponentID): Promise<ComponentLog[]> {
    return this.scope.getLogs(id);
  }

  async getLegacyGraph(ids?: ComponentID[]): Promise<LegacyGraph> {
    if (!ids || ids.length < 1) ids = await this.listIds();

    const legacyIds = ids.map((id) => id._legacy);

    const legacyGraph = await buildOneGraphForComponents(legacyIds, this.consumer);
    return legacyGraph;
  }

  async loadCapsules(bitIds: string[]) {
    // throw new Error("Method not implemented.");
    const components = await this.load(bitIds);
    return components.map((comp) => comp.capsule);
  }
  /**
   * fully load components, including dependency resolution and prepare them for runtime.
   * @todo: remove the string option, use only BitId
   */
  async load(ids: Array<BitId | string>): Promise<ResolvedComponent[]> {
    const componentIds = await this.resolveMultipleComponentIds(ids);
    const components = await this.getMany(componentIds);
    const network = await this.isolator.isolateComponents(components.map((c) => c.id));
    const resolvedComponents = components.map((component) => {
      const capsule = network.graphCapsules.getCapsule(component.id);
      if (!capsule) throw new Error(`unable to find capsule for ${component.id.toString()}`);
      return new ResolvedComponent(component, capsule);
    });
    return resolvedComponents;
  }

  public async createAspectList(extensionDataList: ExtensionDataList) {
    const entiresP = extensionDataList.map(async (entry) => {
      return new AspectEntry(await this.resolveComponentId(entry.id), entry);
    });

    const entries: AspectEntry[] = await Promise.all(entiresP);
    return this.componentAspect.createAspectListFromEntries(entries);
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(
    componentId: ComponentID,
    forCapsule = false,
    legacyComponent?: ConsumerComponent,
    useCache = true,
    storeInCache = true
  ): Promise<Component> {
    this.logger.debug(`get ${componentId.toString()}`);
    return this.componentLoader.get(componentId, forCapsule, legacyComponent, useCache, storeInCache);
  }

  // TODO: @gilad we should refactor this asap into to the envs aspect.
  async getEnvSystemDescriptor(component: Component): Promise<AspectData> {
    const env = this.envs.calculateEnv(component);
    if (env.env.__getDescriptor && typeof env.env.__getDescriptor === 'function') {
      const systemDescriptor = await env.env.__getDescriptor();
      // !important persist services only on the env itself.
      let services: undefined | EnvServiceList;
      if (this.envs.isEnvRegistered(component.id.toString())) services = this.envs.getServices(env);
      const icon = this.aspectLoader.getDescriptor(env.id).icon || env.env.icon;

      return {
        type: systemDescriptor.type,
        id: env.id,
        name: env.name,
        icon,
        description: env.description,
        services: services?.toObject(),
      };
    }

    return {};
  }

  clearCache() {
    this.logger.debug('clearing the workspace and scope caches');
    this.componentLoader.clearCache();
    this.scope.clearCache();
    this.componentList = new ComponentsList(this.consumer);
  }

  clearComponentCache(id: ComponentID) {
    this.componentLoader.clearComponentCache(id);
    this.consumer.componentLoader.clearOneComponentCache(id._legacy);
    this.componentList = new ComponentsList(this.consumer);
  }

  async triggerOnComponentChange(id: ComponentID): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    // if a new file was added, upon component-load, its .bitmap entry is updated to include the
    // new file. write these changes to the .bitmap file so then other processes have access to
    // this new file. If the .bitmap wasn't change, it won't do anything.
    await this.consumer.bitMap.write(this.consumer.componentFsCache);
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
      const onChangeResult = await onChangeFunc(component);
      // TODO: find way to standardize event names.
      await this.graphql.pubsub.publish(ComponentChanged, { componentChanged: { component } });
      results.push({ extensionId: extension, results: onChangeResult });
    });

    return results;
  }

  async triggerOnComponentAdd(id: ComponentID): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    const onAddEntries = this.onComponentAddSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onAddEntries, async ([extension, onAddFunc]) => {
      const onAddResult = await onAddFunc(component);
      await this.graphql.pubsub.publish(ComponentAdded, { componentAdded: { component } });
      results.push({ extensionId: extension, results: onAddResult });
    });

    return results;
  }

  async triggerOnComponentRemove(id: ComponentID): Promise<OnComponentEventResult[]> {
    const onRemoveEntries = this.onComponentRemoveSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await mapSeries(onRemoveEntries, async ([extension, onRemoveFunc]) => {
      const onRemoveResult = await onRemoveFunc(id);
      results.push({ extensionId: extension, results: onRemoveResult });
    });
    return results;
  }

  getState(id: ComponentID, hash: string) {
    return this.scope.getState(id, hash);
  }

  getSnap(id: ComponentID, hash: string) {
    return this.scope.getSnap(id, hash);
  }

  getDefaultExtensions(): ExtensionDataList {
    if (!this.config.extensions) {
      return new ExtensionDataList();
    }
    return ExtensionDataList.fromConfigObject(this.config.extensions);
  }

  async ejectConfig(id: ComponentID, options: EjectConfOptions): Promise<EjectConfResult> {
    const componentId = await this.resolveComponentId(id);
    const component = await this.scope.get(componentId);
    const aspects = component?.state.aspects
      ? await this.resolveScopeAspectListIds(component?.state.aspects)
      : await this.createAspectList(new ExtensionDataList());

    const componentDir = this.componentDir(id, { ignoreVersion: true });
    const componentConfigFile = new ComponentConfigFile(componentId, aspects, options.propagate);
    await componentConfigFile.write(componentDir, { override: options.override });
    return {
      configPath: ComponentConfigFile.composePath(componentDir),
    };
  }

  private async resolveScopeAspectListIds(aspectListFromScope: AspectList): Promise<AspectList> {
    const resolvedList = await aspectListFromScope.pmap(async (entry) => {
      if (entry.id.scope !== this.scope.name) {
        return entry;
      }
      const newId = await this.resolveComponentId(entry.id.fullName);
      const newEntry = new AspectEntry(newId, entry.legacy);
      return newEntry;
    });
    return resolvedList;
  }

  /**
   * load components into the workspace through a variants pattern.
   * @param pattern variants.
   * @param scope scope name.
   */
  async byPattern(pattern: string, scope = '**'): Promise<Component[]> {
    const ids = await this.listIds();
    const finalPattern = `${scope}/${pattern || '**'}`;
    const targetIds = ids.filter((id) => {
      const spec = isMatchNamespacePatternItem(id.toStringWithoutVersion(), finalPattern);
      return spec.match;
    });

    const components = await this.getMany(targetIds);
    return components;
  }

  async getMany(ids: Array<ComponentID>, forCapsule = false): Promise<Component[]> {
    return this.componentLoader.getMany(ids, forCapsule);
  }

  getManyByLegacy(components: ConsumerComponent[]): Promise<Component[]> {
    return mapSeries(components, async (component) => {
      const id = await this.resolveComponentId(component.id);
      return this.get(id, undefined, component);
    });
  }

  /**
   * This will make sure to fetch the objects prior to load them
   * do not use it if you are not sure you need it.
   * It will influence the performance
   * currently it used only for get many of aspects
   * @param ids
   * @param forCapsule
   */
  async importAndGetMany(ids: Array<ComponentID>, forCapsule = false): Promise<Component[]> {
    await this.scope.import(ids);
    return this.componentLoader.getMany(ids, forCapsule);
  }

  /**
   * @deprecated use this.track() instead
   * track a new component. (practically, add it to .bitmap).
   *
   * @param componentPaths component paths relative to the workspace dir
   * @param id if not set, will be concluded from the filenames
   * @param main if not set, will try to guess according to some strategies and throws if failed
   * @param override whether add details to an existing component or re-define it
   */
  async add(
    componentPaths: PathOsBasedRelative[],
    id?: string,
    main?: string,
    override = false
  ): Promise<AddActionResults> {
    const addComponent = new AddComponents({ consumer: this.consumer }, { componentPaths, id, main, override });
    const addResults = await addComponent.add();
    // @todo: the legacy commands have `consumer.onDestroy()` on command completion, it writes the
    //  .bitmap file. workspace needs a similar mechanism. once done, remove the next line.
    await this.consumer.bitMap.write(this.consumer.componentFsCache);
    return addResults;
  }

  /**
   * add a new component to the .bitmap file.
   * this method only adds the records in memory but doesn't persist to the filesystem.
   * to write the .bitmap file once completed, run "await this.consumer.writeBitMap();"
   */
  async track(trackData: TrackData): Promise<TrackResult> {
    const addComponent = new AddComponents(
      { consumer: this.consumer },
      { componentPaths: [trackData.rootDir], id: trackData.componentName, main: trackData.mainFile, override: false }
    );
    const result = await addComponent.add();
    const addedComponent = result.addedComponents[0];
    const componentName = addedComponent?.id.name || (trackData.componentName as string);
    const files = addedComponent?.files.map((f) => f.relativePath) || [];
    return { componentName, files, warnings: result.warnings };
  }

  /**
   * Get the component root dir in the file system (relative to workspace or full)
   * @param componentId
   * @param relative return the path relative to the workspace or full path
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    return this.componentDirFromLegacyId(componentId._legacy, bitMapOptions, options);
  }

  private componentDirFromLegacyId(
    bitId: BitId,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    const componentMap = this.consumer.bitMap.getComponent(bitId, bitMapOptions);
    const relativeComponentDir = componentMap.getComponentDir();
    if (!relativeComponentDir) {
      throw new NoComponentDir(bitId.toString());
    }
    if (options.relative) {
      return relativeComponentDir;
    }

    return path.join(this.path, relativeComponentDir);
  }

  componentDirToAbsolute(relativeComponentDir: PathOsBasedRelative): PathOsBasedAbsolute {
    return path.join(this.path, relativeComponentDir);
  }

  async componentDefaultScope(componentId: ComponentID): Promise<string | undefined> {
    const relativeComponentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    return this.componentDefaultScopeFromComponentDirAndName(relativeComponentDir, componentId.fullName);
  }

  async componentDefaultScopeFromComponentDirAndName(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<string | undefined> {
    const componentConfigFile = await this.componentConfigFileFromComponentDirAndName(relativeComponentDir, name);
    if (componentConfigFile && componentConfigFile.defaultScope) {
      return componentConfigFile.defaultScope;
    }
    return this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(relativeComponentDir, name);
  }

  get defaultScope() {
    return this.config.defaultScope;
  }

  private async componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<string | undefined> {
    const variantConfig = this.variants.byRootDirAndName(relativeComponentDir, name);
    if (variantConfig && variantConfig.defaultScope) {
      return variantConfig.defaultScope;
    }
    const isVendor = this.isVendorComponentByComponentDir(relativeComponentDir);
    if (!isVendor) {
      return this.config.defaultScope;
    }
    return undefined;
  }

  /**
   * Calculate the component config based on:
   * the component.json file in the component folder
   * matching pattern in the variants config
   * defaults extensions from workspace config
   *
   * @param {ComponentID} componentId
   * @param {Component} [componentFromScope]
   * @returns {Promise<ExtensionDataList>}
   * @memberof Workspace
   */
  async componentExtensions(componentId: ComponentID, componentFromScope?: Component): Promise<ExtensionDataList> {
    // TODO: consider caching this result
    let configFileExtensions;
    let variantsExtensions;
    let wsDefaultExtensions;
    const mergeFromScope = true;
    const scopeExtensions = componentFromScope?.config?.extensions || new ExtensionDataList();

    const componentConfigFile = await this.componentConfigFile(componentId);
    if (componentConfigFile) {
      configFileExtensions = componentConfigFile.aspects.toLegacy();
      // do not merge from scope data when there is component config file
      // mergeFromScope = false;
    }
    const relativeComponentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    const variantConfig = this.variants.byRootDirAndName(relativeComponentDir, componentId.fullName);
    if (variantConfig) {
      variantsExtensions = variantConfig.extensions;
      // Do not merge from scope when there is specific variant (which is not *) that match the component
      // if (variantConfig.maxSpecificity > 0) {
      //   mergeFromScope = false;
      // }
    }
    const isVendor = this.isVendorComponentByComponentDir(relativeComponentDir);
    if (!isVendor) {
      wsDefaultExtensions = this.getDefaultExtensions();
    }
    // We don't stop on each step because we want to merge the default scope even if propagate=false but the default scope is not defined
    const extensionsToMerge: ExtensionDataList[] = [];
    if (configFileExtensions) {
      extensionsToMerge.push(configFileExtensions);
    }
    let continuePropagating = componentConfigFile?.propagate ?? true;
    if (variantsExtensions && continuePropagating) {
      // Put it in the start to make sure the config file is stronger
      extensionsToMerge.push(variantsExtensions);
    }
    continuePropagating = continuePropagating && (variantConfig?.propagate ?? true);
    // Do not apply default extensions on the default extensions (it will create infinite loop when loading them)
    const isDefaultExtension = wsDefaultExtensions.findExtension(componentId.toString(), true, true);
    if (wsDefaultExtensions && continuePropagating && !isDefaultExtension) {
      // Put it in the start to make sure the config file is stronger
      extensionsToMerge.push(wsDefaultExtensions);
    }

    // It's before the scope extensions, since there is no need to resolve extensions from scope they are already resolved
    // await Promise.all(extensionsToMerge.map((extensions) => this.resolveExtensionsList(extensions)));

    if (mergeFromScope && continuePropagating) {
      extensionsToMerge.push(scopeExtensions);
    }

    // It's important to do this resolution before the merge, otherwise we have issues with extensions
    // coming from scope with local scope name, as opposed to the same extension comes from the workspace with default scope name
    const promises = extensionsToMerge.map((list) => this.resolveExtensionListIds(list));
    await Promise.all(promises);

    let mergedExtensions = ExtensionDataList.mergeConfigs(extensionsToMerge).filterRemovedExtensions();

    // remove self from merged extensions
    const selfInMergedExtensions = mergedExtensions.findExtension(
      componentId._legacy.toStringWithoutScopeAndVersion(),
      true,
      true
    );
    if (selfInMergedExtensions && selfInMergedExtensions.extensionId) {
      mergedExtensions = mergedExtensions.remove(selfInMergedExtensions.extensionId);
    }

    return mergedExtensions;
  }

  /**
   * This will mutate the entries with extensionId prop to have resolved legacy id
   * This should be worked on the extension data list not the new aspect list
   * @param extensionList
   */
  private async resolveExtensionListIds(extensionList: ExtensionDataList): Promise<ExtensionDataList> {
    const promises = extensionList.map(async (entry) => {
      if (entry.extensionId) {
        const id = await this.resolveComponentId(entry.extensionId);
        entry.extensionId = id._legacy;
      }

      return entry;
    });
    await Promise.all(promises);
    return extensionList;
  }

  private isVendorComponentByComponentDir(relativeComponentDir: PathOsBasedRelative): boolean {
    const vendorDir = this.config.vendor?.directory || DEFAULT_VENDOR_DIR;
    if (pathIsInside(relativeComponentDir, vendorDir)) {
      return true;
    }
    // TODO: implement
    return false;
  }

  /**
   * return the component config from its folder (component.json)
   * @param componentId
   */
  private async componentConfigFile(id: ComponentID): Promise<ComponentConfigFile | undefined> {
    const relativeComponentDir = this.componentDir(id, { ignoreVersion: true }, { relative: true });
    return this.componentConfigFileFromComponentDirAndName(relativeComponentDir, id.fullName);
  }

  private async componentConfigFileFromComponentDirAndName(
    relativeComponentDir: PathOsBasedRelative,
    name: string
  ): Promise<ComponentConfigFile | undefined> {
    let componentConfigFile;
    if (relativeComponentDir) {
      const absComponentDir = this.componentDirToAbsolute(relativeComponentDir);
      const defaultScopeFromVariantsOrWs = await this.componentDefaultScopeFromComponentDirAndNameWithoutConfigFile(
        relativeComponentDir,
        name
      );
      componentConfigFile = await ComponentConfigFile.load(
        absComponentDir,
        this.createAspectList.bind(this),
        defaultScopeFromVariantsOrWs
      );
    }

    return componentConfigFile;
  }

  async getGraphWithoutCore(components: Component[]) {
    const ids = components.map((component) => component.id._legacy);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsComponentIds = coreAspectsStringIds.map((id) => BitId.parse(id, true));
    const coreAspectsBitIds = BitIds.fromArray(coreAspectsComponentIds.map((id) => id.changeScope(null)));
    // const aspectsIds = components.reduce((acc, curr) => {
    //   const currIds = curr.state.aspects.ids;
    //   acc = acc.concat(currIds);
    //   return acc;
    // }, [] as any);
    // const otherDependenciesMap = components.reduce((acc, curr) => {
    //   // const currIds = curr.state.dependencies.dependencies.map(dep => dep.id.toString());
    //   const currMap = curr.state.dependencies.getIdsMap();
    //   Object.assign(acc, currMap);
    //   return acc;
    // }, {});

    // const depsWhichAreNotAspects = difference(Object.keys(otherDependenciesMap), aspectsIds);
    // const depsWhichAreNotAspectsBitIds = depsWhichAreNotAspects.map((strId) => otherDependenciesMap[strId]);
    // We only want to load into the graph components which are aspects and not regular dependencies
    // This come to solve a circular loop when an env aspect use an aspect (as regular dep) and the aspect use the env aspect as its env
    // TODO: @gilad it causes many issues we need to find a better solution. removed for now.
    const ignoredIds = coreAspectsBitIds.concat([]);
    return buildOneGraphForComponents(ids, this.consumer, undefined, BitIds.fromArray(ignoredIds));
  }

  // remove this function
  async loadAspects(ids: string[] = [], throwOnError = false): Promise<void> {
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return;
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds);
    const componentIds = await this.resolveMultipleComponentIds(idsWithoutCore);
    const components = await this.importAndGetMany(componentIds);
    const graph = await this.getGraphWithoutCore(components);

    const allIdsP = graph.nodes().map(async (id) => {
      return this.resolveComponentId(id);
    });

    const allIds = await Promise.all(allIdsP);
    const allComponents = await this.getMany(allIds as ComponentID[]);

    const aspects = allComponents.filter((component: Component) => {
      let data = component.config.extensions.findExtension(EnvsAspect.id)?.data;
      if (!data) {
        // TODO: remove this once we re-export old components used to store the data here
        data = component.state.aspects.get('teambit.workspace/workspace');
      }

      if (!data) return false;
      if (data.type !== 'aspect' && idsWithoutCore.includes(component.id.toString())) {
        const err = new IncorrectEnvAspect(component.id.toString(), data.type, data.id);
        if (data.id === DEFAULT_ENV) {
          // when cloning a project, or when the node-modules dir is deleted, nothing works and all
          // components are default to the DEFAULT_ENV, which is node-env. we must allow "bit
          // install" to prepare the workspace and let the proper the envs to be loaded
          this.logger.error(err.message);
        } else {
          throw err;
        }
      }
      return data.type === 'aspect';
    });
    // no need to filter core aspects as they are not included in the graph
    // here we are trying to load extensions from the workspace.
    const { workspaceComps, scopeComps } = await this.groupComponentsByWorkspaceAndScope(aspects);
    if (workspaceComps.length) {
      const requireableExtensions: any = await this.requireComponents(workspaceComps);
      await this.aspectLoader.loadRequireableExtensions(requireableExtensions, throwOnError);
    }
    if (scopeComps.length) {
      await this.scope.loadAspects(scopeComps.map((aspect) => aspect.id.toString()));
    }
  }

  async resolveAspects(runtimeName?: string, componentIds?: ComponentID[]): Promise<AspectDefinition[]> {
    let missingPaths = false;
    const stringIds: string[] = [];
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(idsToResolve, coreAspectsIds);
    const componentIdsToResolve = await this.resolveMultipleComponentIds(userAspectsIds);
    const { workspaceIds, scopeIds } = await this.groupIdsByWorkspaceAndScope(componentIdsToResolve);
    const wsComponents = await this.getMany(workspaceIds);
    const aspectDefs = await this.aspectLoader.resolveAspects(wsComponents, async (component) => {
      stringIds.push(component.id._legacy.toString());
      const packageName = componentIdToPackageName(component.state._consumer);
      const localPath = path.join(this.path, 'node_modules', packageName);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }

      return {
        aspectPath: localPath,
        runtimePath: runtimeName ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName) : null,
      };
    });

    let scopeAspectDefs: AspectDefinition[] = [];
    if (scopeIds.length) {
      scopeAspectDefs = await this.scope.resolveAspects(runtimeName, scopeIds);
    }

    let coreAspectDefs = await Promise.all(
      coreAspectsIds.map(async (coreId) => {
        const rawDef = await getAspectDef(coreId, runtimeName);
        return this.aspectLoader.loadDefinition(rawDef);
      })
    );

    // due to lack of workspace and scope runtimes. TODO: fix after adding them.
    if (runtimeName) {
      coreAspectDefs = coreAspectDefs.filter((coreAspect) => {
        return coreAspect.runtimePath;
      });
    }

    if (missingPaths) {
      await link(stringIds, false);
    }

    const allDefs = aspectDefs.concat(coreAspectDefs).concat(scopeAspectDefs);
    const uniqDefs = uniqBy(allDefs, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName) {
      defs = defs.filter((def) => def.runtimePath);
    }

    return defs;
  }

  private async groupIdsByWorkspaceAndScope(
    ids: ComponentID[]
  ): Promise<{ workspaceIds: ComponentID[]; scopeIds: ComponentID[] }> {
    const workspaceIds: ComponentID[] = [];
    const scopeIds: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const existOnWorkspace = await this.hasId(id);
        existOnWorkspace ? workspaceIds.push(id) : scopeIds.push(id);
      })
    );
    return { workspaceIds, scopeIds };
  }

  private async groupComponentsByWorkspaceAndScope(
    components: Component[]
  ): Promise<{ workspaceComps: Component[]; scopeComps: Component[] }> {
    const workspaceComps: Component[] = [];
    const scopeComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existOnWorkspace = await this.hasId(component.id);
        existOnWorkspace ? workspaceComps.push(component) : scopeComps.push(component);
      })
    );
    return { workspaceComps, scopeComps };
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionDataList, throwOnError = false): Promise<void> {
    const extensionsIdsP = extensions.map(async (extensionEntry) => {
      // Core extension
      if (!extensionEntry.extensionId) {
        return extensionEntry.stringId;
      }

      const id = await this.resolveComponentId(extensionEntry.extensionId);
      // return this.resolveComponentId(extensionEntry.extensionId);
      return id.toString();
    });
    const extensionsIds = await Promise.all(extensionsIdsP);
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    if (!extensionsToLoad.length) return;
    await this.loadAspects(extensionsToLoad, throwOnError);
  }

  /**
   * Provides a cache folder, unique per key.
   * Return value may be undefined, if workspace folder is unconventional (bare-scope, no node_modules, etc)
   */
  getTempDir(
    /*
     * unique key, i.e. aspect or component id
     */
    id: string
  ) {
    const PREFIX = 'bit';
    const cacheDir = findCacheDir({ name: join(PREFIX, id), create: true });

    return cacheDir;
  }

  async requireComponents(components: Component[]): Promise<RequireableComponent[]> {
    let missingPaths = false;
    const stringIds: string[] = [];
    const resolveP = components.map(async (component) => {
      stringIds.push(component.id._legacy.toString());
      const packageName = componentIdToPackageName(component.state._consumer);
      const localPath = path.join(this.path, 'node_modules', packageName);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }

      const requireFunc = async () => {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const aspect = require(localPath);
        // require aspect runtimes
        const runtimePath = await this.aspectLoader.getRuntimePath(component, localPath, MainRuntime.name);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        if (runtimePath) require(runtimePath);
        return aspect;
      };
      return new RequireableComponent(component, requireFunc);
    });
    const resolved = await Promise.all(resolveP);
    // Make sure to link missing components
    if (missingPaths) {
      await link(stringIds, false);
    }
    return resolved;
  }

  private async getComponentsDirectory(ids: ComponentID[]) {
    const components = ids.length ? await this.getMany(ids) : await this.list();
    return ComponentMap.as<string>(components, (component) => this.componentDir(component.id));
  }

  /**
   * Install dependencies for all components in the workspace
   *
   * @returns
   * @memberof Workspace
   */
  async install(packages?: string[], options?: WorkspaceInstallOptions) {
    if (packages && packages.length) {
      if (!options?.variants && options?.lifecycleType === 'dev') {
        throw new DependencyTypeNotSupportedInPolicy(options?.lifecycleType);
      }
      this.logger.debug(`installing the following packages: ${packages.join()}`);
      const resolver = this.dependencyResolver.getVersionResolver();
      const resolvedPackagesP = packages.map((packageName) =>
        resolver.resolveRemoteVersion(packageName, {
          rootDir: this.path,
        })
      );
      const resolvedPackages = await Promise.all(resolvedPackagesP);
      const newWorkspacePolicyEntries: WorkspacePolicyEntry[] = [];
      resolvedPackages.forEach((resolvedPackage) => {
        if (resolvedPackage.version) {
          newWorkspacePolicyEntries.push({
            dependencyId: resolvedPackage.packageName,
            value: {
              version: resolvedPackage.version,
            },
            lifecycleType: options?.lifecycleType || 'runtime',
          });
        }
      });
      if (!options?.variants) {
        this.dependencyResolver.addToRootPolicy(newWorkspacePolicyEntries, {
          updateExisting: options?.updateExisting ?? false,
        });
      } else {
        // TODO: implement
      }
      await this.dependencyResolver.persistConfig(this.path);
    }
    if (options?.import) {
      this.logger.setStatusLine('importing missing objects');
      await this.importObjects();
      this.logger.consoleSuccess();
    }
    this.logger.console(
      `installing dependencies in workspace using ${chalk.cyan(this.dependencyResolver.getPackageManagerName())}`
    );
    this.logger.debug(`installing dependencies in workspace with options`, options);
    this.clearCache();
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({});
    const compDirMap = await this.getComponentsDirectory([]);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();

    const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();

    const pmInstallOptions: PackageManagerInstallOptions = {
      dedupe: options?.dedupe,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
      dependencyFilterFn: depsFilterFn,
    };
    await installer.install(this.path, mergedRootPolicy, compDirMap, { installTeambitBit: false }, pmInstallOptions);
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    // TODO: add the links results to the output
    await this.link({
      linkTeambitBit: true,
      legacyLink: true,
      linkCoreAspects: true,
      linkNestedDepsInNM: !this.isLegacy,
    });
    await this.consumer.componentFsCache.deleteAllDependenciesDataCache();
    return compDirMap;
  }

  async link(options?: WorkspaceLinkOptions): Promise<LinkResults> {
    const compDirMap = await this.getComponentsDirectory([]);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const linker = this.dependencyResolver.getLinker({
      rootDir: this.path,
      linkingOptions: options,
    });
    const res = await linker.link(this.path, mergedRootPolicy, compDirMap, options);
    return res;
  }

  /**
   * Generate a filter to pass to the installer
   * This will filter deps which are come from remotes which defined in scope.json
   * those components comes from local remotes, usually doesn't have a package in a registry
   * so no reason to try to install them (it will fail)
   */
  private async generateFilterFnForDepsFromLocalRemote() {
    // TODO: once scope create a new API for this, replace it with the new one
    const remotes = await this.scope._legacyRemotes();
    return (dependencyList: DependencyList): DependencyList => {
      const filtered = dependencyList.filter((dep) => {
        if (!(dep instanceof ComponentDependency)) {
          return true;
        }
        if (remotes.isHub(dep.componentId.scope)) {
          return true;
        }
        return false;
      });
      return filtered;
    };
  }

  // TODO: replace with a proper import API on the workspace
  private async importObjects() {
    const importOptions: ImportOptions = {
      ids: [],
      verbose: false,
      merge: false,
      objectsOnly: true,
      withEnvironments: false,
      override: false,
      writeDists: false,
      writeConfig: false,
      installNpmPackages: false,
      writePackageJson: false,
      importDependenciesDirectly: false,
      importDependents: false,
    };
    try {
      const res = await importAction({ tester: false, compiler: false }, importOptions, []);
      return res;
    } catch (err) {
      // TODO: this is a hack since the legacy throw an error, we should provide a way to not throw this error from the legacy
      if (err instanceof NothingToImport) {
        // Do not write nothing to import warning
        return undefined;
      }
      throw err;
    }
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
    this.clearCache();
  }

  // TODO: should we return here the dir as it defined (aka components) or with /{name} prefix (as it used in legacy)
  get defaultDirectory(): string {
    return this.config.defaultDirectory;
  }

  get legacyDefaultDirectory(): string {
    if (this.defaultDirectory && !this.defaultDirectory.includes('{name}')) {
      return `${this.defaultDirectory}/{name}`;
    }
    return this.defaultDirectory;
  }

  /**
   * Transform the id to ComponentId and get the exact id as appear in bitmap
   *
   * @param {(string | ComponentID | BitId)} id
   * @returns {Promise<ComponentID>}
   * @memberof Workspace
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    let legacyId = this.consumer.getParsedIdIfExist(id.toString(), true, true);
    if (!legacyId) {
      try {
        const idWithVersion = id.toString();
        const [idWithoutVersion, version] = id.toString().split('@');
        const _bitMapId = this.consumer.getParsedIdIfExist(idWithoutVersion, false, true);
        // This logic is very specific, and very sensitive for changes please do not touch this without consulting with @ran or @gilad
        // example (partial list) cases which should be handled are:
        // use case 1 - ws component provided with the local scope name:
        // source id        : my-scope1/my-name1
        // bitmap res (_id) : my-name1 (comp is tagged but not exported)
        // local scope name : my-scope1
        // scope content    : my-name1
        // expected result  : my-name1
        // use case 2 - component with same name exist in ws and scope (but with different scope name)
        // source id        : my-scope2/my-name1
        // bitmap res (_id) : my-name1 (comp exist in ws but it's actually different component)
        // local scope name : my-scope1
        // scope content    : my-scope2/my-name1
        // expected result  : my-scope2/my-name1
        // use case 3 - component with same name exist in ws and scope (but with different scope name) - source provided without scope name
        // source id        : my-name1
        // bitmap res (_id) : my-name1 (comp exist in ws but it's actually different component)
        // local scope name : my-scope1
        // scope content    : my-scope1/my-name1 and my-scope2/my-name1
        // expected result  : my-name1 (get the name from the bitmap)
        // use case 4 - component with the same name and different scope are imported into the ws
        // source id        : my-name1
        // bitmap res (_id) : my-scope2/my-name1 (comp exist in ws from different scope (imported))
        // local scope name : my-scope1
        // scope content    : my-scope2/my-name1
        // expected result  : my-scope2/my-name1 (get the name from the bitmap)

        // No entry in bitmap at all, search for the original input id
        if (!_bitMapId) {
          return await this.scope.resolveComponentId(id.toString());
        }
        const _bitMapIdWithoutVersion = _bitMapId.toStringWithoutVersion();
        const _bitMapIdWithVersion = _bitMapId.changeVersion(version).toString();
        // The id in the bitmap has prefix which is not in the source id - the bitmap entry has scope name
        // Handle use case 4
        if (_bitMapIdWithoutVersion.endsWith(idWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
          return await this.scope.resolveComponentId(_bitMapIdWithVersion);
        }
        // The id in the bitmap doesn't have scope, the source id has scope
        // Handle use case 2 and use case 1
        if (idWithoutVersion.endsWith(_bitMapIdWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
          if (id.toString().startsWith(this.scope.name)) {
            // Handle use case 1 - the provided id has scope name same as the local scope name
            // we want to send it as it appear in the bitmap
            return await this.scope.resolveComponentId(_bitMapIdWithVersion);
          }
          // Handle use case 2 - the provided id has scope which is not the local scope
          // we want to search by the source id
          return await this.scope.resolveComponentId(idWithVersion);
        }
        // Handle use case 3
        return await this.scope.resolveComponentId(idWithVersion);
      } catch (error) {
        legacyId = BitId.parse(id.toString(), true);
        return ComponentID.fromLegacy(legacyId);
      }
    }
    const relativeComponentDir = this.componentDirFromLegacyId(legacyId, undefined, { relative: true });
    const defaultScope = await this.componentDefaultScopeFromComponentDirAndName(
      relativeComponentDir,
      legacyId.toStringWithoutScopeAndVersion()
    );
    return ComponentID.fromLegacy(legacyId, defaultScope);
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>): Promise<ComponentID[]> {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  /**
   * This will mutate the original extensions list and resolve it's ids
   *
   * @param {ExtensionDataList} extensions
   * @returns {Promise<void[]>}
   * @memberof Workspace
   */
  resolveExtensionsList(extensions: ExtensionDataList): Promise<void[]> {
    const resolveMergedExtensionsP = extensions.map(async (extensionEntry) => {
      if (extensionEntry.extensionId) {
        // const hasVersion = extensionEntry.extensionId.hasVersion();
        // const useBitmapVersion = !hasVersion;
        // const resolvedId = await this.resolveComponentId(extensionEntry.extensionId, true, useBitmapVersion);

        // Assuming extensionId always has scope - do not allow extension id without scope
        const resolvedId = await this.resolveComponentId(extensionEntry.extensionId);
        extensionEntry.extensionId = resolvedId._legacy;
      }
    });
    return Promise.all(resolveMergedExtensionsP);
  }

  /**
   * This will mutate the original extensions list and make sure all extensions has the ids with the scope / default scope
   *
   * @param {ExtensionDataList} extensions
   * @returns {Promise<void[]>}
   * @memberof Workspace
   */
  addDefaultScopeToExtensionsList(extensions: ExtensionDataList): Promise<void[]> {
    const resolveMergedExtensionsP = extensions.map(async (extensionEntry) => {
      if (extensionEntry.extensionId && !extensionEntry.extensionId.hasScope()) {
        const componentId = ComponentID.fromLegacy(extensionEntry.extensionId);
        const defaultScope = await this.componentDefaultScope(componentId);
        extensionEntry.extensionId = extensionEntry.extensionId.changeScope(defaultScope);
      }
    });
    return Promise.all(resolveMergedExtensionsP);
  }
}

export default Workspace;
