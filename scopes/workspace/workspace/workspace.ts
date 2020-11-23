import chalk from 'chalk';
import type { PubsubMain } from '@teambit/pubsub';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
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
} from '@teambit/component';
import { ComponentScopeDirMap } from '@teambit/config';
import {
  DependencyLifecycleType,
  DependencyResolverMain,
  PackageManagerInstallOptions,
  ComponentDependency,
  WorkspacePolicyEntry,
  DependencyList,
} from '@teambit/dependency-resolver';
import { EnvsMain, EnvsAspect, EnvServiceList } from '@teambit/envs';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony } from '@teambit/harmony';
import { IsolateComponentsOptions, IsolatorMain, Network } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { RequireableComponent } from '@teambit/modules.requireable-component';
import { ResolvedComponent } from '@teambit/modules.resolved-component';
import type { VariantsMain } from '@teambit/variants';
import { link, importAction } from 'bit-bin/dist/api/consumer';
import { ImportOptions } from 'bit-bin/dist/consumer/component-ops/import-components';
import { NothingToImport } from 'bit-bin/dist/consumer/exceptions';
import { BitId, BitIds } from 'bit-bin/dist/bit-id';
import { Consumer, loadConsumer } from 'bit-bin/dist/consumer';
import { GetBitMapComponentOptions } from 'bit-bin/dist/consumer/bit-map/bit-map';
import AddComponents from 'bit-bin/dist/consumer/component-ops/add-components';
import { AddActionResults } from 'bit-bin/dist/consumer/component-ops/add-components/add-components';
import ComponentsList from 'bit-bin/dist/consumer/component/components-list';
import { NoComponentDir } from 'bit-bin/dist/consumer/component/exceptions/no-component-dir';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import legacyLogger from 'bit-bin/dist/logger/logger';
import { buildOneGraphForComponents } from 'bit-bin/dist/scope/graph/components-graph';
import { pathIsInside } from 'bit-bin/dist/utils';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute } from 'bit-bin/dist/utils/path';
import BluebirdPromise from 'bluebird';
import findCacheDir from 'find-cache-dir';
import fs from 'fs-extra';
import { slice } from 'lodash';
import path, { join } from 'path';
import { difference } from 'ramda';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { ComponentConfigFile } from './component-config-file';
import { DependencyTypeNotSupportedInPolicy } from './exceptions';
import {
  ExtensionData,
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
import { Issues } from './workspace-component/issues';
import { WorkspaceComponentLoader } from './workspace-component/workspace-component-loader';

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

    readonly isolateEnv: IsolatorMain,

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
  async getComponentIssues(component: Component): Promise<Issues | null> {
    const issues = component.state._consumer.issues;
    if (!issues) return null;
    return Issues.fromLegacy(issues);
  }

  /**
   * provides status of all components in the workspace.
   */
  async getComponentStatus(component: Component): Promise<ComponentStatus> {
    const status = await this.consumer.getComponentStatusById(component.id._legacy);
    const hasModifiedDependencies = await this.hasModifiedDependencies(component);
    return ComponentStatus.fromLegacy(status, hasModifiedDependencies);
  }

  /**
   * list all workspace components.
   */
  async list(filter?: { offset: number; limit: number }): Promise<Component[]> {
    const legacyIds = this.consumer.bitMap.getAuthoredAndImportedBitIds();

    const ids = await this.resolveMultipleComponentIds(legacyIds);
    return this.getMany(filter && filter.limit ? slice(ids, filter.offset, filter.offset + filter.limit) : ids);
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
    const ids = bitIds.map((id) => this.resolveComponentId(id));
    return Promise.all(ids);
  }

  async getNewAndModifiedIds(): Promise<ComponentID[]> {
    const ids = await this.componentList.listTagPendingComponents();
    return this.resolveMultipleComponentIds(ids);
  }

  // TODO: refactor asap to get seeders as ComponentID[] not strings (most of the places already has it that way)
  async createNetwork(seeders: string[], opts: IsolateComponentsOptions = {}): Promise<Network> {
    const longProcessLogger = this.logger.createLongProcessLogger('create capsules network');
    legacyLogger.debug(`workspaceExt, createNetwork ${seeders.join(', ')}. opts: ${JSON.stringify(opts)}`);
    const legacySeedersIdsP = seeders.map(async (seeder) => {
      const componentId = await this.resolveComponentId(seeder);
      return componentId._legacy;
    });

    const legacySeedersIds = await Promise.all(legacySeedersIdsP);
    const graph = await buildOneGraphForComponents(legacySeedersIds, this.consumer);
    const seederIdsWithVersions = graph.getBitIdsIncludeVersionsFromGraph(legacySeedersIds, graph);
    const seedersStr = seederIdsWithVersions.map((s) => s.toString());
    const compsAndDeps = graph.findSuccessorsInGraph(seedersStr);
    const consumerComponents = compsAndDeps.filter((c) =>
      this.consumer.bitMap.getComponentIfExist(c.id, { ignoreVersion: true })
    );
    const ids = await Promise.all(consumerComponents.map(async (c) => this.resolveComponentId(c.id)));
    const components = await this.getMany(ids, true);
    opts.baseDir = opts.baseDir || this.consumer.getPath();
    const capsuleList = await this.isolateEnv.isolateComponents(components, opts);
    longProcessLogger.end();
    this.logger.consoleSuccess();
    return new Network(
      capsuleList,
      await Promise.all(seederIdsWithVersions.map(async (legacyId) => this.resolveComponentId(legacyId))),
      this.isolateEnv.getCapsulesRootDir(this.path)
    );
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
    const componentIdsP = ids.map((id) => this.resolveComponentId(id));
    const componentIds = await Promise.all(componentIdsP);
    const components = await this.getMany(componentIds);
    const isolatedEnvironment = await this.createNetwork(components.map((c) => c.id.toString()));
    const resolvedComponents = components.map((component) => {
      const capsule = isolatedEnvironment.graphCapsules.getCapsule(component.id);
      if (!capsule) throw new Error(`unable to find capsule for ${component.id.toString()}`);
      return new ResolvedComponent(component, capsule);
    });
    return resolvedComponents;
  }

  public async createAspectList(extensionDataList: ExtensionDataList) {
    const entiresP = extensionDataList.map(async (entry) => {
      return new AspectEntry(await this.resolveComponentId(entry.id), entry);
    });

    const entries = await Promise.all(entiresP);
    return this.componentAspect.createAspectListFromEntries(entries);
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(componentId: ComponentID, forCapsule = false, legacyComponent?: ConsumerComponent): Promise<Component> {
    return this.componentLoader.get(componentId, forCapsule, legacyComponent);
  }

  // TODO: @gilad we should refactor this asap into to the envs aspect.
  async getEnvSystemDescriptor(component: Component): Promise<ExtensionData> {
    const env = this.envs.getEnv(component);
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
    this.componentLoader.clearCache();
    this.componentList = new ComponentsList(this.consumer);
  }

  async triggerOnComponentChange(id: ComponentID): Promise<OnComponentEventResult[]> {
    const component = await this.get(id);
    // if a new file was added, upon component-load, its .bitmap entry is updated to include the
    // new file. write these changes to the .bitmap file so then other processes have access to
    // this new file. If the .bitmap wasn't change, it won't do anything.
    await this.consumer.bitMap.write();
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await BluebirdPromise.mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
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
    await BluebirdPromise.mapSeries(onAddEntries, async ([extension, onAddFunc]) => {
      const onAddResult = await onAddFunc(component);
      await this.graphql.pubsub.publish(ComponentAdded, { componentAdded: { component } });
      results.push({ extensionId: extension, results: onAddResult });
    });

    return results;
  }

  async triggerOnComponentRemove(id: ComponentID): Promise<OnComponentEventResult[]> {
    const onRemoveEntries = this.onComponentRemoveSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: SerializableResults }> = [];
    await BluebirdPromise.mapSeries(onRemoveEntries, async ([extension, onRemoveFunc]) => {
      const onRemoveResult = await onRemoveFunc(id);
      results.push({ extensionId: extension, results: onRemoveResult });
    });
    return results;
  }

  getState(id: ComponentID, hash: string) {
    return this.scope.getState(id, hash);
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

  // @gilad needs to implement on variants
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async byPattern(pattern: string): Promise<Component[]> {
    // @todo: this is a naive implementation, replace it with a real one.
    const all = await this.list();
    if (!pattern) return this.list();
    return all.filter((c) => {
      return c.id.toString({ ignoreVersion: true }) === pattern || c.id.fullName === pattern;
    });
  }

  async getMany(ids: Array<ComponentID>, forCapsule = false): Promise<Component[]> {
    return this.componentLoader.getMany(ids, forCapsule);
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
    await this.consumer.bitMap.write();
    return addResults;
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

    let mergedExtensions = ExtensionDataList.mergeConfigs(extensionsToMerge);

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
    const coreAspectsComponentIds = await Promise.all(coreAspectsStringIds.map((id) => BitId.parse(id, true)));
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
    return buildOneGraphForComponents(ids, this.consumer, 'normal', undefined, BitIds.fromArray(ignoredIds));
  }

  // TODO: refactor to aspect-loader after handling of default scope.
  async isCoreAspect(id: ComponentID) {
    const scope = await this.componentDefaultScope(id);
    if (!scope) throw new Error('default scope not defined');
    // const newId = id.changeScope(scope);
    // TODO: fix properly ASAP after resolving default scope issue.
    return this.aspectLoader.isCoreAspect(`teambit.bit/${id._legacy.toStringWithoutScope()}`);
  }

  private async filterCoreAspects(components: Component[]) {
    const promises = components.map(async (component) => {
      return {
        isCore: await this.isCoreAspect(component.id),
        component,
      };
    });

    const res = await Promise.all(promises);
    return res.filter((aspect) => !aspect.isCore).map((aspect) => aspect.component);
  }

  // remove this function
  async loadAspects(ids: string[], throwOnError = false): Promise<void> {
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return;
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds);
    const componentIds = await this.resolveMultipleComponentIds(idsWithoutCore);
    const components = await this.importAndGetMany(componentIds);
    const graph: any = await this.getGraphWithoutCore(components);

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
      if (data.type !== 'aspect')
        this.logger.debug(
          `${component.id.toString()} is configured in workspace.json, but using the ${
            data.type
          } environment. \n please make sure to either apply the aspect environment or a composition of the aspect environment for the aspect to load.`
        );
      return data.type === 'aspect';
    });

    // no need to filter core aspects as they are not included in the graph
    // here we are trying to load extensions from the workspace.
    try {
      const requireableExtensions: any = await this.requireComponents(aspects);
      await this.aspectLoader.loadRequireableExtensions(requireableExtensions, throwOnError);
    } catch (err) {
      // if extensions does not exist on workspace, try and load them from the local scope.
      await this.scope.loadAspects(aspects.map((aspect) => aspect.id.toString()));
    }
  }

  async resolveAspects(runtimeName: string) {
    let missingPaths = false;
    const stringIds: string[] = [];
    const ids = this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(ids, coreAspectsIds);
    const componentIds = await this.resolveMultipleComponentIds(userAspectsIds);
    const components = await this.getMany(componentIds);
    const aspectDefs = await this.aspectLoader.resolveAspects(components, async (component) => {
      stringIds.push(component.id._legacy.toString());
      const packageName = componentIdToPackageName(component.state._consumer);
      const localPath = path.join(this.path, 'node_modules', packageName);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }

      return {
        aspectPath: localPath,
        runtimesPath: await this.getRuntimePath(component, localPath, runtimeName),
      };
    });

    const coreAspectDefs = await Promise.all(
      coreAspectsIds.map(async (coreId) => {
        const rawDef = await getAspectDef(coreId, runtimeName);
        return this.aspectLoader.loadDefinition(rawDef);
      })
    );

    // due to lack of workspace and scope runtimes. TODO: fix after adding them.
    const workspaceAspects = coreAspectDefs.filter((coreAspect) => {
      return coreAspect.runtimePath;
    });

    if (missingPaths) {
      await link(stringIds, false);
    }

    return aspectDefs.concat(workspaceAspects);
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

  private async getCompiler(component: Component) {
    const env = this.envs.getEnv(component)?.env;
    return env?.getCompiler();
  }

  async getRuntimePath(component: Component, modulePath: string, runtime: string): Promise<string | null> {
    const runtimeFile = component.filesystem.files.find((file: AbstractVinyl) => {
      return file.relative.includes(`.${runtime}.runtime`);
    });

    // @david we should add a compiler api for this.
    if (!runtimeFile) return null;
    const compiler = await this.getCompiler(component);
    const dist = compiler.getDistPathBySrcPath(runtimeFile.relative);

    return join(modulePath, dist);
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
        const runtimePath = await this.getRuntimePath(component, localPath, MainRuntime.name);
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
    const components = await this.list();
    const legacyStringIds = components.map((component) => component.id._legacy.toString());
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({
      linkingOptions: { bitLinkType: 'link', linkCoreAspects: true },
    });
    const installationMap = await this.getComponentsDirectory([]);
    const packageJson = this.consumer.packageJson?.packageJsonObject || {};
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy();
    const policyFromPackageJson = this.dependencyResolver.getWorkspacePolicyFromPackageJson(packageJson);
    const mergedRootPolicy = this.dependencyResolver.mergeWorkspacePolices([policyFromPackageJson, workspacePolicy]);

    const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();

    const installOptions: PackageManagerInstallOptions = {
      dedupe: options?.dedupe,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
      dependencyFilterFn: depsFilterFn,
    };
    await installer.install(this.path, mergedRootPolicy, installationMap, installOptions);
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    // TODO: add the links results to the output
    this.logger.setStatusLine('linking components');
    await link(legacyStringIds, false);
    this.logger.consoleSuccess();
    return installationMap;
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
          return this.scope.resolveComponentId(id.toString());
        }
        const _bitMapIdWithoutVersion = _bitMapId.toStringWithoutVersion();
        const _bitMapIdWithVersion = _bitMapId.changeVersion(version).toString();
        // The id in the bitmap has prefix which is not in the source id - the bitmap entry has scope name
        // Handle use case 4
        if (_bitMapIdWithoutVersion.endsWith(idWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
          return this.scope.resolveComponentId(_bitMapIdWithVersion);
        }
        // The id in the bitmap doesn't have scope, the source id has scope
        // Handle use case 2 and use case 1
        if (idWithoutVersion.endsWith(_bitMapIdWithoutVersion) && _bitMapIdWithoutVersion !== idWithoutVersion) {
          if (id.toString().startsWith(this.scope.name)) {
            // Handle use case 1 - the provided id has scope name same as the local scope name
            // we want to send it as it appear in the bitmap
            return this.scope.resolveComponentId(_bitMapIdWithVersion);
          }
          // Handle use case 2 - the provided id has scope which is not the local scope
          // we want to search by the source id
          return this.scope.resolveComponentId(idWithVersion);
        }
        // Handle use case 3
        return this.scope.resolveComponentId(idWithVersion);
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

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>) {
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
