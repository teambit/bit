import { Harmony } from '@teambit/harmony';
import { difference } from 'ramda';
import { compact } from 'ramda-adjunct';
import { Consumer, loadConsumer } from '../../consumer';
import { Scope } from '../scope';
import { Component, ComponentFactory, ComponentID } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { BitIds, BitId } from '../../bit-id';
import { Isolator } from '../isolator';
import ConsumerComponent from '../../consumer/component';
import { ResolvedComponent } from '../utils/resolved-component/resolved-component';
import AddComponents from '../../consumer/component-ops/add-components';
import { PathOsBasedRelative } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { ExtensionConfigList } from '../../consumer/config/extension-config-list';
import { ComponentScopeDirMap } from '../config/workspace-settings';
import { DependencyResolver } from '../dependency-resolver';
import { WorkspaceExtConfig } from './types';
import { ComponentHost, LogPublisher } from '../types';
import { loadResolvedExtensions } from '../utils/load-extensions';
import { Variants } from '../variants';
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
    readonly scope: Scope,

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
   * Calculate the component config based on the component.json file in the component folder and the matching
   * pattern in the variants config
   * @param componentId
   */
  componentConfig(componentId: BitId) {
    // TODO: read the component.json file and merge it inside
    return this.variants.getComponentConfig(componentId);
  }

  async loadComponentExtensions(componentId: BitId): Promise<void> {
    const config = this.componentConfig(componentId);
    const extensions = config.extensions
      ? ExtensionConfigList.fromObject(config.extensions)
      : ExtensionConfigList.fromArray([]);
    return this.loadExtensions(extensions);
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionConfigList): Promise<void> {
    const extensionsIds = extensions.ids;
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    let resolvedExtensions: ResolvedComponent[] = [];
    resolvedExtensions = await this.load(extensionsToLoad);
    return loadResolvedExtensions(this.harmony, resolvedExtensions, this.logger);
  }

  /**
   * this should be rarely in-use.
   * it's currently used by watch extension as a quick workaround to load .bitmap and the components
   */
  async _reloadConsumer() {
    this.consumer = await loadConsumer(this.path, true);
  }

  get defaultDirectory(): string {
    return this.config.defaultDirectory;
  }
}
