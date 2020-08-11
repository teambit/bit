import path from 'path';
import fs from 'fs-extra';
import { slice } from 'lodash';
import { Harmony } from '@teambit/harmony';
import BluebirdPromise from 'bluebird';
import { merge } from 'lodash';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';
import { Consumer, loadConsumer } from '../../consumer';
import { link } from '../../api/consumer';
import { ScopeExtension } from '../scope';
import { Component, ComponentID, ComponentExtension, State, ComponentFactory, ComponentFS, TagMap } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { BitId } from '../../bit-id';
import { IsolatorExtension, Network } from '../isolator';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative, PathOsBased } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { DependencyResolverExtension } from '../dependency-resolver';
import { WorkspaceExtConfig } from './types';
import { Logger } from '../logger';
import { VariantsExtension } from '../variants';
import { ComponentScopeDirMap } from '../config/workspace-config';
import legacyLogger from '../../logger/logger';
import { ComponentConfigFile } from './component-config-file';
import { ExtensionDataList, ExtensionDataEntry } from '../../consumer/config/extension-data';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';
import { pathIsInside } from '../../utils';
import Config from '../component/config';
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';
import { OnComponentLoadSlot, OnComponentChangeSlot } from './workspace.provider';
import { OnComponentLoad } from './on-component-load';
import { OnComponentChange, OnComponentChangeResult } from './on-component-change';
import { IsolateComponentsOptions } from '../isolator/isolator.extension';
import { ComponentMap } from '../component';
import { ComponentStatus } from './workspace-component/component-status';
import { WorkspaceComponent } from './workspace-component';
import { NoComponentDir } from '../../consumer/component/exceptions/no-component-dir';
import { Watcher } from './watch/watcher';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { ResolvedComponent } from '../../components/utils/resolved-component';
import { loadRequireableExtensions } from '../../components/utils/load-extensions';
import { RequireableComponent } from '../../components/utils/requireable-component';
import { DependencyLifecycleType } from '../dependency-resolver/types';

export type EjectConfResult = {
  configPath: string;
};

export interface EjectConfOptions {
  propagate?: boolean;
  override?: boolean;
}

