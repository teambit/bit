import path from 'path';
import { Harmony } from '@teambit/harmony';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';
import { Consumer, loadConsumer } from '../../consumer';
import { ScopeExtension } from '../scope';
import { Component, ComponentFactory, ComponentID } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { BitIds, BitId } from '../../bit-id';
import { Isolator } from '../isolator';
import ConsumerComponent from '../../consumer/component';
import { ResolvedComponent } from '../utils/resolved-component/resolved-component';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative, PathOsBased } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { IExtensionConfigList } from '../../consumer/config';
import { DependencyResolver } from '../dependency-resolver';
import { WorkspaceExtConfig } from './types';
import { ComponentHost, LogPublisher } from '../types';
import { loadResolvedExtensions } from '../utils/load-extensions';
import { Variants } from '../variants';
import LegacyComponentConfig from '../../consumer/config';
import { ComponentScopeDirMap } from '../config/workspace-config';
import legacyLogger from '../../logger/logger';

/**
 * API of the Bit Workspace
 */
export default class Workspace implements ComponentHost {
  owner?: string;
  componentsScopeDirsMap: ComponentScopeDirMap;

  constructor(
    private config: WorkspaceExtConfig,
    /**
     * private access to the legacy consumer instance.
     */
    public consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: ScopeExtension,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentFactory,

    readonly isolateEnv: Isolator,

    private dependencyResolver: DependencyResolver,

    private variants: Variants,

    private logger: LogPublisher,

    private componentList: ComponentsList = new ComponentsList(consumer),

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony
  ) {
    this.owner = this.config?.defaultOwner;
    this.componentsScopeDirsMap = this.config?.components || [];
  }

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
  }

  /**
   * provides status of all components in the workspace.
   */
  status() {}

  /**
   * list all workspace components.
   */
  async list() {
    const consumerComponents = await this.componentList.getAuthoredAndImportedFromFS();
    return this.transformLegacyComponents(consumerComponents);
  }

  private async transformLegacyComponents(consumerComponents: ConsumerComponent[]) {
    const transformP = consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
    return Promise.all(transformP);
  }

  /**
   * list all modified components in the workspace.
   */
  async modified() {
    const consumerComponents = await this.componentList.listModifiedComponents(true);
    // @ts-ignore
    return this.transformLegacyComponents(consumerComponents);
  }

  /**
   * list all new components in the workspace.
   */
  async newComponents() {
    const consumerComponents = await this.componentList.listNewComponents(true);
    // @ts-ignore
    return this.transformLegacyComponents(consumerComponents);
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
    const components = await this.getMany(ids);
    const isolatedEnvironment = await this.isolateEnv.createNetworkFromConsumer(
      components.map(c => c.id.toString()),
      this.consumer,
      {
        packageManager: 'npm'
      }
    );
    const capsulesMap = isolatedEnvironment.capsules.reduce((accum, curr) => {
      accum[curr.id.toString()] = curr.value;
      return accum;
    }, {});
    const ret = components.map(component => new ResolvedComponent(component, capsulesMap[component.id.toString()]));
    return ret;
  }

  /**
   * @todo: remove the string option, use only BitId
   * get a component from workspace
   * @param id component ID
   */
  async get(id: string | BitId | ComponentID): Promise<Component | undefined> {
    const getBitId = (): BitId => {
      if (id instanceof ComponentID) return id._legacy;
      if (typeof id === 'string') return this.consumer.getParsedId(id);
      return id;
    };
    const componentId = getBitId();
    if (!componentId) return undefined;
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }

  // @gilad needs to implment on variants
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async byPattern(pattern: string): Promise<Component[]> {
    return [];
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<BitId | string>) {
    const componentIds = ids.map(id => (typeof id === 'string' ? this.consumer.getParsedId(id) : id));
    const idsWithoutEmpty = compact(componentIds);
    const legacyComponents = await this.consumer.loadComponents(BitIds.fromArray(idsWithoutEmpty));
    // @ts-ignore
    return this.transformLegacyComponents(legacyComponents.components);
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
    const addComponent = new AddComponents(
      { consumer: this.consumer },
      { componentPaths, id, main, override, allowFiles: false, allowRelativePaths: false }
    );
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
  componentDir(componentId: BitId, relative = false): PathOsBased | undefined {
    const componentMap = this.consumer.bitMap.getComponent(componentId);
    const relativeComponentDir = componentMap.getComponentDir();
    if (relative) {
      return relativeComponentDir;
    }

    if (relativeComponentDir) {
      return path.join(this.path, relativeComponentDir);
    }
    return undefined;
  }

  // TODO: gilad - add return value
  /**
   * Calculate the component config based on the component.json file in the component folder and the matching
   * pattern in the variants config
   * @param componentId
   */
  // componentConfig(componentId: BitId) {
  // TODO: read the component.json file and merge it inside
  // const inlineConfig = this.inlineComponentConfig(componentId);
  // const variantConfig = this.variants.getComponentConfig(componentId);
  // For legacy configs it will be undefined.
  // This should be changed once we have basic dependnecy-resolver and pkg extensions see more at src/extensions/config/workspace-config.ts
  // under transformLegacyPropsToExtensions
  // if (!variantConfig) {
  // }
  // }

  // TODO: gilad - add return value
  /**
   * return the component config from its folder (bit.json / package.json / component.json)
   * @param componentId
   */
  private inlineComponentConfig(componentId: BitId) {
    // TODO: Load from component.json file
    const legacyConfigProps = LegacyComponentConfig.loadConfigFromFolder({
      workspaceDir: this.path,
      componentDir: this.componentDir(componentId)
    });
    // TODO: make sure it's a new format
    return legacyConfigProps;
  }

  // async loadComponentExtensions(componentId: BitId): Promise<void> {
  //   const config = this.componentConfig(componentId);
  //   const extensions = config.extensions
  //     ? ExtensionConfigList.fromObject(config.extensions)
  //     : ExtensionConfigList.fromArray([]);
  //   return this.loadExtensions(extensions);
  // }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: IExtensionConfigList): Promise<void> {
    const extensionsIds = extensions.ids;
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    let resolvedExtensions: ResolvedComponent[] = [];
    resolvedExtensions = await this.load(extensionsToLoad);
    // TODO: change to use the new reporter API, in order to implement this
    // we would have to have more than 1 instance of the Reporter extension (one for the workspace and one for the CLI command)
    //
    // We need to think of a facility to show "system messages that do not stop execution" like this. We might want to (for example)
    // have each command query the logger for such messages and decide whether to display them or not (according to the verbosity
    // level passed to it).
    return loadResolvedExtensions(this.harmony, resolvedExtensions, legacyLogger);
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
}
