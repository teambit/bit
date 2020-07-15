import path from 'path';
import { Harmony } from '@teambit/harmony';
import BluebirdPromise from 'bluebird';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';
import { Consumer, loadConsumer } from '../../consumer';
import { ScopeExtension } from '../scope';
import { Component, ComponentID, ComponentExtension, State, ComponentFactory, ComponentFS, TagMap } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { BitId } from '../../bit-id';
import { IsolatorExtension } from '../isolator';
import { ResolvedComponent } from '../utils/resolved-component/resolved-component';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative, PathOsBased } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { DependencyResolverExtension } from '../dependency-resolver';
import { WorkspaceExtConfig, WorkspaceComponentConfig } from './types';
import { LogPublisher } from '../types';
import { loadResolvedExtensions } from '../utils/load-extensions';
import { Variants } from '../variants';
import { ComponentScopeDirMap } from '../config/workspace-config';
import legacyLogger from '../../logger/logger';
import { removeExistingLinksInNodeModules, symlinkCapsulesInNodeModules } from './utils';
import { ComponentConfigFile } from './component-config-file';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import GeneralError from '../../error/general-error';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';
import { pathIsInside } from '../../utils';
import Config from '../component/config';

export type EjectConfResult = {
  configPath: string;
};

export interface EjectConfOptions {
  propagate?: boolean;
  override?: boolean;
}

const DEFAULT_VENDOR_DIR = 'vendor';

/**
 * API of the Bit Workspace
 */
export default class Workspace implements ComponentFactory {
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

    private variants: Variants,

