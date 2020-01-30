import { Consumer } from '../../consumer';
import { Scope } from '../../scope/scope.api';
import { Component, ComponentFactory, ComponentID } from '../../component';
import ComponentsList from '../../consumer/component/components-list';
import { ComponentHost } from '../../shared-types';

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
    private componentFactory: ComponentFactory
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
    const componentList = new ComponentsList(this.consumer);
    const consumerComponents = await componentList.getAuthoredAndImportedFromFS();
    return consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
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
}