export type WorkspaceInstallOptions = {
  variants: string;
  lifecycleType: DependencyLifecycleType;
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
    readonly scope: ScopeExtension,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentExtension,

    readonly isolateEnv: IsolatorExtension,

    private dependencyResolver: DependencyResolverExtension,

    private variants: VariantsExtension,

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
    private onComponentChangeSlot: OnComponentChangeSlot
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

  /**
   * name of the workspace as configured in either `workspace.json`.
   * defaults to workspace root directory name.
   */
  get name() {
    if (this.config.name) return this.config.name;
    const tokenizedPath = this.path.split('/');
    return tokenizedPath[tokenizedPath.length - 1];
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
    const ids = consumerComponents.map((component) => ComponentID.fromLegacy(component.id));
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

  async createNetwork(seeders: string[], opts: IsolateComponentsOptions = {}): Promise<Network> {
    const longProcessLogger = this.logger.createLongProcessLogger('create capsules network');
    legacyLogger.debug(`workspaceExt, createNetwork ${seeders.join(', ')}. opts: ${JSON.stringify(opts)}`);
    const seedersIds = seeders.map((seeder) => this.consumer.getParsedId(seeder));
    const graph = await buildOneGraphForComponents(seedersIds, this.consumer);
    const seederIdsWithVersions = graph.getBitIdsIncludeVersionsFromGraph(seedersIds, graph);
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
    const isolatedEnvironment = await this.createNetwork(
      components.map((c) => c.id.toString()),
      {
        packageManager: 'npm',
      }
    );
    const capsulesMap = isolatedEnvironment.capsules.reduce((accum, curr) => {
      accum[curr.id.toString()] = curr.capsule;
      return accum;
    }, {});
    const ret = components.map((component) => new ResolvedComponent(component, capsulesMap[component.id.toString()]));
    return ret;
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(id: ComponentID): Promise<Component> {
    const consumerComponent = await this.consumer.loadComponent(id._legacy);
    const component = await this.scope.get(id);

    const state = new State(
      new Config(consumerComponent.mainFile, await this.componentExtensions(id, component)),
      ComponentFS.fromVinyls(consumerComponent.files),
      consumerComponent.dependencies,
      consumerComponent
    );

    if (!component) {
      return this.executeLoadSlot(this.newComponentFromState(state));
    }

    component.state = state;
    const workspaceComponent = WorkspaceComponent.fromComponent(component, this);
    return this.executeLoadSlot(workspaceComponent);
  }

  private async executeLoadSlot(component: Component) {
    const entries = this.onComponentLoadSlot.toArray();
    const promises = entries.map(async ([extension, onLoad]) => {
      const data = await onLoad(component);
      const existingExtension = component.state.config.extensions.findExtension(extension);
      if (existingExtension) existingExtension.data = merge(existingExtension.data, data);
      component.state.config.extensions.push(this.getDataEntry(extension, data));
    });

    await Promise.all(promises);

    return component;
  }

  async triggerOnComponentChange(
    id: ComponentID
  ): Promise<Array<{ extensionId: string; results: OnComponentChangeResult }>> {
    const component = await this.get(id);
    const onChangeEntries = this.onComponentChangeSlot.toArray(); // e.g. [ [ '@teambit/compiler', [Function: bound onComponentChange] ] ]
    const results: Array<{ extensionId: string; results: OnComponentChangeResult }> = [];
    await BluebirdPromise.mapSeries(onChangeEntries, async ([extension, onChangeFunc]) => {
      const onChangeResult = await onChangeFunc(component);
      results.push({ extensionId: extension, results: onChangeResult });
    });

    return results;
  }

  private getDataEntry(extension: string, data: { [key: string]: any }): ExtensionDataEntry {
    // TODO: @gilad we need to refactor the extension data entry api.
    return new ExtensionDataEntry(undefined, undefined, extension, undefined, data);
  }

  private newComponentFromState(state: State): Component {
    return new WorkspaceComponent(ComponentID.fromLegacy(state._consumer.id), null, state, new TagMap(), this);
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
    return all.filter((c) => c.id.toString() === pattern);
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
    const filteredComponents = compact(components);
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
    const componentMap = this.consumer.bitMap.getComponent(componentId._legacy, bitMapOptions);
    const relativeComponentDir = componentMap.getComponentDir();
    if (!relativeComponentDir) {
      throw new NoComponentDir(componentId.toString());
    }
    if (options.relative) {
      return relativeComponentDir;
    }

    return path.join(this.path, relativeComponentDir);
  }

  async componentDefaultScope(componentId: ComponentID): Promise<string | undefined> {
    const componentConfigFile = await this.componentConfigFile(componentId);
    if (componentConfigFile && componentConfigFile.defaultScope) {
      return componentConfigFile.defaultScope;
    }
    const componentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    const variantConfig = this.variants.byRootDir(componentDir);
    if (variantConfig && variantConfig.defaultScope) {
      return variantConfig.defaultScope;
    }
    const isVendor = this.isVendorComponent(componentId);
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
    let scopeExtensions;

    const componentConfigFile = await this.componentConfigFile(componentId);
    if (componentConfigFile) {
      configFileExtensions = componentConfigFile.extensions;
    } else {
      scopeExtensions = componentFromScope?.config?.extensions || new ExtensionDataList();
    }
    const componentDir = this.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    const variantConfig = this.variants.byRootDir(componentDir);
    if (variantConfig) {
      variantsExtensions = variantConfig.extensions;
    }
    const isVendor = this.isVendorComponent(componentId);
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
    await Promise.all(extensionsToMerge.map((extensions) => this.resolveExtensionsList(extensions)));

    // In case there are no config file for the component use extension from the scope
    if (!componentConfigFile) {
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
    const componentDir = this.componentDir(id, { ignoreVersion: true });
    let componentConfigFile;
    if (componentDir) {
      componentConfigFile = await ComponentConfigFile.load(componentDir);
    }

    return componentConfigFile;
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionDataList, throwOnError = true): Promise<void> {
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
    const requireableExtensions: any = await this.requireComponents(
      extensionsToLoad.map((id) => this.resolveComponentId(id))
    );
    await loadRequireableExtensions(this.harmony, requireableExtensions, this.logger, throwOnError);
  }

  async requireComponents(ids: ComponentID[]): Promise<RequireableComponent[]> {
    const components = await this.getMany(ids);
    let missingPaths = false;
    const stringIds: string[] = [];
    const resolveP = components.map(async (component) => {
      stringIds.push(component.id.toString());
      const packageName = componentIdToPackageName(component.state._consumer);
      const localPath = path.join(this.path, 'node_modules', packageName);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const requireFunc = () => require(localPath);
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
      this.logger.debug(`installing the folloing packages: ${packages.join()}`);
    }
    this.logger.debug(`installing dependencies in workspace with options`, options);
    const components = await this.list();
    const stringIds = components.map((component) => component.id.toString());
    const installer = this.dependencyResolver.getInstaller();
    const installationMap = await this.getComponentsDirectory([]);
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy() || {};
    const rootDepsObject = {
      dependencies: {
        ...workspacePolicy.dependencies,
      },
      peerDependencies: {
        ...workspacePolicy.peerDependencies,
      },
    };
    await installer.install(this.path, rootDepsObject, installationMap);
    // TODO: add the links results to the output
    this.logger.setStatusLine('linking components');
    await link(stringIds, false);
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
  async resolveComponentId(
    id: string | ComponentID | BitId,
    assumeIdWithScope = false,
    useVersionFromBitmap = true
  ): Promise<ComponentID> {
    if (!assumeIdWithScope) {
      const legacyId = this.consumer.getParsedId(id.toString(), useVersionFromBitmap);
      return ComponentID.fromLegacy(legacyId);
    }
    // remove the scope before search in bitmap
    let stringIdWithoutScope;
    if (typeof id === 'string') {
      stringIdWithoutScope = BitId.parse(id, true).toStringWithoutScope();
    } else if (id instanceof BitId) {
      stringIdWithoutScope = id.toStringWithoutScope();
    } else {
      stringIdWithoutScope = id._legacy.toStringWithoutScope();
    }
    const legacyId = this.consumer.getParsedId(stringIdWithoutScope, useVersionFromBitmap);
    return ComponentID.fromLegacy(legacyId);
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
        const resolvedId = await this.resolveComponentId(extensionEntry.extensionId, true, false);
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
