import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { getAspectDef } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import {
  Component,
  ComponentFactory,
  ComponentFS,
  ComponentID,
  ComponentMap,
  Config,
  State,
  TagMap,
} from '@teambit/component';
import { ComponentScopeDirMap } from '@teambit/config';
import {
  DependencyLifecycleType,
  DependencyResolverMain,
  PackageManagerInstallOptions,
  PolicyDep,
} from '@teambit/dependency-resolver';
import { EnvsMain } from '@teambit/environments';
import { GraphqlMain } from '@teambit/graphql';
import { Harmony } from '@teambit/harmony';
import { IsolateComponentsOptions, IsolatorMain, Network } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { RequireableComponent } from '@teambit/utils.requireable-component';
import { ResolvedComponent } from '@teambit/utils.resolved-component';
import type { VariantsMain } from '@teambit/variants';
import { link } from 'bit-bin/dist/api/consumer';
import { BitId, BitIds } from 'bit-bin/dist/bit-id';
import { Consumer, loadConsumer } from 'bit-bin/dist/consumer';
import { GetBitMapComponentOptions } from 'bit-bin/dist/consumer/bit-map/bit-map';
import AddComponents from 'bit-bin/dist/consumer/component-ops/add-components';
import { AddActionResults } from 'bit-bin/dist/consumer/component-ops/add-components/add-components';
import ComponentsList from 'bit-bin/dist/consumer/component/components-list';
import { NoComponentDir } from 'bit-bin/dist/consumer/component/exceptions/no-component-dir';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { ExtensionDataEntry, ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import legacyLogger from 'bit-bin/dist/logger/logger';
import { buildOneGraphForComponents } from 'bit-bin/dist/scope/graph/components-graph';
import { pathIsInside } from 'bit-bin/dist/utils';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute } from 'bit-bin/dist/utils/path';
import BluebirdPromise from 'bluebird';
import fs from 'fs-extra';
import { merge, slice } from 'lodash';
import path, { join } from 'path';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';

