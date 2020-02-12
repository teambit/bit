import { Consumer } from '../../consumer';
import { Scope } from '../scope';
import { Component, ComponentFactory } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { ComponentHost } from '../../shared-types';
import { BitIds, BitId } from '../../bit-id';
import { Capsule } from '../capsule';
import ConsumerComponent from '../../consumer/component';
import { ResolvedComponent } from './resolved-component';

/**
 * API of the Bit Workspace
 */
export default class Workspace implements ComponentHost {
  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    readonly consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentFactory,

    private capsule: Capsule,

    private componentList: ComponentsList = new ComponentsList(consumer)
  ) {}

  /**
   * Workspace's configuration
   */
  get config() {
    return this.consumer.config;
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
    return consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
  }

  private transformLegacyComponents(consumerComponents: ConsumerComponent[]) {
    return consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
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

  /**
   * fully load components, including dependency resolution and prepare them for runtime.
   * @todo: remove the string option, use only BitId
   * fully load components, inclduing dependency resuoltion and prepare them for runtime.
   */
  async load(ids: Array<BitId | string>) {
    const components = await this.getMany(ids);
    const capsules = await this.capsule.create(components);
    const capsulesMap = capsules.reduce((accum, curr) => {
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
  async get(id: string | BitId): Promise<Component | undefined> {
    const componentId = typeof id === 'string' ? this.consumer.getParsedId(id) : id;
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }

  /**
   * @todo: remove the string option, use only BitId
   */
  async getMany(ids: Array<BitId | string>) {
    const componentIds = ids.map(id => (typeof id === 'string' ? this.consumer.getParsedId(id) : id));
    const legacyComponents = await this.consumer.loadComponents(BitIds.fromArray(componentIds));
    // @ts-ignore
    return this.transformLegacyComponents(legacyComponents.components);
  }
}