    private logger: LogPublisher,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony
  ) {
    this.owner = this.config?.defaultOwner;
  }

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
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

  /**
   * provides status of all components in the workspace.
   */
  status() {}

  /**
   * list all workspace components.
   */
  async list(): Promise<Component[]> {
    const consumerComponents = await this.componentList.getAuthoredAndImportedFromFS();
    const ids = consumerComponents.map(component => ComponentID.fromLegacy(component.id));
    return this.getMany(ids);
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

  async loadCapsules(bitIds: string[]) {
    // throw new Error("Method not implemented.");
    const components = await this.load(bitIds);
    return components.map(comp => comp.capsule);
  }
  /**
   * fully load components, including dependency resolution and prepare them for runtime.
   * @todo: remove the string option, use only BitId
   * fully load components, including dependency resolution and prepare them for runtime.
   */
  async load(ids: Array<BitId | string>): Promise<ResolvedComponent[]> {
    const componentIdsP = ids.map(id => this.resolveComponentId(id));
    const componentIds = await Promise.all(componentIdsP);
    const components = await this.getMany(componentIds);
    const isolatedEnvironment = await this.isolateEnv.createNetworkFromConsumer(
      components.map(c => c.id.toString()),
      this.consumer,
      {
        packageManager: 'npm'
      }
    );
    const capsulesMap = isolatedEnvironment.capsules.reduce((accum, curr) => {
      accum[curr.id.toString()] = curr.capsule;
      return accum;
    }, {});
    const ret = components.map(component => new ResolvedComponent(component, capsulesMap[component.id.toString()]));
    return ret;
  }

  /**
   * get a component from workspace
   * @param id component ID
   */
  async get(id: ComponentID): Promise<Component> {
    const consumerComponent = await this.consumer.loadComponent(id._legacy);

    const state = new State(
      new Config(consumerComponent.mainFile, await this.componentExtensions(id)),
      ComponentFS.fromVinyls(consumerComponent.files),
      consumerComponent.dependencies,
      consumerComponent
    );

    const component = await this.scope.get(id);
    if (!component) return this.newComponentFromState(state);

    component.state = state;
    return component;
  }

  private newComponentFromState(state: State): Component {
    return new Component(ComponentID.fromLegacy(state._consumer.id), null, state, new TagMap(), this);
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
    const componentDir = this.componentDir(id, { ignoreVersion: true });
    if (!componentDir) {
      throw new GeneralError(`the component ${id.toString()} doesn't have a root dir`);
    }
    const componentConfigFile = new ComponentConfigFile(componentId, extensions, options.propagate);
    await componentConfigFile.write(componentDir, { override: options.override });
    return {
      configPath: ComponentConfigFile.composePath(componentDir)
    };
  }

  // @gilad needs to implement on variants
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async byPattern(pattern: string): Promise<Component[]> {
    // @todo: this is a naive implementation, replace it with a real one.
    const all = await this.list();
    return all.filter(c => c.id.toString() === pattern);
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<ComponentID>): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const componentsP = BluebirdPromise.mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      return this.get(id);
    });
    const components = await componentsP;

    return components;
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
  ): PathOsBased | undefined {
    const componentMap = this.consumer.bitMap.getComponent(componentId._legacy, bitMapOptions);
    const relativeComponentDir = componentMap.getComponentDir();
    if (options.relative) {
      return relativeComponentDir;
    }

    if (relativeComponentDir) {
      return path.join(this.path, relativeComponentDir);
    }
    return undefined;
  }

  /**
   * Calculate the component config based on:
   * the component.json file in the component folder
   * matching pattern in the variants config
   * defaults extensions from workspace config
   * @param componentId
   */
  async componentExtensions(componentId: ComponentID): Promise<ExtensionDataList> {
    const data = await this.workspaceComponentConfig(componentId);
    // const config = new ComponentConfig(data.componentExtensions);
    // return config;
    return data.componentExtensions;
  }

  async workspaceComponentConfig(componentId: ComponentID): Promise<WorkspaceComponentConfig> {
    // TODO: consider caching this result
    let defaultScope;
    let configFileExtensions;
    let variantsExtensions;
    let wsDefaultExtensions;

    const componentConfigFile = await this.componentConfigFile(componentId);
    if (componentConfigFile) {
      configFileExtensions = componentConfigFile.extensions;
      defaultScope = componentConfigFile.defaultScope;
    }
    const variantConfig = this.variants.byId(componentId);
    if (variantConfig) {
      variantsExtensions = variantConfig.componentExtensions;
      defaultScope = defaultScope || variantConfig.componentWorkspaceMetaData.defaultScope;
    }
    const isVendor = this.isVendorComponent(componentId);
    if (!isVendor) {
      wsDefaultExtensions = this.getDefaultExtensions();
      defaultScope = defaultScope || this.config.defaultScope;
    }
    // We don't stop on each step because we want to merge the default scope even if propagate=false but the default scope is not defined
    const extensionsToMerge: ExtensionDataList[] = [];
    if (configFileExtensions) {
      extensionsToMerge.push(configFileExtensions);
    }
    let continuePropagating = componentConfigFile?.propagate ?? true;
    if (variantsExtensions && continuePropagating) {
      // Put it in the start to make sure the config file is stronger
      extensionsToMerge.unshift(variantsExtensions);
    }
    continuePropagating = continuePropagating && (variantConfig?.propagate ?? true);
    // Do not apply default extensions on the default extensions (it will create infinite loop when loading them)
    const isDefaultExtension = wsDefaultExtensions.findExtension(componentId.toString(), true, true);
    if (wsDefaultExtensions && continuePropagating && !isDefaultExtension) {
      // Put it in the start to make sure the config file is stronger
      extensionsToMerge.unshift(wsDefaultExtensions);
    }
    // TODO: do not require if for tagged components that already has a real scope
    if (!defaultScope) {
      throw new GeneralError(`component ${componentId.toString()} must have a default scope`);
    }
    const splittedScope = defaultScope.split('.');
    const defaultOwner = splittedScope.length === 1 ? defaultScope : splittedScope[0];
    let mergedExtensions = ExtensionDataList.mergeConfigs(extensionsToMerge);
    let componentIdWithScope = componentId._legacy;
    if (!componentIdWithScope.hasScope()) {
      componentIdWithScope = componentId._legacy.clone().changeScope(defaultScope);
    }
    // Remove self from the list to prevent infinite loops (usually happen when using * as variant)
    mergedExtensions = mergedExtensions.remove(componentIdWithScope);
    // TODO: this is a very very ugly hack until we register everything with the scope name to bitmap (even new components)
    // TODO: then it should be just deleted. for now we want to make sure we are aligned with the bitmap entries
    mergedExtensions.forEach(extensionEntry => {
      const stringId = extensionEntry.extensionId?.toStringWithoutScope();
      const foundId = getBitId(stringId, this.consumer);
      extensionEntry.extensionId = foundId;
    });

    return {
      componentExtensions: mergedExtensions,
      componentWorkspaceMetaData: {
        defaultScope,
        defaultOwner
      }
    };
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
    // Shouldn't happen for harmony workspaces
    if (!relativeComponentDir) {
      return false;
    }
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
  async loadExtensions(extensions: ExtensionDataList): Promise<void> {
    const extensionsIds: string[] = [];
    // TODO: this is a very very ugly hack until we register everything with the scope name to bitmap (even new components)
    // TODO: then it should be replace by "const extensionsIds = extensions.ids";. for now we want to make sure we are aligned with the bitmap entries
    extensions.forEach(extensionEntry => {
      let extensionIdString;
      // Core extension
      if (!extensionEntry.extensionId) {
        extensionIdString = extensionEntry.stringId;
      } else {
        const stringId = extensionEntry.extensionId?.toStringWithoutScope();
        const foundId = getBitId(stringId, this.consumer);
        extensionIdString = foundId.toString();
      }
      extensionsIds.push(extensionIdString);
    });
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    if (!extensionsToLoad.length) return;
    let resolvedExtensions: ResolvedComponent[] = [];
    resolvedExtensions = await this.load(extensionsToLoad);
    // TODO: change to use the new reporter API, in order to implement this
    // we would have to have more than 1 instance of the Reporter extension (one for the workspace and one for the CLI command)
    //
    // We need to think of a facility to show "system messages that do not stop execution" like this. We might want to (for example)
    // have each command query the logger for such messages and decide whether to display them or not (according to the verbosity
    // level passed to it).
    await loadResolvedExtensions(this.harmony, resolvedExtensions, legacyLogger);
  }

  /**
   * Install dependencies for all components in the workspace
   *
   * @returns
   * @memberof Workspace
   */
  async install() {
    //      this.reporter.info('Installing component dependencies');
    //      this.reporter.setStatusText('Installing');
    const components = await this.list();
    // this.reporter.info('Isolating Components');
    const isolatedEnvs = await this.load(components.map(c => c.id.toString()));
    // this.reporter.info('Installing workspace dependencies');
    await removeExistingLinksInNodeModules(isolatedEnvs);
    await this.dependencyResolver.folderInstall(process.cwd());
    await symlinkCapsulesInNodeModules(isolatedEnvs);
    // this.reporter.end();
    return isolatedEnvs;
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
    // TODO: @gilad make sure to check and remove default scope.
    // TODO: we pass here true as second args (for case of we use this to resolve to capsule)
    // This might need to be passed with false in some cases. so need to improve it.
    const legacyId = this.consumer.getParsedId(id.toString(), true);
    return ComponentID.fromLegacy(legacyId);
  }
}

// TODO: handle this properly when we decide about using bitId vs componentId
// if it's still needed we should move it other place, it will be used by many places
function getBitId(id, consumer): BitId {
  if (id instanceof ComponentID) return id._legacy;
  if (typeof id === 'string') return consumer.getParsedId(id);
  return id;
}