import { ComponentConfigFile } from './component-config-file';
import { DependencyTypeNotSupportedInPolicy } from './exceptions';
import { OnComponentAdd, OnComponentAddResult } from './on-component-add';
import { OnComponentChange, OnComponentChangeResult } from './on-component-change';
import { ExtensionData, OnComponentLoad } from './on-component-load';
import { WorkspaceExtConfig } from './types';
import { Watcher } from './watch/watcher';
import { WorkspaceComponent } from './workspace-component';
import { ComponentStatus } from './workspace-component/component-status';
import { WorkspaceAspect } from './workspace.aspect';
import { OnComponentAddSlot, OnComponentChangeSlot, OnComponentLoadSlot } from './workspace.provider';
import { Issues } from './workspace-component/issues';

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
  variants: string;
  lifecycleType: DependencyLifecycleType;
  dedupe: boolean;
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

  constructor(
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
    private onComponentLoadSlot: OnComponentLoadSlot,

    /**
     * on component change slot.
     */
    private onComponentChangeSlot: OnComponentChangeSlot,

    private envs: EnvsMain,

    /**
     * on component add slot.
     */
    private onComponentAddSlot: OnComponentAddSlot,

    private graphql: GraphqlMain
  ) {
    // TODO: refactor - prefer to avoid code inside the constructor.
    this.owner = this.config?.defaultOwner;
  }

  /**
   * watcher api.
   */
  readonly watcher = new Watcher(this);

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
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
    const isAutoTag = listAutoTagPendingComponents.find(
      (componentModal) => componentModal.id() === component.id._legacy.toStringWithoutVersion()
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
    const consumerComponents = await this.componentList.getAuthoredAndImportedFromFS();
    const idsP = consumerComponents.map((component) => {
      return this.resolveComponentId(component.id);
    });
    const ids = await Promise.all(idsP);
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
  getAllComponentIds(): ComponentID[] {
    const bitIds = this.consumer.bitMap.getAuthoredAndImportedBitIds();
    return bitIds.map((id) => new ComponentID(id));
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
    const components = await this.getMany(consumerComponents.map((c) => new ComponentID(c.id)));
    opts.baseDir = opts.baseDir || this.consumer.getPath();
    const capsuleList = await this.isolateEnv.isolateComponents(components, opts);
    longProcessLogger.end();
    this.logger.consoleSuccess();
    return new Network(
      capsuleList,
      graph,
      seederIdsWithVersions.map((s) => new ComponentID(s)),
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
   * fully load components, including dependency resolution and prepare them for runtime.
   */
  async load(ids: Array<BitId | string>): Promise<ResolvedComponent[]> {
    const componentIdsP = ids.map((id) => this.resolveComponentId(id));
    const componentIds = await Promise.all(componentIdsP);
    const components = await this.getMany(componentIds);
    const isolatedEnvironment = await this.createNetwork(components.map((c) => c.id.toString()));
    const capsulesMap = isolatedEnvironment.capsules.reduce((accum, curr) => {
      accum[curr.id.toString()] = curr.capsule;
      return accum;
    }, {});
    const ret = components.map((component) => new ResolvedComponent(component, capsulesMap[component.id.toString()]));
    return ret;
  }

  private async getConsumerComponent(id: ComponentID) {
    try {
      return await this.consumer.loadComponent(id._legacy);
    } catch (err) {
      return undefined;
    }
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(id: ComponentID): Promise<Component> {
    const consumerComponent = await this.getConsumerComponent(id);
    const component = await this.scope.get(id);
    if (!consumerComponent) {
      if (!component) throw new Error(`component ${id.toString()} does not exist on either workspace or scope.`);
      return component;
    }

    const extensionDataList = await this.componentExtensions(id, component);

    const state = new State(
      new Config(consumerComponent.mainFile, extensionDataList),
      this.componentAspect.createAspectList(extensionDataList),
      ComponentFS.fromVinyls(consumerComponent.files),
      consumerComponent.dependencies,
      consumerComponent
    );

    if (!component) {
      return this.executeLoadSlot(this.newComponentFromState(id, state));
    }

    component.state = state;
    const workspaceComponent = WorkspaceComponent.fromComponent(component, this);
    return this.executeLoadSlot(workspaceComponent);
  }

  async getEnvSystemDescriptor(component: Component): Promise<ExtensionData> {
    const env = this.envs.getEnv(component)?.env;
    if (env?.__getDescriptor && typeof env.__getDescriptor === 'function') {
      const systemDescriptor = await env.__getDescriptor();

      return {
        type: systemDescriptor.type,
      };
    }

    return {};
  }

  private async executeLoadSlot(component: Component) {
    const entries = this.onComponentLoadSlot.toArray();
    const promises = entries.map(async ([extension, onLoad]) => {
      const data = await onLoad(component);
      const existingExtension = component.state.config.extensions.findExtension(extension);
      if (existingExtension) existingExtension.data = merge(existingExtension.data, data);
      component.state.config.extensions.push(await this.getDataEntry(extension, data));
    });

    await Promise.all(promises);

    return component;
  }

  async triggerOnComponentChange(
    id: ComponentID
  ): Promise<Array<{ extensionId: string; results: OnComponentChangeResult }>> {
    const component = await this.get(id);
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: OnComponentChangeResult }> = [];
    await BluebirdPromise.mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
      const onChangeResult = await onChangeFunc(component);
      // TODO: find way to standardize event names.
      this.graphql.pubsub.publish(ComponentChanged, { componentChanged: { component } });
      results.push({ extensionId: extension, results: onChangeResult });
    });

    return results;
  }

  async triggerOnComponentAdd(id: ComponentID): Promise<Array<{ extensionId: string; results: OnComponentAddResult }>> {
    const component = await this.get(id);
    const onAddEntries = this.onComponentAddSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: OnComponentAddResult }> = [];
    await BluebirdPromise.mapSeries(onAddEntries, async ([extension, onAddFunc]) => {
      const onAddResult = await onAddFunc(component);
      this.graphql.pubsub.publish(ComponentAdded, { componentAdded: { component } });
      results.push({ extensionId: extension, results: onAddResult });
    });

    return results;
  }

  private async getDataEntry(extension: string, data: { [key: string]: any }): Promise<ExtensionDataEntry> {
    // TODO: @gilad we need to refactor the extension data entry api.
    return new ExtensionDataEntry(undefined, undefined, extension, undefined, data);
  }

  private newComponentFromState(id: ComponentID, state: State): Component {
    return new WorkspaceComponent(id, null, state, new TagMap(), this);
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
    const extensions = component?.config.extensions ?? new ExtensionDataList();
    // Add the default scope to the extension because we enforce it in config files
    await this.addDefaultScopeToExtensionsList(extensions);
    const componentDir = this.componentDir(id, { ignoreVersion: true });
    const componentConfigFile = new ComponentConfigFile(componentId, extensions, options.propagate);
    await componentConfigFile.write(componentDir, { override: options.override });
    return {
      configPath: ComponentConfigFile.composePath(componentDir),
    };
  }

  // @gilad needs to implement on variants
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async byPattern(pattern: string): Promise<Component[]> {
    // @todo: this is a naive implementation, replace it with a real one.
    const all = await this.list();
    if (!pattern) return this.list();
    return all.filter((c) => c.id.toString({ ignoreVersion: true }) === pattern);
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<ComponentID>): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const errors: { id: ComponentID; err: Error }[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    const componentsP = BluebirdPromise.mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      longProcessLogger.logProgress(id.toString());
      return this.get(id).catch((err) => {
        errors.push({
          id,
          err,
        });
        return undefined;
      });
    });
    const components = await componentsP;
    errors.forEach((err) => {
      if (!this.consumer.isLegacy) {
        this.logger.console(`failed loading component ${err.id.toString()}, see full error in debug.log file`);
      }
      this.logger.warn(`failed loading component ${err.id.toString()}`, err.err);
    });
    // remove errored components
    const filteredComponents: Component[] = compact(components);
    longProcessLogger.end();
    return filteredComponents;
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
    return this.componentDefaultScopeFromComponentDir(relativeComponentDir);
  }

  async componentDefaultScopeFromComponentDir(relativeComponentDir: PathOsBasedRelative): Promise<string | undefined> {
    const componentConfigFile = await this.componentConfigFileFromComponentDir(relativeComponentDir);
    if (componentConfigFile && componentConfigFile.defaultScope) {
      return componentConfigFile.defaultScope;
    }
    return this.componentDefaultScopeFromComponentDirWithoutConfigFile(relativeComponentDir);
  }

  private async componentDefaultScopeFromComponentDirWithoutConfigFile(
    relativeComponentDir: PathOsBasedRelative
  ): Promise<string | undefined> {
    const variantConfig = this.variants.byRootDir(relativeComponentDir);
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
      configFileExtensions = componentConfigFile.extensions;
      // do not merge from scope data when there is component config file
      // mergeFromScope = false;
    }
    const relativeComponentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    const variantConfig = this.variants.byRootDir(relativeComponentDir);
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
   * Check if a component is vendor component in the workspace
   *
   * @private
   * @param {BitId} componentId
   * @returns {boolean}
   * @memberof Workspace
   */
  private isVendorComponent(componentId: ComponentID): boolean {
    const relativeComponentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    return this.isVendorComponentByComponentDir(relativeComponentDir);
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
    return this.componentConfigFileFromComponentDir(relativeComponentDir);
  }

  private async componentConfigFileFromComponentDir(
    relativeComponentDir: PathOsBasedRelative
  ): Promise<ComponentConfigFile | undefined> {
    let componentConfigFile;
    if (relativeComponentDir) {
      const absComponentDir = this.componentDirToAbsolute(relativeComponentDir);
      const defaultScopeFromVariantsOrWs = await this.componentDefaultScopeFromComponentDirWithoutConfigFile(
        relativeComponentDir
      );
      componentConfigFile = await ComponentConfigFile.load(absComponentDir, defaultScopeFromVariantsOrWs);
    }

    return componentConfigFile;
  }

  async getGraphWithoutCore(components: Component[]) {
    const loadComponentsFunc = async (ids: BitId[]) => {
      const loadedComps = await this.getMany(ids.map((id) => new ComponentID(id)));
      return loadedComps.map((c) => c.state._consumer);
    };
    const ids = components.map((component) => component.id._legacy);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsComponentIds = await Promise.all(coreAspectsStringIds.map((id) => BitId.parse(id, true)));
    const coreAspectsBitIds = BitIds.fromArray(coreAspectsComponentIds.map((id) => id.changeScope(null)));
    return buildOneGraphForComponents(ids, this.consumer, 'normal', loadComponentsFunc, coreAspectsBitIds);
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
    const components = await this.getMany(componentIds);
    const graph: any = await this.getGraphWithoutCore(components);

    const allIdsP = graph.nodes().map(async (id) => {
      return this.resolveComponentId(id);
    });

    const allIds = await Promise.all(allIdsP);

    const allComponents = await this.getMany(allIds as ComponentID[]);

    const aspects = allComponents.filter((component: Component) => {
      const data = component.config.extensions.findExtension(WorkspaceAspect.id)?.data;

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
    const requireableExtensions: any = await this.requireComponents(aspects);
    await this.aspectLoader.loadRequireableExtensions(requireableExtensions, throwOnError);
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
      return extensionEntry.extensionId.toString();
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
      const resolvedPackagesWithType: PolicyDep[] = [];
      resolvedPackages.forEach((resolvedPackage) => {
        if (resolvedPackage.version) {
          resolvedPackagesWithType.push({
            version: resolvedPackage.version,
            packageName: resolvedPackage.packageName,
            lifecycleType: options?.lifecycleType || 'runtime',
          });
        }
      });
      if (!options?.variants) {
        this.dependencyResolver.updateRootPolicy(resolvedPackagesWithType, {
          updateExisting: options?.updateExisting ?? false,
        });
      } else {
        // TODO: implement
      }
      await this.dependencyResolver.persistConfig(this.path);
    }
    this.logger.debug(`installing dependencies in workspace with options`, options);
    const components = await this.list();
    const legacyStringIds = components.map((component) => component.id._legacy.toString());
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({
      linkingOptions: { bitLinkType: 'link', linkCoreAspects: true },
    });
    const installationMap = await this.getComponentsDirectory([]);
    const packageJson = this.consumer.packageJson?.packageJsonObject || {};
    const depsFromPJson = packageJson.dependencies || {};
    const devDepsFromPJson = packageJson.devDependencies || {};
    const peerDepsFromPJson = packageJson.peerDependencies || {};
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy() || {};
    const rootDepsObject = {
      dependencies: {
        ...depsFromPJson,
        ...workspacePolicy.dependencies,
      },
      devDependencies: {
        ...devDepsFromPJson,
      },
      peerDependencies: {
        ...peerDepsFromPJson,
        ...workspacePolicy.peerDependencies,
      },
    };

    const installOptions: PackageManagerInstallOptions = {
      dedupe: options?.dedupe,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot,
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents,
    };
    await installer.install(this.path, rootDepsObject, installationMap, installOptions);
    // TODO: add the links results to the output
    this.logger.setStatusLine('linking components');
    await link(legacyStringIds, false);
    this.logger.consoleSuccess();
    return installationMap;
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
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
    let legacyId;
    try {
      legacyId = this.consumer.getParsedId(id.toString(), true, true);
    } catch (err) {
      if (err.name === 'MissingBitMapComponent') {
        // if a component is coming from the scope, it doesn't have .bitmap entry
        legacyId = BitId.parse(id.toString(), true);
        return ComponentID.fromLegacy(legacyId);
      }
      throw err;
    }
    const relativeComponentDir = this.componentDirFromLegacyId(legacyId);
    const defaultScope = await this.componentDefaultScopeFromComponentDir(relativeComponentDir);
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
