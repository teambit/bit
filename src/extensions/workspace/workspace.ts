import { Consumer } from '../../consumer';
import { Scope } from '../scope';
import { Component, ComponentFactory, ComponentID } from '../component';
import ComponentsList from '../../consumer/component/components-list';
import { ComponentHost } from '../../shared-types';
import { BitIds } from '../../bit-id';
import ConsumerComponent from '../../consumer/component';

/**
 * API of the Bit Workspace
 */
export default class Workspace implements ComponentHost {
  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    private consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentFactory,

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
   * get a component from workspace
   * @param id component ID
   */
  async get(id: string | ComponentID): Promise<Component | undefined> {
    const componentId = typeof id === 'string' ? ComponentID.fromString(id) : id;
    const legacyComponent = await this.consumer.loadComponent(componentId._legacy);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }

  async getMany(ids: string[]) {
    const componentIds = ids.map(id => ComponentID.fromString(id)._legacy);
    const legacyComponents = await this.consumer.loadComponents(BitIds.fromArray(componentIds));
    // @ts-ignore
    return this.transformLegacyComponents(legacyComponents);
  }
}
